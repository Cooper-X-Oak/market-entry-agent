---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 互动与刷新 02：interaction-interpretation 互动解释与业务更新：ASCII IA 工程解析

> **业务问题**：如何从一封回复、一次电话或会议原文中提取新事实，并安全更新联系、路线、评分、机会状态和下一步动作
> **入口 / 根节点**：`OpportunityWorkflow` → `interpretInteraction()` → `applyInteractionInterpretation()`
> **相关文件**：`packages/workflows/src/opportunity-workflow.ts` / `apps/worker/src/activities.ts` / `packages/agents/src/skills.ts` / `packages/contracts/src/execution.ts` / `packages/database/src/schema/research.ts` / `packages/database/src/schema/execution.ts`

## 1. 总体架构

~~~text
interactions.pending
  ↓ ensureInteractionEvidence()
Object Storage + Source + Snapshot + Evidence
  ↓ interaction_interpreter Agent
InteractionInterpretation
  ↓ applyInteractionInterpretation() 单事务
├─ claims
├─ contact_points / contact_verifications
├─ market_routes
├─ opportunity_scores / opportunities
├─ opportunity status transition
└─ interaction_interpretation Artifact
  ↓ interactions.interpreted
~~~

## 2. Interpreter 输出信息架构

~~~text
InteractionInterpretation
├─ extractedFacts[]
│  ├─ claimType / statement / valueJson
│  ├─ status / confidence
│  └─ evidenceRefs[]
├─ contactUpdates[]
│  ├─ contactPointId / proposedStatus
│  ├─ employmentState / reason
│  └─ evidenceRefs[]
├─ routeUpdates[]
│  ├─ routeId / confidenceDelta / reason
│  └─ evidenceRefs[]
├─ opportunityTransition（可选）
├─ scoreUpdate（可选）
├─ nextAction
│  ├─ regenerateActionCard
│  ├─ objective
│  └─ dueAt（可选）
└─ unresolvedQuestions[]
~~~

## 3. 互动证据化结构

~~~text
rawContent ?? summary
  ↓ SHA-256
ObjectStorage.put(..., 'interactions', text/plain)
  ↓
sources
├─ sourceType='interaction_record'
├─ normalizedUrl='urn:imea:interaction:{interactionId}'
└─ authority='user_record'
  ↓
source_snapshots(contentHash, objectKey, extractedText)
  ↓
evidence_items
├─ deterministic UUID(interactionId+hash)
├─ excerpt 前2000字符
├─ relevance=100 / freshness=100
└─ locator(startOffset=0,endOffset=全文长度)
  ↓ interaction_evidence_links
~~~

## 4. 更新规则结构

~~~text
Fact
└─ INSERT claim(origin='interaction', impactLevel='high')
   + claim_evidence_links + interaction_claim_links

Contact Update
└─ 直接 UPDATE verificationStatus
   + manualConfirmation facts
   + contact_verifications(score=100, method='interaction')

Route Update
└─ confidence = clamp(current + delta, 0, 100)

Score Update
└─ finalScore = 所有 dimensions 简单平均
   + opportunity_scores generatedBy='interaction'

Opportunity Transition
└─ 使用严格 transition() + trigger + evidenceRefs + interactionId
~~~

## 5. Workflow 交互流程

~~~text
pendingInteractionIds.shift()
  ↓ interpretInteraction
  ↓ applyInteractionInterpretation
Workflow.state.status = applied.status
  ↓ processedInteractionIds.push(id)
  ↓ regenerateActionCard=true
buildActionCard(
  basedOnVersionNo=current,
  feedbackRefs=[interaction.id]
)
  ↓ report milestone interaction:{status}
~~~

## 6. 数据、Artifact 与事件流程

~~~text
一次解释事务
├─ interaction.claim_created.v1 × N
├─ interaction.contact_updated.v1 × N
├─ interaction.route_updated.v1 × N
├─ opportunity.scored.v1（可选）
├─ opportunity.state_transitioned.v1（可选）
├─ interaction.opportunity_transitioned.v1（可选）
├─ Artifact: interaction_interpretation
├─ interactions.interpretationStatus='interpreted'
└─ interaction.interpreted.v1
    ↓ Outbox / Projector / SSE
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 用户原文先转正式证据再交给 Agent
├─ 多类业务对象可由一次解释联动更新
├─ Apply 阶段使用行锁和单事务
├─ Opportunity 状态推进继续执行领域状态机
└─ 可根据互动结果生成新 Action Card 版本

当前缺口
├─ Object Storage 写入发生在数据库证据事务之前，失败可能留下孤立对象
├─ 新 Claim 每次直接插入，不消歧、不 supersede 旧 Claim
├─ Contact proposedStatus 直接更新，未调用 contactTransitions 校验
├─ Contact 更新固定 score=100，且任何 Agent 建议都带人工确认 facts
├─ 互动评分用简单平均，不使用首次资格评分的权重、乘数和资源效率公式
├─ nextAction.dueAt 没有写入 Opportunity 或 Action Card
└─ unresolvedQuestions 没有写入持久业务表或 Workflow pendingUnknowns

当前未确认
└─ 未运行 Interpreter；事实抽取、跨对象更新和 Action Card 再生成未实测
~~~

## 8. 一句话工程解释

~~~text
互动解释能把用户原文升级成证据并在一个事务里更新核心业务判断，但 Contact 和 Score 更新绕开了原有状态与评分规则的一部分
~~~
