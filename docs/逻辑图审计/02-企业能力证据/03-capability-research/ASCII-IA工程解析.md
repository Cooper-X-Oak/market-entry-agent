---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 企业能力证据 03：capability-research 能力重新研究：ASCII IA 工程解析

> **业务问题**：在新资料、未知项或用户修正出现后，请求 MissionWorkflow 再生成一版能力证据账本
> **入口 / 根节点**：`POST /missions/:missionId/capabilities/research` → `capabilityResearchRequested`
> **相关文件**：`apps/web/app/missions/[missionId]/capability-ledger/page.tsx` / `apps/api/src/market/market.service.ts` / `packages/workflows/src/mission-workflow.ts` / `apps/worker/src/activities.ts`

## 1. 总体架构

~~~text
能力重新研究
├─ UI：CommandButton“重新提取”
├─ API：researchCapabilities()
├─ Temporal Signal：capabilityResearchRequested
├─ Workflow Queue：capabilitySignals[]
└─ Activity：extractCapabilityClaims(requestId)
~~~

### 层间工作顺序

~~~text
用户点击“重新提取”
    ↓ POST /capabilities/research
确认 Mission 已有 workflowId
    ↓ requestId=randomUUID()
signal capabilityResearchRequested
    ↓ 立即返回 requested=true
MissionWorkflow 排队
    ↓
extractCapabilityClaims(requestId)
    ↓
新 Capability Ledger Version + 新 Claims
~~~

## 2. 请求入口信息架构

~~~text
researchCapabilities(auth, missionId)
├─ requirePermission('mission:write')
├─ mission(auth, missionId)
├─ workflowId 为空
│  └─ MISSION_WORKFLOW_UNAVAILABLE
└─ signalMission(...)
   ├─ signal='capabilityResearchRequested'
   └─ payload={ requestId, requestedByUserId }
~~~

## 3. Workflow 队列信息架构

~~~text
Signal handler
├─ requestId 未在 capabilitySignals
│  └─ push(signal)
├─ state.pendingCapabilityResearchRequestIds 同步
└─ lastProcessedSignalSequence + 1

处理位置
├─ awaiting_route_review 等待循环
│  └─ 用户批准路线前可重复提取
└─ active 主循环
   └─ 任务长期运行时可重复提取
~~~

## 4. 幂等与版本信息架构

~~~text
Activity Scope businessId=requestId
    ↓ activity-scope idempotencyKey
activities.extractCapabilityClaims()
    ↓ idempotent(input, 'extractCapabilityClaims')
同一 requestId 重放
└─ 返回已有 Activity 结果

新 requestId
└─ 新 artifact_version(versionNo+1, status='proposed')
   └─ 新 Claim 行与 Evidence Link
~~~

## 5. 执行与失败流程

~~~text
API Signal 成功
└─ { requested:true, requestId, scope:'capabilities' }
   └─ 仅代表已请求，不代表提取完成

Workflow 暂停
└─ step() 先 awaitResume，恢复后执行

预算耗尽
├─ stage='awaiting_budget_review'
├─ pending approval='budget_review'
└─ budgetUpdated 后回到原阶段重试

Agent/Activity 持续失败
└─ Temporal 按 Activity retry policy，最终 Workflow 失败或等待处理
~~~

## 6. 数据、事件与反馈流程

~~~text
新 Source / 用户修改 Claim / 现有 Artifact
    ↓ task() 重建 AgentContext
capability_evidence_extractor
    ↓
artifact.version_proposed.v1
    ↓ Projector / SSE
Capability Ledger 页面刷新
    ↓
用户看到按 updatedAt 排序的新旧 Claim
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 启动后的 Mission 可请求重新提取
├─ requestId 去重、Workflow 持久排队和 Activity 幂等
├─ 路线评审等待期与 active 期均可处理
└─ 预算耗尽时暂停并等待预算更新

当前缺口
├─ API 没有返回 Run ID、Artifact Version ID 或完成状态查询键
├─ 页面没有针对该 requestId 的处理中状态或完成通知
├─ Signal payload Schema 支持 question，但 API 当前没有接收具体问题
├─ 重新提取追加 Claim，未自动合并或 supersede 旧版本 Claim
└─ researching_ecosystem 等中间阶段不在显式等待循环处理，需到 active 主循环

当前未确认
└─ 未运行 Temporal；Signal 在各阶段的实际等待时长与完成反馈未实测
~~~

## 8. 一句话工程解释

~~~text
“重新提取”只把唯一 requestId 放进 MissionWorkflow 的能力研究队列，Workflow 在可处理阶段用最新 Source、Claim 和 Artifact 上下文幂等生成新版本，API 回执本身不代表研究完成
~~~
