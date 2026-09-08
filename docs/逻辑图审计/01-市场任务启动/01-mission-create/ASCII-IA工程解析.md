---
created_at: '2026-09-03T16:41:17+08:00'
updated_at: '2026-09-03T16:41:17+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 市场任务启动 01：mission-create 创建市场任务：ASCII IA 工程解析

> **业务问题**：把企业、产品、目标市场、成功标准和研究预算保存成一个可启动的 draft Market Mission
> **入口 / 根节点**：`GET /missions/new` → `NewMissionPage()` → `<MissionForm />` → `POST /api/v1/missions`
> **相关文件**：`apps/web/app/missions/new/page.tsx` / `apps/web/components/mission-form.tsx` / `apps/web/lib/api-client.ts` / `apps/api/src/market/missions.controller.ts` / `apps/api/src/market/market.service.ts` / `packages/contracts/src/mission.ts` / `packages/database/src/schema/missions.ts`

## 1. 总体架构

~~~text
创建市场任务
│
├─ 页面入口：Next.js App Router
│  └─ apps/web/app/missions/new/page.tsx
│     └─ NewMissionPage()
│        ├─ AppShell(currentPage="新建市场任务")
│        ├─ PageHeader(title="创建市场任务")
│        └─ MissionForm
│
├─ 表单与客户端状态：React Client Component
│  └─ apps/web/components/mission-form.tsx
│     ├─ step / pending / error / draft / saved
│     ├─ localStorage['imea-mission-draft']
│     └─ submit() → CreateMissionRequest
│
├─ HTTP 边界：NestJS + Fastify
│  └─ POST /api/v1/missions
│     ├─ AuthGuard
│     ├─ ZodPipe(createMissionRequestSchema)
│     └─ MissionsController.create()
│        └─ MarketService.createMission()
│
└─ 事实与事件：PostgreSQL + Drizzle
   └─ TransactionManager.run()
      ├─ INSERT missions
      ├─ INSERT domain_events(event_type='mission.created.v1')
      └─ INSERT outbox_events
         三项成功 → COMMIT
         任一失败 → ROLLBACK
~~~

### 层间工作顺序

~~~text
用户完成四步输入
    ↓ MissionForm.submit()
apiClient('/api/v1/missions', { method: 'POST' })
    ↓ credentials='include' + JSON + Idempotency-Key
AuthGuard → ZodPipe → requirePermission(role, 'mission:write')
    ↓
MarketService.createMission(auth, input)
    ↓ 同一 tenant transaction
missions + domain_events + outbox_events
    ↓
ResponseInterceptor → { data: mission, meta }
    ↓
删除 imea-mission-draft
    ↓
router.push(`/missions/${mission.id}`)
~~~

## 2. HTML / React 信息架构

~~~text
NewMissionPage()
└─ <AppShell currentPage="新建市场任务">
   ├─ <PageHeader
   │    title="创建市场任务"
   │    description="定义企业产品范围、目标市场、成功标准和研究预算..."
   │  />
   └─ <MissionForm />
      └─ <form className="panel" onSubmit={submit}>
         ├─ <div className="panel-header">
         │  ├─ steps.map() → <span className="badge ...">
         │  │  └─ Company / Market / Goal / Budget
         │  └─ <div className="stage-track">
         │     └─ <span className="stage-segment" data-state=...>
         │        └─ complete / current / pending
         │
         ├─ <div className="panel-body">
         │  ├─ step=0：企业与产品
         │  │  ├─ name / companyName / companyWebsite
         │  │  └─ productScope
         │  ├─ step=1：市场
         │  │  ├─ targetCountries
         │  │  ├─ targetIndustries
         │  │  └─ targetProfiles
         │  ├─ step=2：业务目标
         │  │  ├─ objective
         │  │  ├─ successDefinition
         │  │  └─ outputLanguages
         │  ├─ step=3：研究预算
         │  │  ├─ maxTargets / maxContactPaths
         │  │  ├─ maxSearchCalls / maxBrowserPages
         │  │  ├─ maxAgentRuns / maxModelTokens
         │  │  └─ weeklyRefreshTargets
         │  ├─ saved=true → “草稿已保存在当前浏览器”
         │  └─ error!='' → <div className="error-state" role="alert">
         │
         └─ <footer className="panel-header">
            ├─ step>0 → “上一步”
            ├─ “保存草稿”
            └─ step<3 → “下一步”
               step=3 → “创建任务” / pending → “创建中…”
~~~

浏览器原生 `required`、`type="url"`、`type="number"`、`min`、`max` 先约束当前可见步骤；完整业务输入仍以服务端 Zod Schema 为准。

## 3. CSS 信息架构

~~~text
apps/web/app/globals.css
│
├─ .panel
│  └─ surface + border + 12px radius + shadow + overflow:hidden
├─ .panel-header / .panel-body
│  └─ 步骤头、内容区、底部操作栏
├─ .form-grid
│  ├─ 默认 repeat(2, minmax(0, 1fr))
│  └─ .full → grid-column: 1 / -1
├─ .field / .input / .textarea
│  ├─ label、hint、输入框统一间距
│  ├─ :focus → primary border + #dbeafe outline
│  └─ .textarea → min-height:100px + vertical resize
├─ .badge-neutral / .badge-primary / .badge-success
│  └─ pending / current / complete 步骤标签
├─ .stage-track / .stage-segment[data-state]
│  ├─ complete → var(--success)
│  ├─ current → var(--primary) + pulse-stage
│  └─ pending → #dbe3ed
├─ .button-secondary / .button-ghost / .button-primary
│  └─ 上一步 / 保存草稿 / 下一步或创建
├─ .error-state
│  └─ 红色边框、浅红背景、role="alert"
└─ 响应式
   ├─ @media (max-width:640px)
   │  └─ .form-grid → 单列；.full → auto；.page-actions 左对齐
   └─ @media (prefers-reduced-motion:reduce)
      └─ 动画与过渡缩短到 .01ms
~~~

本页没有独立 CSS Module；表单直接消费项目级 `globals.css`，因此这些 class 的修改会影响其他复用页面。

## 4. JS / React 状态与 API 信息架构

~~~text
MissionForm()
│
├─ step:number = 0
│  └─ 0 Company → 1 Market → 2 Goal → 3 Budget
├─ pending:boolean
│  └─ 最终提交开始=true；失败=false；同时禁用主按钮
├─ error:string
│  └─ API / 网络异常消息
├─ draft:Record<string,string>
│  └─ 跨步骤保留已卸载字段的值
├─ saved:boolean
│  └─ 点击“保存草稿”后显示提示
└─ router = useRouter()

useEffect()
    ↓ localStorage.getItem('imea-mission-draft')
存在
    ↓ JSON.parse(value)
setDraft(restored)
    ↓ document.querySelector(`[name="..."]`)
回填当前已渲染字段的 value

submit(event)
    ↓ merged = { ...draft, ...collect(form) }
step < 3
    └─ setStep(step + 1)，不请求 API
step = 3
    ↓
targetCountries → csv() → toUpperCase()
targetIndustries / outputLanguages → csv()
targetProfiles → csv() → type.toLowerCase().replaceAll(' ', '_')
预算字段 → Number(...)
    ↓
CreateMissionRequest body
    ↓
apiClient<Mission>()
~~~

~~~text
apiClient()
├─ base URL
│  └─ NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'
├─ fetch options
│  ├─ credentials: 'include'
│  ├─ accept: 'application/json'
│  ├─ content-type: 'application/json'
│  └─ Idempotency-Key: crypto.randomUUID()
├─ success
│  └─ payload.data as Mission
└─ failure
   └─ throw Error(payload.error.message ?? `请求失败 (${status})`)
~~~

## 5. 创建交互与状态流程

~~~text
用户打开 /missions/new
    ↓
读取本地草稿
    ├─ 无草稿 → step=0 空表单
    └─ 有草稿 → 恢复 draft 并回填当前字段
                       ↓
用户填写当前步骤并点击“下一步”
    ↓ 浏览器原生表单约束
collect(form) → 合并 draft → step + 1
    ↓ 重复到 Budget
用户点击“创建任务”
    ↓
pending=true / error=''
    ↓
POST /api/v1/missions
    ├─ 无有效 JWT
    │  └─ AuthGuard → 401 → error-state；保留当前表单
    ├─ Schema 不通过
    │  └─ ZodPipe → 400 VALIDATION_ERROR → error-state
    ├─ role 无 mission:write
    │  └─ requirePermission() 拒绝 → error-state
    └─ 通过
       ↓ TransactionManager 设置 tenant 上下文
       INSERT missions
       │  ├─ status='draft'
       │  ├─ current_stage='draft'
       │  └─ workflow_id=NULL
       ↓
       DomainEventWriter.append()
       │  ├─ aggregate_type='mission'
       │  ├─ aggregate_version=1
       │  └─ event_type='mission.created.v1'
       ↓
       OutboxRepository.enqueue()
       ↓
       COMMIT
       ↓
       删除 localStorage 草稿
       ↓
       /missions/[missionId]

数据库写入或事件写入失败
└─ 同一事务回滚 → 前端显示错误 → pending=false
~~~

## 6. 数据、事件与资源流程

~~~text
用户输入
    ↓ MissionForm 的字段转换
packages/contracts/src/mission.ts
└─ createMissionRequestSchema
   ├─ name / companyName：1..200 字符
   ├─ companyWebsite：z.url()
   ├─ targetCountries：1..3 个两位代码
   ├─ targetIndustries / targetProfiles / outputLanguages：至少 1 项
   └─ budgetConfig：各预算的 min / max / default
        ↓
apps/api/src/market/market.service.ts
└─ MarketService.createMission()
        ↓
packages/database/src/schema/missions.ts
└─ missions
   ├─ tenant_id / created_by
   ├─ 企业、产品、市场、目标、语言、预算
   ├─ status='draft'
   ├─ current_stage='draft'
   └─ created_at / updated_at
        ↓ 同一事务
domain_events(event_type='mission.created.v1')
        ↓
outbox_events
        ↓ 后续由 Projector 消费
Mission read model / Timeline / SSE
~~~

~~~text
页面资源
├─ apps/web/app/globals.css
│  └─ panel / form / button / stage / responsive 样式
├─ lucide-react
│  └─ ArrowLeft / ArrowRight / Check / Save → 运行时 inline SVG
├─ localStorage
│  └─ key='imea-mission-draft' → 仅当前浏览器草稿
└─ NEXT_PUBLIC_API_BASE_URL
   └─ 未配置时请求 http://localhost:4000

图片 / 视频 / 独立 SVG 文件
└─ 当前原子问题未使用；只有 lucide-react 图标组件生成的 inline SVG
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 四步表单和前后步骤切换
├─ 当前浏览器 localStorage 手动保存与加载草稿
├─ 浏览器基础约束 + 服务端 Zod 完整校验
├─ JWT 会话、tenant role 的 mission:write 权限检查
├─ 每次 Web mutation 自动生成 Idempotency-Key
├─ missions、domain_events、outbox_events 原子写入
├─ 创建结果返回后清理草稿并进入 Mission 详情页
└─ 桌面双列与 640px 以下单列表单布局

当前实现边界与缺口
├─ 创建只产生 draft Mission，不自动调用 /:missionId/start
├─ 创建表单没有文件上传控件；Source URL / upload 是后续独立接口
├─ companyWebsite 只作为 Mission 字段保存；创建阶段不抓取网站
├─ 草稿只在用户点击“保存草稿”时写 localStorage，没有服务端草稿
├─ JSON.parse(localStorage 草稿) 没有局部异常恢复分支
├─ targetProfiles 的 type 只处理空格和大小写，最终仍由 Schema 接收普通字符串
└─ 前端没有自动重试；失败后留在 Budget 步骤等待用户再次提交

当前未确认
├─ 按用户要求未运行页面、API、PostgreSQL 或浏览器交互
├─ 未确认真实运行时的响应延迟、焦点移动与屏幕阅读器播报效果
└─ 未确认 Projector 在 mission.created.v1 后生成哪些具体首屏 read-model 行
~~~

## 8. 一句话工程解释

~~~text
Next.js 四步表单把浏览器草稿整理成 CreateMissionRequest，NestJS 完成会话、Schema 和权限检查，再由 tenant 事务一次写入 draft Mission、创建事件与 Outbox，成功后进入任务详情但暂不启动长期工作流
~~~


## 2026-09-08 模块纠正增量

当前源码变化及验收状态以 [模块纠正契约](../../模块纠正契约.md) 和 [机器索引](../../模块纠正索引.json) 为准。本页前文保留历史实现说明；新增代码尚未部署，隔离数据库与完整业务集成仍有阻塞。
