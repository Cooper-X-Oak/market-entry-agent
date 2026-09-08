---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 市场机会 03：opportunity-lifecycle 机会生命周期：ASCII IA 工程解析

> **业务问题**：从识别目标到赢单、丢单或归档，机会如何安全前进、暂停、恢复并保留真实业务证据
> **入口 / 根节点**：`opportunityWorkflow()` / `opportunityTransitions` / `/opportunities` 页面
> **相关文件**：`packages/workflows/src/opportunity-workflow.ts` / `packages/domain/src/state-machines.ts` / `apps/api/src/market/market.service.ts` / `apps/api/src/market/execution.controller.ts` / `apps/web/app/missions/[missionId]/opportunities/page.tsx` / `apps/web/app/missions/[missionId]/opportunities/[opportunityId]/page.tsx`

## 1. 总体架构

~~~text
PostgreSQL opportunities.status
    ↕ Activity transition() + row lock
Domain opportunityTransitions + trigger + evidenceRefs
    ↕ Temporal OpportunityWorkflow.state.status
Signal / Interaction / Agent Activity
    ↕ Projector + API
Kanban + Opportunity Detail + Mission Progress
~~~

## 2. 页面与 API 信息架构

~~~text
OpportunitiesPage
├─ GET /opportunities
└─ 固定 Kanban 列
   target_identified → stakeholder_mapped → contact_path_found
   → contact_path_verified → action_ready → approved
   → contacted → responded → qualified

OpportunityDetailPage
├─ GET /opportunities/:id
├─ POST research
├─ POST pause
└─ POST archive

API 另有
├─ POST resume
├─ PATCH opportunity 基础字段
└─ GET workflow-progress
~~~

## 3. 状态机信息架构

~~~text
observed → target_identified
  ↓
stakeholder_mapped
  ↓
contact_path_found
  ↓
contact_path_verified
  ↓
action_ready → approved → contacted → responded → qualified
                                              ├─→ meeting
                                              ├─→ supplier_registration
                                              ├─→ sample
                                              └─→ quotation → won

早期/中期状态 ─→ paused ─→ 多个指定恢复状态
允许的状态    ─→ archived
推进状态      ─→ lost

终态
├─ won
├─ lost
└─ archived
~~~

## 4. Workflow / JS 运行结构

~~~text
OpportunityWorkflow 第一阶段
├─ resolveEntity
├─ mapStakeholders
├─ findContactPaths
├─ verifyContactPoint × N
├─ qualifyOpportunity
└─ buildActionCard
    ↓ state='action_ready'

审批等待循环
├─ actionCardDecision
├─ manualResearchRequested
└─ pause / resume

长期循环
├─ interactionRecorded
├─ manualResearchRequested
├─ priorityChanged
├─ budgetUpdated
└─ continueAsNew（history>10000或系统建议）
~~~

## 5. 状态变更流程

~~~text
正常 Activity transition()
  ↓ SELECT ... FOR UPDATE
读取数据库 current.status
  ↓ assert transition + trigger
非 pause/resume/archive 必须 evidenceRefs 非空
  ↓ UPDATE opportunities.status
  ↓ opportunity.state_transitioned.v1

API pause
  ↓ 先 Signal Workflow.paused=true
  ↓ 后 updateOpportunity(status='paused')

API resume
  ↓ 先 Signal Workflow.paused=false
  ↓ 后 updateOpportunity(status='target_identified' 默认)

API archive
  ↓ 只改数据库 status='archived'
  └─ 不发送 archive Signal 给 Workflow
~~~

## 6. 数据、事件与资源流程

~~~text
opportunities 当前状态
    ↓ domain_events（aggregateVersion）
    ↓ outbox
timeline_read_model / mission_progress_read_model
    ↓ pg_notify / SSE
Web router.refresh()

Workflow History
├─ currentStep
├─ pendingUnknowns
├─ currentActionCardId/version
├─ pending/processedInteractionIds
├─ paused / budgetReviewRequired
└─ revisionCount
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 完整的 Opportunity 状态枚举和转移白名单
├─ Activity 行锁、Trigger 校验和证据要求
├─ Workflow 暂停、预算等待和 continueAsNew
├─ 互动驱动的后半程状态推进
└─ 状态事件、时间线和进度投影

当前缺口
├─ Kanban 只包含9个状态
│  └─ meeting / supplier_registration / sample / quotation / won / paused / archived / lost 不显示
├─ “看板 / 表格 / 导出”按钮没有切换或导出逻辑
├─ 详情页有 pause、archive，却没有 resume
├─ resume API 默认把数据库恢复到 target_identified
│  └─ Workflow 仍从暂停前循环位置继续，可能状态分离
├─ archive API 不通知 Workflow，Workflow 可能继续等待或工作
└─ pause/resume 都是先 Signal、后数据库更新，第二步失败会形成分离状态

当前未确认
└─ 未执行状态迁移；暂停恢复、终态关闭和 continueAsNew 未实测
~~~

## 8. 一句话工程解释

~~~text
机会生命周期的领域状态机本身较严格，但用户入口没有完整覆盖状态，暂停、恢复和归档又分别操作 Workflow 与数据库，存在两套状态不同步的风险
~~~
