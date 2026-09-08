---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 互动与刷新 01：interaction-record 真实互动记录：ASCII IA 工程解析

> **业务问题**：用户完成外联后，如何把发生时间、原文、结果和后续动作作为正式业务记录送入 Opportunity Workflow
> **入口 / 根节点**：`InteractionForm` → `POST /opportunities/:opportunityId/interactions` → `MarketService.addInteraction()`
> **相关文件**：`apps/web/components/interaction-form.tsx` / `apps/api/src/market/execution.controller.ts` / `apps/api/src/market/market.service.ts` / `packages/contracts/src/execution.ts` / `packages/database/src/schema/execution.ts`

## 1. 总体架构

~~~text
用户真实外联
    ↓ InteractionForm
recordInteractionCommand
    ↓ API permission interaction:write
interactions.interpretationStatus='pending'
    + interaction.recorded.v1
    ↓ transaction commit
Temporal Signal interactionRecorded
    ↓ OpportunityWorkflow.pendingInteractionIds
~~~

## 2. 页面表单信息架构

~~~text
InteractionForm
├─ interactionType
├─ occurredAt
├─ channel
├─ outcome
├─ summary
├─ rawContent（必填）
├─ submittedFacts（JSON 数组）
├─ nextAction
└─ followUpAt

页面可选类型
├─ email_sent / message_sent / call / meeting
├─ form_submitted / supplier_registration
├─ response / qualification_update
├─ sample_sent / quotation_sent
└─ 未提供 exhibition_meeting / referral 选项
~~~

## 3. API 与关联信息架构

~~~text
POST /missions/:missionId/opportunities/:opportunityId/interactions
├─ actionCardId（可选）
├─ targetContactPointId（可选）
├─ interactionType（12种 API 枚举）
└─ 其他表单字段

校验
├─ Opportunity 必须属于 Mission
├─ actionCardId 必须能从 Mission 查询到
└─ contactPointId 必须属于 Mission
~~~

## 4. JS 提交流程

~~~text
submit(event)
  ↓ preventDefault / pending=true
读取 FormData
  ↓ submittedFacts 非空
JSON.parse → Zod array(record)
  ↓ 日期转 ISO
apiClient POST
  ↓ success
form.reset()
processing=true
router.refresh()

error
└─ 显示 error-state
~~~

## 5. 数据写入与 Signal 流程

~~~text
Transaction
├─ INSERT interactions
│  ├─ actorUserId
│  ├─ rawContent
│  ├─ rawContentHash=SHA-256
│  ├─ newFacts
│  └─ interpretationStatus='pending'
└─ APPEND interaction.recorded.v1
    ↓ commit
workflowId = opportunity.workflowId
          ?? 'opportunity:{tenantId}:{opportunityId}'
    ↓ signal interactionRecorded
CommandReceipt
~~~

## 6. 数据、证据与资源流程

~~~text
此阶段
├─ 原文保存在 PostgreSQL interactions.rawContent
├─ 同时保存 rawContentHash
└─ 尚未写 Object Storage / Source / Evidence

下一阶段 ensureInteractionEvidence()
└─ 才把原文写入 S3/MinIO，并建立 interaction_record 证据链

页面资源
└─ textarea / select / input，无媒体附件上传
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 完整原文、摘要、结果、下一步和跟进时间记录
├─ JSON 手工事实输入
├─ 原文 SHA-256
├─ interaction:write 权限
└─ 幂等 Signal 接收队列设计

当前缺口
├─ 页面少了 exhibition_meeting 和 referral 两种 API 支持类型
├─ actionCardId 只校验同 Mission，不校验属于当前 Opportunity
├─ targetContactPointId 只校验同 Mission，不校验属于当前 Opportunity/Organization
├─ DB Transaction 先提交、Temporal Signal 后发送
│  └─ Signal 失败会留下 interpretationStatus='pending'
├─ 页面 processing 状态没有主动轮询完成结果
└─ 不支持邮件文件、会议纪要文件或截图附件

当前未确认
└─ 未提交表单；时区转换、JSON 错误和 Signal 失败表现未实测
~~~

## 8. 一句话工程解释

~~~text
互动记录先把用户提供的外联原文和结果写成 pending 业务事实，再通知 OpportunityWorkflow 解释，但关联对象只校验到 Mission 范围且 Signal 失败没有补偿
~~~
