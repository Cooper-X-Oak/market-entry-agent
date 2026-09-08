---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 行动卡 02：action-card-review 行动卡编辑与审批：ASCII IA 工程解析

> **业务问题**：用户如何修改 Agent 生成内容、批准可执行版本，或带明确意见要求重新生成
> **入口 / 根节点**：`ActionCardPage` / `ActionCardEditor` / `MarketService.decideActionCard()` / `actionCardDecision` Signal
> **相关文件**：`apps/web/app/missions/[missionId]/action-queue/[actionCardId]/page.tsx` / `apps/web/components/action-card-editor.tsx` / `apps/api/src/market/execution.controller.ts` / `apps/api/src/market/market.service.ts` / `packages/workflows/src/opportunity-workflow.ts` / `apps/worker/src/activities.ts`

## 1. 总体架构

~~~text
action_cards.status='review'
    ↓ 页面
├─ 编辑当前内容 → PATCH expectedVersionNo
├─ 批准 → POST decision(approve)
└─ 请求修改 → POST decision(request_changes, comment)
                  ↓ Temporal Signal
OpportunityWorkflow decisionQueue
                  ↓ Worker recordActionCardDecision
        ├─ approve → card approved + Opportunity approved
        └─ changes_requested → action_card_builder 新版本
~~~

## 2. 页面信息架构

~~~text
ActionCardPage
├─ Header：状态 / Markdown / CSV / 重新生成 / 批准
├─ 左侧
│  ├─ draft/review/changes_requested → ActionCardEditor
│  └─ approved及以后 → 已锁定内容
└─ 右侧
   ├─ 批准行动卡
   ├─ 请求修改（prompt 输入意见）
   ├─ 标记已执行
   └─ version / status / channel / dueAt

ActionCardEditor 字段
├─ objective / contactReason / timingReason
├─ stakeholderInterest / valueHypothesis
└─ email / social / call 内容 + 复制按钮
~~~

## 3. API 与权限信息架构

~~~text
PATCH /action-cards/:id
├─ permission: mission:write
├─ expectedVersionNo 必须等于当前版本
└─ 只允许 draft/review/changes_requested 原地编辑

POST /action-cards/:id/decision
├─ approve → permission: action:approve
└─ request_changes → permission: mission:write + comment 必填

快捷 API
├─ POST /approve
└─ POST /request-changes
~~~

## 4. JS 与并发控制结构

~~~text
ActionCardEditor.save()
  ↓ apiClient PATCH
  ↓ expectedVersionNo=card.versionNo
  ↓ router.refresh()

decideActionCard()
  ↓ 检查版本号
  ↓ API Transaction
     ├─ INSERT approvals
     └─ APPEND approved/changes_requested event
  ↓ transaction 提交
  ↓ signalOpportunity(actionCardDecision)
  ↓ 返回 CommandReceipt

Worker recordActionCardDecision()
  ↓ SELECT action_card FOR UPDATE
  ↓ 要求 status='review' 且版本匹配
  ↓ UPDATE card + INSERT approvals + event
~~~

## 5. 审批与改版流程

~~~text
批准
review
  ↓ API 写审批记录和事件
  ↓ Signal
  ↓ Worker 再写审批记录和事件
  ↓ transition Opportunity action_ready → approved

请求修改
review
  ↓ changes_requested
  ↓ buildActionCard(feedbackComment)
  ↓ 新 action_card row，versionNo+1，status='review'
  ↓ Workflow.currentActionCardId 切到新版本

手工编辑
review vN
  ↓ UPDATE 同一 row，versionNo 仍为 N
  ↓ action_card.version_created.v1
~~~

## 6. 数据、审批与事件流程

~~~text
action_cards
├─ status / versionNo
├─ basedOnVersionNo
├─ feedbackRefs
├─ approvedBy / approvedAt
└─ 文案字段
    ↓
approvals
├─ actionCardId
├─ status
├─ decidedBy / decidedAt
└─ comment
    ↓
domain_events / outbox
    ↓
SSE → 页面刷新
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 版本冲突检查 expectedVersionNo
├─ 批准和修改意见的不同权限
├─ 已批准内容锁定
├─ 带意见的新版本生成
└─ Action Card / Opportunity 联动状态设计

当前缺口
├─ API Transaction 不更新 action_cards.status，只先写 approvals 和 event
├─ Worker 随后又插入一份 approval 和同类 event
├─ API 已提交后 Signal 失败，会显示审批记录但卡片仍是 review
├─ Worker 批准调用 transition(... evidenceRefs=[])
│  └─ 领域状态机要求非暂停类推进必须有证据，Activity 会失败并回滚
├─ 手工编辑不创建新 row，versionNo 不变，与“版本创建”事件名不一致
└─ ActionCardEditor 没有可见错误状态，保存失败只结束 loading

当前未确认
└─ 未执行审批；重复记录、Signal 失败和空证据转移的实际表现未实测
~~~

## 8. 一句话工程解释

~~~text
行动卡审批设计成 API 收命令、Workflow 落最终状态，但当前两边都会写审批事件，而且批准转移传空证据，会让“已收审批”和“真正批准”发生分离
~~~
