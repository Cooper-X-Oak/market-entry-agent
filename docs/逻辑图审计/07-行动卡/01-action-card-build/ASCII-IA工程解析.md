---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 行动卡 01：action-card-build 行动卡生成：ASCII IA 工程解析

> **业务问题**：如何基于真实目标角色、已验证联系点和证据，生成一份可以直接用于首次外联的行动说明
> **入口 / 根节点**：`OpportunityWorkflow` → `activities.buildActionCard()` / `action_card_builder`
> **相关文件**：`apps/worker/src/activities.ts` / `packages/agents/src/skills.ts` / `packages/agents/src/runner.ts` / `packages/contracts/src/research.ts` / `packages/domain/src/gates.ts` / `packages/database/src/schema/execution.ts`

## 1. 总体架构

~~~text
Opportunity Qualification
  + stakeholder roles
  + primary/backup contacts
  + approved route
  + evidence
      ↓ action_card_builder
ActionCardResult
      ↓ assertSkillQuality
      ↓ actionCardGate
action_cards vN(status='review')
      ↓ Artifact + events
Opportunity contact_path_verified → action_ready
~~~

## 2. 输出信息架构

~~~text
ActionCardResult
├─ targetStakeholderRoleId
├─ primaryContactPointId
├─ backupContactPointId（可选）
├─ channel
├─ objective
├─ contactReason
├─ timingReason
├─ stakeholderInterest
├─ valueHypothesis
├─ emailSubject / emailBody
├─ socialMessage
├─ callOpening
├─ contactFormMessage
├─ attachmentsRequired[]
├─ followUpPlan[]
├─ successSignals[]
├─ completionSignals[]
└─ evidenceRefs[]
~~~

## 3. Action Card Gate 信息架构

~~~text
actionCardGate()
├─ opportunityStatus ∈ contact_path_verified/action_ready/approved
├─ targetStakeholderRoleId 存在
├─ primaryContactPointId 存在
├─ primaryContactStatus ∈ source_confirmed/cross_confirmed/manually_confirmed
├─ routeId 存在
├─ evidenceRefs 非空
└─ unresolvedCriticalUnknowns 为空

AgentRunner assertSkillQuality
└─ 要求 targetStakeholderRoleId、primaryContactPointId、channel、
   objective、contactReason、stakeholderInterest、valueHypothesis、
   followUpPlan、successSignals 非空
~~~

## 4. JS / 数据选择结构

~~~text
buildActionCard()
├─ SELECT opportunity FOR UPDATE
├─ stakeholder = opportunityStakeholders ORDER BY rank LIMIT 1
├─ contacts = opportunityContacts ORDER BY rank
│  ├─ contacts[0] → primary
│  └─ contacts[1] → backup（可选）
├─ versionNo = latest + 1
└─ INSERT action_cards status='review'

注意
├─ Agent 输出的 targetStakeholderRoleId 未用于最终行选择
└─ Agent 输出的 primary/backupContactPointId 未用于最终行选择
~~~

## 5. 生成与改版流程

~~~text
首次生成
qualifyOpportunity
  ↓ buildActionCard
  ↓ versionNo=1 / basedOnVersionNo=null

请求修改
decision='request_changes'
  ↓ feedbackComment + feedbackRefs
buildActionCardRevision
  ↓ versionNo=N+1 / basedOnVersionNo=N

互动触发改版
interpretation.nextAction.regenerateActionCard=true
  ↓ feedbackRefs=[interactionId]
buildActionCardFromInteraction
~~~

## 6. 数据、Artifact 与资源流程

~~~text
Agent Context + Evidence IDs
    ↓
action_cards
    + artifact_versions(action_card)
    + domain_event(action_card.version_created.v1)
    + domain_event(action_card.review_requested.v1)
    ↓
PostgreSQL / Outbox / Projector
    ↓
Action Queue + Opportunity Detail

视觉资源
└─ 纯文本表单和状态组件，不生成图片或附件实体
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 结构化渠道、内容、附件要求、跟进计划和成功信号
├─ Agent 输出质量检查
├─ 生产路径实际调用 Action Card Gate
├─ 行锁与递增版本号
└─ 初版、修改意见版和互动反馈版

当前缺口
├─ Gate 的 unresolvedCriticalUnknowns 被固定传 []
│  └─ 未使用 qualification.pendingUnknowns
├─ Gate 只检查 routeId 非空，不检查 Route 当前仍 approved
├─ 新版 Gate 不要求 backup contact
├─ Agent 选择的 stakeholder/contact ID 被忽略，改用数据库 rank 首项
├─ Action Card Result 的附件只保存字符串清单，不绑定真实文件资源
└─ opportunity 已经 action_ready/approved 时生成新卡不会重新迁移状态

当前未确认
└─ 未运行 Agent 或 Gate；内容质量、排序选择和并发版本号未实测
~~~

## 8. 一句话工程解释

~~~text
行动卡生成会用首位角色和联系点通过 Gate 后写入可审查版本，但它没有使用 Agent 返回的目标 ID，也没有把真实未知项送进 Gate
~~~
