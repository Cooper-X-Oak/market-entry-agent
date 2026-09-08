---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T18:25:00+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 共享模块 01：auth-workspace 账户、会话与工作区：ASCII IA 工程解析

> **业务问题**：让用户注册或登录一个 Workspace，并以明确角色进入工作台
> **入口 / 根节点**：`/register` / `/login` / `POST /api/v1/auth/register` / `POST /api/v1/auth/login`
> **相关文件**：`apps/web/components/auth-form.tsx` / `apps/api/src/auth/auth.controller.ts` / `apps/api/src/auth/auth.service.ts` / `apps/api/src/workspace/workspace.service.ts` / `packages/database/src/schema/auth.ts`

## 1. 总体架构

~~~text
账户、会话与工作区
├─ Web：AuthForm(mode='login' | 'register')
├─ API：AuthController + WorkspaceController
├─ 领域服务：AuthService + WorkspaceService
├─ 安全资源：argon2 + JWT + HTTP-only Cookie
└─ PostgreSQL：users + tenants + tenant_members
~~~

### 层间工作顺序

~~~text
注册或登录表单
    ↓ apiClient()
AuthController + ZodPipe
    ↓
AuthService.register() 或 login()
    ↓
users / tenants / tenant_members
    ↓ JWT 8h
access_token Cookie
    ↓
/dashboard → AppShell
~~~

## 2. 页面与接口信息架构

~~~text
/register
└─ AuthForm(mode='register')
   ├─ name
   ├─ workspaceName
   ├─ email
   └─ password(minLength=10)

/login
└─ AuthForm(mode='login')
   ├─ email
   └─ password

/api/v1/auth
├─ POST /register   Public
├─ POST /login      Public
├─ POST /logout     AuthGuard
└─ GET  /me         AuthGuard

/api/v1/workspace
├─ GET / PATCH
└─ GET /members / POST /members / PATCH /members/:memberId
~~~

## 3. 表现与响应信息架构

~~~text
AuthForm
├─ .auth-form / .auth-fields / .auth-submit
├─ pending=true → “正在处理…” + disabled
├─ error!='' → .error-state[role='alert']
└─ success → router.push('/dashboard') + router.refresh()

Cookie
├─ httpOnly=true
├─ sameSite='lax'
├─ secure=(NODE_ENV==='production')
├─ path='/'
└─ maxAge=8小时
~~~

## 4. 运行时与领域逻辑信息架构

~~~text
AuthService.register(input)
├─ email.trim().toLowerCase()
├─ argon2.hash(type=2, memoryCost=19456, timeCost=2)
└─ db.transaction
   ├─ 拒绝重复 users.email
   ├─ INSERT users
   ├─ INSERT tenants(slug + random suffix)
   ├─ SET app.tenant_id
   └─ INSERT tenant_members(role='owner')

AuthService.login(input)
├─ 查 users.email
├─ argon2.verify(passwordHash, password)
├─ SET app.auth_user_id
├─ 查第一个 status='active' membership + tenant
├─ UPDATE users.last_login_at
└─ sign({ sub, tenantId, role, email }, expiresIn='8h')
~~~

## 5. 用户交互与状态流程

~~~text
注册
├─ 成功 → user + tenant + owner membership + Cookie → /dashboard
├─ 重复邮箱 → AUTH_EMAIL_EXISTS
└─ 任一 INSERT 失败 → 注册事务回滚

登录
├─ 凭据正确且有 active membership → Cookie → /dashboard
├─ 用户不存在或密码错误 → AUTH_INVALID_CREDENTIALS
└─ 无 active membership → AUTH_INVALID_CREDENTIALS

退出
└─ POST /logout → clearCookie('access_token') → { loggedOut:true }
~~~

## 6. 数据与外部依赖流程

~~~text
注册输入
    ↓ argon2
users.password_hash
    ↓ transaction
tenants + tenant_members(owner)
    ↓ JwtService
access_token

Workspace 管理
├─ WorkspaceService.get/update → tenants
├─ members() → tenant_members JOIN users
├─ addMember() → 用户必须先注册
└─ updateMember() → role / active / invited / suspended
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 注册、登录、退出、当前身份 API
├─ 注册时原子创建 User、Tenant 和 Owner Membership
├─ Workspace 名称与成员角色/状态 API
└─ Web 登录注册页和通用 AppShell

当前缺口
├─ 当前路由树未发现 Workspace/成员管理页面
├─ login() 只选择第一个 active membership，未发现 Workspace 切换入口
├─ 未发现找回密码、邮箱验证、刷新 Token 或主动 Session 吊销流程
└─ AuthForm 失败只显示服务端消息，没有字段级错误映射

当前未确认
└─ Cookie 跨域、生产 secure 配置和多 Workspace 用户体验需要运行时实测
~~~

## 8. 一句话工程解释

~~~text
AuthForm 把注册或登录交给 AuthService，后者用 argon2、users、tenants 和 tenant_members 确定身份与 Workspace，再签发 8 小时 JWT Cookie 让 AppShell 内的业务请求携带租户角色
~~~

## 9. M1 实施与运行验收更新

模块状态：已验收

M1 已补齐登录后的 Workspace 选择闭环：`login()` 返回全部 active membership，新增 `GET /api/v1/auth/workspaces`、`POST /api/v1/auth/select-workspace`、`/workspaces` 页面和 Workspace Picker。浏览器已实际完成登录、选择 Demo Industrial Workspace、进入 Dashboard。

原“只选择第一个 membership、没有 Workspace 切换入口”的缺口已关闭。找回密码、邮箱验证、Token 主动吊销仍不属于 M1 核心链，继续保留为后续 Auth 产品化范围。

运行证据见 `docs/ChatGptPlan/M1-运行验收报告.md` 和 `docs/ChatGptPlan/M1-端到端验收报告.md`。
