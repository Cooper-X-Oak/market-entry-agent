---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 互动与刷新 03：refresh-proposal 定期刷新与变化提案：ASCII IA 工程解析

> **业务问题**：如何定期检查已有来源和联系点是否变化，并生成一份待用户判断的变化提案
> **入口 / 根节点**：`refreshWorkflow()` / `createWeeklyRefreshSchedule()` / Mission `manualRefreshRequested`
> **相关文件**：`packages/workflows/src/refresh-workflow.ts` / `packages/workflows/src/mission-workflow.ts` / `packages/workflows/src/client.ts` / `apps/worker/src/activities.ts` / `packages/database/src/schema/research.ts` / `packages/database/src/schema/execution.ts`

## 1. 总体架构

~~~text
触发
├─ manual：Mission Signal → child RefreshWorkflow
└─ scheduled：Temporal Schedule every 7 days / overlap SKIP
      ↓
loadRefreshScope()
      ↓ Promise.all
├─ refreshSource × <=20
├─ refreshContact × <=20
└─ refreshCompetitor × <=20
      ↓
createRefreshProposal()
      ↓
Artifact + refresh_proposals + pending approval
~~~

## 2. 刷新范围信息架构

~~~text
loadRefreshScope()
├─ Sources
│  └─ ORDER BY lastFetchedAt DESC LIMIT 20
├─ Contacts
│  └─ lastVerifiedAt IS NULL
│     OR lastVerifiedAt < now()-30 days
│     LIMIT 20
└─ Competitor Profiles
   └─ LIMIT 20

同时写 refresh.started.v1
~~~

## 3. 来源变化信息架构

~~~text
refreshSource(sourceId)
├─ source 不存在或无 url → changed=false
├─ browser Connector 不存在 → changed=false
└─ fetch_page(url)
   ↓ content + SHA-256
   ├─ 已有同 hash Snapshot
   │  └─ 更新 sources.lastFetchedAt / changed=false
   └─ 新 hash
      ├─ ObjectStorage.put(namespace='refresh')
      ├─ INSERT source_snapshots
      ├─ UPDATE sources.latestSnapshotId
      └─ refresh.source_changed.v1 / changed=true
~~~

## 4. Contact / Competitor 刷新结构

~~~text
refreshContact(contactPointId)
├─ 不调用 contact_verification Connector
├─ INSERT contact_verifications
│  ├─ method='source_cross_check'
│  ├─ result='partial'
│  ├─ score=原 confidence
│  └─ verificationStatusAfter='stale'
├─ UPDATE contact_points.verificationStatus='stale'
└─ refresh.contact_reverified.v1

refreshCompetitor(competitorId)
└─ 直接 ok(changed=false)
~~~

## 5. Proposal 生成流程

~~~text
并行结果汇总
├─ changedSnapshotIds
├─ reverifiedContactCount
└─ changedCompetitorCount
    ↓
Artifact Version
├─ type='refresh_proposal'
├─ title='Refresh Proposal {scheduledAt}'
├─ payload
└─ summary='{N} changed sources'
    ↓
refresh_proposals
├─ triggerType
├─ changed counts
└─ affectedOpportunityIds=[]
    ↓
approvals(status='pending')
    ↓ events created + completed
~~~

## 6. 数据、资源与调度流程

~~~text
Mission active
  ↓ Temporal Schedule ID
'refresh-schedule:{tenantId}:{missionId}'
  ↓ every 7 days / SKIP overlap
RefreshWorkflow History

Browser content
  ↓ Object Storage
source_snapshots.objectKey
  ↓ PostgreSQL latestSnapshotId

Proposal
  ↓ Projector / SSE
Refresh Center
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 手工和每周两种触发
├─ 重叠计划跳过
├─ Source 内容哈希去重
├─ 新 Snapshot 与对象存储
└─ Proposal Artifact、审批和事件

当前缺口
├─ Source 按 lastFetchedAt DESC 选择，优先刷新最近抓取的20条而非最旧的
├─ Contact refresh 只是统一标 stale，不是真正重新验证
├─ reverifiedContactCount 统计 succeeded，实际表示“已标 stale 数量”
├─ Competitor refresh 是 no-op，changedCompetitorCount 基本为0
├─ affectedOpportunityIds 固定为空，不做机会重排
├─ 即使没有任何变化也会创建 Proposal
└─ 新 Snapshot/latestSnapshotId 和 Contact stale 在用户评审前已经生效

当前未确认
└─ 未触发 Schedule 或手工刷新；抓取范围、并发和对象存储结果未实测
~~~

## 8. 一句话工程解释

~~~text
定期刷新目前真正做的是重抓最多20条来源、把旧联系点标成 stale、对竞争对手不处理，然后无论是否变化都生成一个待审提案
~~~
