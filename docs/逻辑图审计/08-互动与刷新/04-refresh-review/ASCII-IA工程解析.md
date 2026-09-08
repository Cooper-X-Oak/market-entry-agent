---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 互动与刷新 04：refresh-review 刷新提案评审：ASCII IA 工程解析

> **业务问题**：用户如何理解刷新变化，决定接受、补充研究或延后，并控制哪个提案版本成为当前版本
> **入口 / 根节点**：`RefreshCenterPage` / `acceptRefreshProposal()` / `researchRefreshProposal()` / `deferRefreshProposal()`
> **相关文件**：`apps/web/app/missions/[missionId]/refresh-center/page.tsx` / `apps/api/src/market/operations.controller.ts` / `apps/api/src/market/market.service.ts` / `apps/worker/src/activities.ts` / `packages/database/src/schema/research.ts`

## 1. 总体架构

~~~text
refresh_proposal Artifact Version(proposed)
    ↓ Refresh Center
用户查看 summary + JSON payload
    ├─ 接受更新
    │  └─ Artifact Version accepted + artifacts.currentVersionId
    ├─ 请求补充研究
    │  └─ manualRefreshRequested → 新 RefreshWorkflow
    └─ 稍后处理
       └─ Artifact Version changes_requested
~~~

## 2. 页面信息架构

~~~text
RefreshCenterPage
├─ Header
│  ├─ 说明：每周刷新只生成变化建议
│  └─ 立即刷新
├─ Proposal Panel × N
│  ├─ artifact.title
│  ├─ artifactType + versionNo
│  ├─ StatusBadge(version.status)
│  ├─ version.summary
│  └─ details → JSON.stringify(version.payload)
└─ 操作
   ├─ 接受更新
   ├─ 请求补充研究
   └─ 稍后处理
~~~

## 3. API 与权限信息架构

~~~text
GET /refresh-proposals
├─ permission: mission:read
└─ 查询 artifacts + artifact_versions
   WHERE artifactType='refresh_proposal'

POST /:proposalId/accept
└─ permission: mission:write

POST /:proposalId/research
└─ 只继承 refreshProposal() 的 mission:read

POST /:proposalId/defer
└─ 未见显式 requirePermission
~~~

## 4. 决策写入结构

~~~text
acceptRefreshProposal()
├─ 同 Artifact 已 accepted 版本 → superseded
├─ 当前 version → accepted
│  ├─ acceptedByUserId
│  └─ acceptedAt
├─ artifacts.currentVersionId = version.id
└─ refresh.proposal_accepted.v1

researchRefreshProposal()
├─ 只确认 Proposal 存在
└─ Signal Mission manualRefreshRequested

deferRefreshProposal()
├─ version.status='changes_requested'
└─ artifact.changes_requested.v1
~~~

## 5. 用户交互流程

~~~text
用户打开刷新中心
  ↓ GET 全部 refresh_proposal Artifact Versions
选择 Proposal Version ID
  ├─ accept → 页面刷新 → version accepted
  ├─ research → 新 requestId → 等待另一份 Proposal
  └─ defer → version changes_requested

页面声明
└─ “接受后才替换当前生效版本”

实际底层
├─ Source latestSnapshotId 已在 Proposal 生成前更新
└─ Contact status 已在 Proposal 生成前改为 stale
~~~

## 6. 数据、审批与事件流程

~~~text
artifacts
└─ currentVersionId
    ↑
artifact_versions
├─ proposed
├─ accepted
├─ changes_requested
└─ superseded

另有 refresh_proposals
├─ status
├─ artifactVersionId
├─ acceptedBy / acceptedAt
└─ counts

另有 approvals
└─ approvalType='refresh_proposal' / status='pending'
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ Proposal 摘要和原始 JSON 载荷展示
├─ 接受版本并设置 currentVersionId
├─ 请求新一轮研究
├─ 延后为 changes_requested
└─ 决策事件进入时间线

当前缺口
├─ API accept 只更新 Artifact Version 和 artifacts.currentVersionId
├─ 不更新 refresh_proposals.status/acceptedBy/acceptedAt
├─ 不关闭 approvals.status='pending'
│  └─ Dashboard pendingApprovalCount 可能持续计数
├─ Worker 的 applyRefreshProposal() 存在但当前 API 没有调用
├─ accept 不负责应用来源/联系变化，因为这些变化此前已写入
├─ research/defer 缺少显式 mission:write 权限
└─ 页面只有原始 JSON，没有逐项来源、联系和机会影响对比

当前未确认
└─ 未执行评审；accepted/currentVersion、pending approval 和底层变化一致性未实测
~~~

## 8. 一句话工程解释

~~~text
刷新评审当前主要决定哪份 Proposal Artifact 被标为 accepted，并不控制底层 Source/Contact 变化是否应用，也没有同步关闭 Proposal 与 Approval 记录
~~~
