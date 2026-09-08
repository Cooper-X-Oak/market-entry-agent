---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 决策跟踪 01：dashboard 工作区与任务仪表盘：ASCII IA 工程解析

> **业务问题**：用户如何快速看清有哪些市场任务、现在走到哪一步、积累了多少路线/目标/联系/机会/行动，以及下一项人工决策是什么
> **入口 / 根节点**：`/dashboard` / `/missions/[missionId]`
> **相关文件**：`apps/web/app/dashboard/page.tsx` / `apps/web/app/missions/[missionId]/page.tsx` / `apps/api/src/market/missions.controller.ts` / `apps/api/src/market/market.service.ts` / `apps/projector/src/projector.ts` / `packages/database/src/schema/read-models.ts`

## 1. 总体架构

~~~text
工作区 Dashboard
GET /missions?page=1&pageSize=50
    ↓ 前20个任务各自 GET /metrics
Workspace totals + Mission Table + Route Review 待办

单任务 Dashboard
并行 GET
├─ /missions/:id
├─ /metrics
├─ /workflow-progress
├─ /opportunities
└─ /timeline
    ↓
Stage + Metrics + Mission Brief + Opportunities + Pending Action
~~~

## 2. 工作区页面信息架构

~~~text
/dashboard
├─ PageHeader
│  └─ 新建市场任务
├─ MetricStrip
│  ├─ 运行中的任务
│  ├─ 市场进入机会
│  ├─ 已验证触达路径
│  ├─ 行动卡
│  ├─ 已批准路线
│  └─ 待处理审批
├─ 市场任务 DataTable
│  └─ name / company / countries / stage / status / updatedAt
├─ 等待你处理
│  └─ awaiting_route_review Mission
└─ 工作台原则
~~~

## 3. 单任务页面信息架构

~~~text
/missions/[missionId]
├─ Header
│  ├─ refresh
│  ├─ pause / resume
│  └─ export ZIP
├─ 任务阶段
│  ├─ mission.currentStage
│  ├─ StageProgress
│  └─ workflow budget / child opportunity counts
├─ MetricStrip
│  ├─ approvedRoutes / targets / verifiedContacts
│  ├─ opportunities / actionCards
│  └─ budgetUsage
├─ 任务卡摘要
├─ “高优先级机会”前5条
├─ 当前待办
└─ 最近判断变化前5条
~~~

## 4. HTML / CSS / JS 结构

~~~text
React Server Components
├─ safeApi()
├─ Promise.all()
├─ AppShell / Sidebar
├─ PageHeader
├─ MetricStrip
├─ Panel / split-layout / stack
├─ DataTable
├─ StageProgress
└─ CommandButton / Link

无 Client 本地聚合状态
└─ 命令完成或 SSE 后由 router.refresh() 重取页面
~~~

## 5. 指标口径流程

~~~text
MarketService.metrics()
├─ approvedRoutes：market_routes.status='approved'
├─ targets：全部 mission_entities
├─ verifiedContacts：source/cross/manually_confirmed
├─ actionCards：全部 Action Card 版本
└─ opportunities：全部状态

Projector mission_dashboard_read_model
├─ targetCount：target/high_priority（不含 observed/archived）
├─ pendingApprovalCount：approvals.pending
├─ weeklyInteractionCount
└─ totalCostAmount

实际 Dashboard 页面
└─ 不读取 mission_dashboard_read_model
~~~

## 6. 数据与实时更新流程

~~~text
missions + 业务表实时聚合
    ↓ API
Dashboard / Mission Overview

另一路
domain_events → Projector
    ↓ mission_progress_read_model
workflow-progress API
    ↓ 无投影时回退 Temporal getMissionProgress

SSE mission event
    ↓ invalidate queries + router.refresh
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 工作区和单任务两级总览
├─ 主要业务数量、阶段和任务列表
├─ 路线评审待办
├─ Opportunity 与最近事件摘要
└─ 任务刷新、暂停/继续和导出入口

当前缺口
├─ 工作区任务取前50个，但业务指标只汇总前20个
├─ “待处理审批”只数 awaiting_route_review Mission
│  └─ 不使用 approvals.pending，不覆盖 Action Card/Refresh 审批
├─ 已存在 mission_dashboard_read_model，但 Dashboard 没有消费
├─ metrics.targets 统计全部 mission_entities，与投影口径不同
├─ “高优先级机会”直接 opportunities.slice(0,5)，页面未按 score 排序
├─ mission_progress_read_model.budgetUsage 当前 Projector 固定写 {}
└─ Projector 的 completed/running/pending/failedSteps 当前固定空数组

当前未确认
└─ 未打开页面；超过20个任务的汇总、投影回退和实时刷新未实测
~~~

## 8. 一句话工程解释

~~~text
仪表盘能快速呈现任务和核心数量，但它绕过已有 Dashboard Read Model 自己拼接口，导致任务数量、目标数量和待审批数量存在多套口径
~~~
