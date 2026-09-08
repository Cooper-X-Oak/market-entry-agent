---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T18:25:00+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 共享模块 02：tenant-permission 租户隔离与权限：ASCII IA 工程解析

> **业务问题**：保证用户只能在所属 Workspace 内执行其角色允许的市场任务操作
> **入口 / 根节点**：`AuthGuard.canActivate()` / `requirePermission()` / `TransactionManager.run()` / PostgreSQL RLS
> **相关文件**：`apps/api/src/common/auth.guard.ts` / `packages/policies/src/index.ts` / `packages/database/src/transaction.ts` / `packages/database/migrations/0002_service_roles_and_rls.sql`

## 1. 总体架构

~~~text
租户隔离与权限
├─ 身份层：JWT → { userId, tenantId, role, email }
├─ 权限层：permissionsByRole + requirePermission()
├─ 查询层：Repository 携带 tenantId / missionId
├─ 事务层：SET LOCAL app.tenant_id / actor / correlation
└─ 数据库层：FORCE ROW LEVEL SECURITY
~~~

### 层间工作顺序

~~~text
Cookie 或 Bearer Token
    ↓ AuthGuard
request.auth
    ↓ Controller
requirePermission(auth.role, permission)
    ↓ Service / Repository
TransactionManager.run({ tenantId, actor, correlationId })
    ↓ set_config(..., true)
PostgreSQL RLS + tenant predicate
    ↓
只返回或修改当前 Workspace 数据
~~~

## 2. 身份与权限入口信息架构

~~~text
AuthGuard.canActivate()
├─ @Public() → 跳过认证
├─ cookies.access_token
├─ Authorization: Bearer ...
├─ JwtService.verifyAsync(secret=JWT_SECRET)
└─ tenantRoleSchema.parse(payload.role)

Permission
├─ workspace:manage
├─ mission:read / mission:write
├─ route:approve / action:approve
├─ interaction:write
├─ export:approved / export:all
└─ run:read
~~~

## 3. 角色能力信息架构

~~~text
owner
└─ 全部 9 项 Permission

editor
├─ mission:read / mission:write
├─ route:approve / action:approve
├─ interaction:write
├─ export:approved
└─ run:read

viewer
├─ mission:read
└─ export:approved

requirePermission() 失败
└─ DomainError(code='AUTH_PERMISSION_DENIED')
~~~

## 4. 事务与数据库隔离信息架构

~~~text
TransactionManager.run(context)
└─ db.transaction
   ├─ set_config('app.tenant_id', tenantId, true)
   ├─ set_config('app.actor_type', actor.type, true)
   ├─ set_config('app.actor_id', actor.id, true)
   ├─ set_config('app.correlation_id', correlationId, true)
   └─ work(transaction)

直接 tenant 表
└─ USING tenant_id=current_tenant_id()
   + WITH CHECK tenant_id=current_tenant_id()
   + FORCE ROW LEVEL SECURITY

子表
├─ source_snapshots → sources.tenant_id
├─ document_chunks → source_snapshots → sources
├─ artifact_versions → artifacts.tenant_id
├─ claim_evidence_links → claims.tenant_id
├─ mission_entities → missions.tenant_id
└─ opportunity_* → opportunities.tenant_id
~~~

## 5. 请求执行与失败流程

~~~text
请求无 Token
└─ 401 Authentication required

Token 失效、签名错误或 role 非法
└─ 401 Session expired or invalid

Token 有效但权限不足
└─ AUTH_PERMISSION_DENIED

伪造其他 tenant 的 resourceId
├─ Repository tenant predicate → not found
└─ 即使漏写 predicate → FORCE RLS 拒绝跨租户行

事务结束
└─ set_config(..., true) 是 transaction-local，不泄漏到连接下一次使用
~~~

## 6. 数据库角色与资源流程

~~~text
imea_migrator
└─ DDL / migration

imea_api
├─ API 业务读写
└─ tenant_members_auth_lookup 允许按 app.auth_user_id 登录查 membership

imea_worker
└─ Worker 业务读写，仍受 tenant RLS

imea_projector
├─ claim_outbox_batch() 领取事件
├─ tenant 上下文内写 Read Model
└─ projection_checkpoints / projection_failures
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ Controller 全局 AuthGuard
├─ 角色到权限的显式静态映射
├─ Repository tenant 条件与事务上下文
├─ 直接表和主要子表的 FORCE RLS
└─ API、Worker、Projector 分离数据库角色

当前缺口
├─ Permission 粒度是功能级，未发现 Mission 级成员授权或字段级权限
├─ JWT 内 role 在签发后固定到过期，成员角色变更不会主动撤销旧 Token
└─ users 与 tenants 是全局根表，隔离主要依赖服务查询条件和 membership 流程

当前未确认
└─ 本轮未连接 PostgreSQL，RLS Policy、数据库角色权限与连接串身份未运行验证
~~~

## 8. 一句话工程解释

~~~text
JWT 把 userId、tenantId 和 role 带进请求，Policy 先限制允许的业务动作，TransactionManager 再把租户写入 PostgreSQL 会话，由 Repository 条件和 FORCE RLS 共同阻断跨 Workspace 访问
~~~

## 9. M1 实施与运行验收更新

模块状态：已验收

`AuthGuard` 现在每次请求都按 JWT 的 `userId + tenantId` 查询当前 active `tenant_members`，并用数据库当前 role 构造 Auth Context，不再把签发时的旧 role 当作最终权限事实。

实际权限用例使用同一旧 owner Token：当前 role=viewer 时 `GET Mission` 返回 200、`POST pause` 返回 403 `AUTH_PERMISSION_DENIED`；当前 role=editor 时 pause 和 resume 均返回 200。用例结束后 membership 已恢复 owner。PostgreSQL Tenant Context、RLS 和各服务数据库身份已在真实 devserver 上共同工作。

Mission 级成员授权与字段级权限仍不是当前模型的一部分；这是后续粒度扩展，不影响 M1 的 Workspace Role Gate。
