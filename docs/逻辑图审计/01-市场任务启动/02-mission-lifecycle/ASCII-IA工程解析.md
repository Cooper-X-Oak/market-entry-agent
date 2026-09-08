---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T18:25:00+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 市场任务启动 02：mission-lifecycle 任务生命周期：ASCII IA 工程解析

> **业务问题**：让 draft Mission 显式启动，并能暂停、恢复、刷新、补预算和完成长期研究
> **入口 / 根节点**：`/missions/[missionId]` / `POST /start|pause|resume|refresh|complete` / `missionWorkflow()`
> **相关文件**：`apps/web/app/missions/[missionId]/page.tsx` / `apps/api/src/market/market.service.ts` / `packages/domain/src/state-machines.ts` / `packages/workflows/src/mission-workflow.ts` / `packages/workflows/src/client.ts`

## 1. 总体架构

~~~text
Mission 生命周期
├─ Web：MissionOverviewPage + CommandButton
├─ API：MissionsController 生命周期命令
├─ 领域规则：missionStageTransitions + assertTransition()
├─ 持久事实：missions.status / current_stage / workflow_id
└─ 长期状态：Temporal missionWorkflow + Signals + Queries
~~~

### 层间工作顺序

~~~text
draft Mission
    ↓ POST /start
TemporalGateway.startMission()
    ↓ workflowId='mission:{tenantId}:{missionId}'
missions → running / compiling
    ↓
missionWorkflow 按阶段推进
    ↓ pause / resume / budget / route review / refresh Signals
active + weekly Refresh Schedule
    ↓ POST /complete
completed
~~~

## 2. 页面与命令入口信息架构

~~~text
MissionOverviewPage
├─ currentStage='draft'
│  └─ 当前待办 → “启动市场任务”
├─ status='paused'
│  └─ PageHeader → “继续”
└─ 其他 status
   └─ PageHeader → “暂停”

API
├─ POST /missions/:missionId/start
├─ POST /missions/:missionId/pause
├─ POST /missions/:missionId/resume
├─ POST /missions/:missionId/refresh
├─ POST /missions/:missionId/complete
└─ PATCH /missions/:missionId
   └─ budgetConfig 更新时 signal budgetUpdated
~~~

## 3. 状态与规则信息架构

~~~text
Mission status
├─ draft
├─ running
├─ paused
├─ completed
├─ failed
└─ archived

Mission stage 主干
draft → compiling → ingesting_company_data → researching_routes
    → awaiting_route_review → researching_ecosystem
    → researching_targets → researching_contacts
    → generating_actions → active → completed

预算分支
awaiting_route_review / researching_ecosystem / researching_targets
/ researching_contacts / generating_actions / active
    → awaiting_budget_review
    → budgetUpdated 后返回原阶段
~~~

## 4. Workflow 运行时信息架构

~~~text
missionWorkflow(input)
├─ state
│  ├─ stage / completedSteps / pendingApprovals
│  ├─ childOpportunities
│  ├─ paused / budgetReviewRequired
│  └─ pendingRefreshRequestIds / pendingCapabilityResearchRequestIds
├─ Signals
│  ├─ routeReviewSubmitted
│  ├─ missionPauseRequested / missionResumeRequested
│  ├─ manualRefreshRequested / capabilityResearchRequested
│  ├─ budgetUpdated / missionCompletionRequested
│  └─ opportunityMilestoneReported
├─ Queries
│  ├─ getMissionProgress / getBudgetUsage
│  ├─ getPendingApprovals
│  └─ getChildOpportunityStatuses
└─ history>10000 或 Temporal 建议
   └─ continueAsNew(restoredState)
~~~

## 5. 生命周期执行流程

~~~text
startMission()
├─ require mission:write
├─ assert draft → compiling
├─ TemporalGateway.startMission()
└─ mutate mission.started.v1
   └─ status=running / stage=compiling / workflowId

pauseMission()
├─ signal missionPauseRequested
└─ mission.paused.v1 → status=paused

resumeMission()
├─ signal missionResumeRequested
└─ mission.resumed.v1 → status=running

completeMission()
├─ signal missionCompletionRequested
└─ mission.completed.v1
   └─ status=completed / stage=completed / completedAt
~~~

## 6. 调度与外部依赖流程

~~~text
Temporal Activity retry
├─ startToCloseTimeout=5分钟
├─ maximumAttempts=5
├─ initialInterval=2秒
├─ backoffCoefficient=2
└─ maximumInterval=1分钟

Mission 达到 active
    ↓ createRefreshSchedule()
refresh-schedule:{tenantId}:{missionId}
    ↓ 每7天，overlap=SKIP
refreshWorkflow(triggerType='scheduled')

Mission 完成
└─ markMissionCompleted()；Opportunity child 使用 ABANDON，不随父关闭自动终止
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 显式 start、pause、resume、refresh、complete 命令
├─ 阶段合法转换、预算等待和恢复
├─ Durable Signals、Queries、child workflow 与 Continue As New
└─ active 后创建每周 Refresh Schedule

当前缺口
├─ startMission() 先启动 Temporal、后写 Mission；后半失败可能留下已启动 Workflow
├─ pause/resume/complete 先发 Signal、后写数据库；两步不是同一原子事务
├─ Overview 对 draft 仍显示 Header“暂停”，可能向不存在的 Workflow 发 Signal
├─ completed/failed 的页面动作禁用规则未集中表达
└─ archive 状态存在于 Enum，但 MissionsController 未暴露 archive 命令

当前未确认
└─ 未运行 Temporal，Signal 顺序、重试、Continue As New 和跨组件一致性未实测
~~~

## 8. 一句话工程解释

~~~text
Mission API 把用户生命周期命令映射为数据库状态和 Temporal Signal，missionWorkflow 再用可恢复阶段、审批等待、预算等待、子机会与定时刷新把任务长期推进到 active 或 completed
~~~

## 9. M1 实施与运行验收更新

模块状态：已验收

Lifecycle Command 已增加明确状态门：pause 只接受 running 且已有 Workflow 的 Mission，resume 只接受 paused，complete 只接受已启动 Mission；重复 complete 返回当前完成态。Web 只在合法状态显示 pause、resume、complete 控件。

Worker 的完成 Activity 也增加“completed 终态已经持久化”判断，避免 API 已完成后仅因新的 `completedAt` 再写重复终态 Event。验收 Mission 中修复前已有的两条完成事件作为真实审计历史保留，没有删除。

验收 Mission 已实际完成 `start → awaiting_route_review → pause → resume → complete`。数据库最终 `status=completed`、`currentStage=completed`；Temporal `missionWorkflow` 最终为 `WORKFLOW_EXECUTION_STATUS_COMPLETED`，History Length=103；Progress Read Model 同样为 completed、100%。

Temporal Signal 与 PostgreSQL Command 跨系统不能成为单个 ACID Transaction，仍依赖 Idempotency 和可重试状态收敛；该分布式边界继续保留在设计说明中。


## 2026-09-08 模块纠正增量

当前源码变化及验收状态以 [模块纠正契约](../../模块纠正契约.md) 和 [机器索引](../../模块纠正索引.json) 为准。本页前文保留历史实现说明；新增代码尚未部署，隔离数据库与完整业务集成仍有阻塞。
