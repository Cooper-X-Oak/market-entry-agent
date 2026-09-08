---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 08 互动与刷新：ASCII IA 工程解析

> **业务区域**：用真实互动更新业务判断，并用定期刷新发现外部来源、联系点和竞争信息的变化
> **上游**：已批准/已执行 Action Card、公开来源、联系点、竞争对手档案
> **下游**：Claim、Contact、Route、Opportunity Score/Status、Action Card 新版本和用户刷新决策

## 1. 总体架构

~~~text
真实业务反馈线
Action Card / Opportunity
  ↓ 01 interaction-record
interactions(status='pending')
  ↓ 02 interaction-interpretation
claims + contacts + routes + score + opportunity status
  └─ 可触发 Action Card 新版本

外部信息刷新线
每周 Schedule / 手工 refresh
  ↓ 03 refresh-proposal
sources + contacts + competitors 并行刷新
  ↓ refresh_proposal Artifact
  ↓ 04 refresh-review
接受 / 补充研究 / 稍后处理
~~~

## 2. 业务信息架构

~~~text
互动与刷新
├─ 01-interaction-record
│  ├─ 邮件、消息、电话、会议、表单、注册、样品、报价
│  └─ 原文、摘要、结果、下一步和跟进时间
├─ 02-interaction-interpretation
│  ├─ 提取新 Claim
│  ├─ 更新 Contact / Route
│  ├─ 重算 Opportunity
│  └─ 推进状态 / 重生 Action Card
├─ 03-refresh-proposal
│  ├─ Source Snapshot 变化
│  ├─ Contact stale 标记
│  └─ Refresh Proposal
└─ 04-refresh-review
   ├─ accept
   ├─ research
   └─ defer
~~~

## 3. 页面与 API 信息架构

~~~text
Opportunity Detail
├─ InteractionForm
└─ 真实互动列表

Refresh Center
├─ “立即刷新”
├─ Proposal summary / payload
└─ 接受更新 / 请求补充研究 / 稍后处理

API
├─ POST /opportunities/:id/interactions
├─ GET /opportunities/:id/interactions
├─ GET /interactions
├─ POST /missions/:id/refresh
├─ GET /refresh-proposals
└─ POST /refresh-proposals/:id/accept|research|defer
~~~

## 4. HTML / CSS / JS 结构

~~~text
InteractionForm（Client）
├─ 原生 form-grid
├─ JSON.parse submittedFacts
├─ apiClient POST
├─ processing 状态文案
└─ router.refresh()

RefreshCenterPage（Server）
├─ Panel 列表
├─ details + pre 显示 JSON payload
├─ StatusBadge
└─ CommandButton 三种决策

CSS
└─ 复用 Panel / stack / split-layout / form-grid / badge
~~~

## 5. 交互与刷新流程

~~~text
互动
用户提交 → DB 记录 pending → Signal OpportunityWorkflow
         → Agent Interpreter → 单事务应用结果 → interpreted

手工刷新
用户点击 → Signal MissionWorkflow.manualRefreshRequested
         → startChild RefreshWorkflow → Proposal

计划刷新
Mission active → createWeeklyRefreshSchedule(every 7 days, overlap SKIP)
              → RefreshWorkflow → Proposal

提案决策
proposed
├─ accept → Artifact Version accepted
├─ research → 再发 manualRefreshRequested
└─ defer → Artifact Version changes_requested
~~~

## 6. 数据、证据与资源流程

~~~text
互动原文
  ↓ S3/MinIO Object Storage
source(interaction_record)
  ↓ source_snapshot + evidence_item
  ↓ interaction_interpreter
  ↓ interaction_interpretation Artifact

网页刷新内容
  ↓ Browser Connector
  ↓ hash 去重 + Object Storage
  ↓ source_snapshots / latestSnapshotId

刷新结果
  ↓ refresh_proposals + Artifact Version + approvals
  ↓ domain_events / Projector / SSE
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 真实互动原文证据化和 Agent 解释
├─ 一个解释事务内联动 Claim、Contact、Route、Score、State
├─ 手工与每周自动刷新
├─ Source 内容哈希比较
└─ 用户可接受、补充研究或延后 Proposal

当前缺口
├─ 互动记录先提交、后发 Signal，失败时会长期 pending
├─ 互动再评分与首次资格评分公式不一致
├─ 刷新在用户接受前已经写新 Snapshot、latestSnapshotId 并把 Contact 标 stale
├─ Contact refresh 没有重新调用验证 Connector
├─ Competitor refresh 当前是 no-op
├─ Proposal affectedOpportunityIds 永远为空
└─ 接受 Proposal 只接受 Artifact Version，不同步 refresh_proposals 和 approvals 状态

当前未确认
└─ 未运行互动 Interpreter 或 RefreshWorkflow；外部内容变化、计划触发和决策一致性未实测
~~~

## 8. 一句话工程解释

~~~text
互动链负责把真实外联变成新的业务事实，刷新链负责发现外部变化，但当前刷新会在用户接受提案之前就改动底层来源和联系状态
~~~
