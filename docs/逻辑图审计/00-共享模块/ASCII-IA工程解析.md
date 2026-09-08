---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 00 共享模块：ASCII IA 工程解析

> **业务区域**：为所有市场任务提供登录工作区、租户隔离、可靠事件反馈和受控研究运行时
> **入口 / 根节点**：`/login` / `/register` / `AppModule` / `TransactionManager` / `Projector` / `createAgentRuntime()`
> **相关文件**：`apps/web` / `apps/api/src/common` / `apps/projector` / `apps/worker` / `packages/policies` / `packages/database` / `packages/agents` / `packages/connectors`

## 1. 共享能力总图

~~~text
00 共享模块
│
├─ 01-auth-workspace
│  └─ 账户 → Workspace → JWT Session → AppShell
├─ 02-tenant-permission
│  └─ role permission + tenant predicate + PostgreSQL FORCE RLS
├─ 03-command-event-projection
│  └─ mutation → domain_events → outbox_events → Projector → SSE
└─ 04-agent-connector-runtime
   └─ Workflow Activity → Agent Skill → permitted Connector → Evidence / Artifact
~~~

## 2. 被哪些业务区域消费

~~~text
市场任务启动 ───────┐
企业能力证据 ───────┤
市场进入路线 ───────┤
产业生态与目标 ─────┤
利益角色与触达 ─────┼→ 认证 + tenant + event + agent runtime
市场进入机会 ───────┤
行动卡与人工外联 ───┤
互动与刷新 ─────────┤
决策追踪与经营 ─────┘
~~~

## 3. 共享运行顺序

~~~text
用户通过 AuthForm 登录
    ↓ access_token Cookie
Web 命令携带 credentials + Idempotency-Key
    ↓
API AuthGuard / ZodPipe / requirePermission()
    ↓ tenant transaction
业务事实 + Domain Event + Outbox
    ↓
Temporal / Agent / Connector 推进长期研究
    ↓
Projector 生成 Dashboard / Progress / Timeline / Run Read Model
    ↓ pg_notify + SSE
Web router.refresh() 读取新状态
~~~

## 4. 当前整体边界

~~~text
当前已实现
├─ owner / editor / viewer 权限集合
├─ HTTP-only JWT Cookie 与 Bearer 兼容
├─ tenant_id 事务上下文与 PostgreSQL FORCE RLS
├─ 幂等记录、领域事件、Outbox、投影检查点和失败重试
└─ 12 个 Agent Skill、Mock/Live Model 与 Connector 注册

当前未确认
├─ 本轮未启动数据库、API、Worker、Projector 或 Web
├─ 未实测 Cookie、RLS、SSE 重连和 Outbox 租约
└─ 运行时吞吐、故障恢复时长与外部 Provider 可用性未确认
~~~

## 5. 原子问题导航

~~~text
00-共享模块/
├─ 01-auth-workspace/ASCII-IA工程解析.md
├─ 02-tenant-permission/ASCII-IA工程解析.md
├─ 03-command-event-projection/ASCII-IA工程解析.md
└─ 04-agent-connector-runtime/ASCII-IA工程解析.md
~~~

- [账户、会话与工作区](./01-auth-workspace/ASCII-IA工程解析.md)
- [租户隔离与权限](./02-tenant-permission/ASCII-IA工程解析.md)
- [命令、事件、投影与 SSE](./03-command-event-projection/ASCII-IA工程解析.md)
- [Agent 与 Connector 运行时](./04-agent-connector-runtime/ASCII-IA工程解析.md)

## 6. 一句话工程解释

~~~text
共享模块先确认用户属于哪个 Workspace、允许做什么，再把每次业务写入变成可恢复事件，并只让声明过权限的 Agent 与 Connector 在该租户范围内工作
~~~
