---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 市场进入路线 03：route-review-complete 路线评审完成：ASCII IA 工程解析

> **业务问题**：一次性确认最终路线集合和对应 Artifact Version，并让 MissionWorkflow 继续生态研究
> **入口 / 根节点**：`POST /missions/:missionId/routes/review-complete` → `completeRouteReview()` → `routeReviewSubmitted`
> **相关文件**：`apps/web/app/missions/[missionId]/market-routes/page.tsx` / `apps/api/src/market/market.service.ts` / `packages/workflows/src/mission-workflow.ts` / `packages/database/src/schema/missions.ts`

## 1. 总体架构

~~~text
路线评审完成
├─ Web：approvedRouteIds + acceptedArtifactVersionIds
├─ API：完整集合校验 + Artifact 接受事务
├─ Event：route approved/deprioritized
└─ Workflow：routeReviewSubmitted → researching_ecosystem
~~~

### 层间工作顺序

~~~text
用户提交路线评审
    ↓
校验选中 Route 和 Artifact Version
    ↓ tenant transaction
接受 Version + 更新 Artifact.currentVersionId
    ↓
所有 Route 定稿为 approved/deprioritized + Events
    ↓ commit
Temporal Signal routeReviewSubmitted
    ↓
MissionWorkflow 发现 approved Route → 生态研究
~~~

## 2. 请求结构信息架构

~~~text
routeReviewSchema
├─ approvedRouteIds：UUID[]，至少1
├─ acceptedArtifactVersionIds：UUID[]，至少1
└─ comment：可选

页面生成 body
├─ approvedRouteIds=当前 status='approved' 的 Route IDs
├─ acceptedArtifactVersionIds=这些 Route 的 artifactVersionId 去重集合
└─ comment='进入下一阶段'
~~~

## 3. 服务校验信息架构

~~~text
completeRouteReview()
├─ require route:approve
├─ 每个 approvedRouteId 必须属于当前 Mission
├─ 从选中 Route 推导 requiredArtifactVersionIds
├─ acceptedArtifactVersionIds 必须与 required 集合完全一致
└─ artifactVersions 查询数量必须一致

失败
├─ ROUTE_APPROVAL_REQUIRED
└─ ACCEPTED_ROUTE_ARTIFACT_REQUIRED
~~~

## 4. 版本与状态信息架构

~~~text
每个选中 Artifact Version
├─ 同 Artifact 旧 accepted → superseded
├─ 当前 Version → accepted
│  ├─ acceptedByUserId
│  └─ acceptedAt
└─ artifacts.currentVersionId=当前 Version

每个 Route
├─ 在 selected → approved
└─ 不在 selected → deprioritized
   └─ 状态变化才写专项 Event
~~~

## 5. 审批推进流程

~~~text
数据库事务成功
    ↓
market_route.approved.v1 / market_route.deprioritized.v1
    ↓
signalMission('routeReviewSubmitted')
    ↓ Workflow handler
pendingApprovals 移除 market_route
    ↓
approvedRoutes=signal.approvedRouteIds
    ↓
state.stage='researching_ecosystem'
    ↓ 每条 approved Route
discoverEcosystem(routeId)
~~~

## 6. 数据、事件与回执流程

~~~text
事务内
├─ artifact_versions
├─ artifacts.current_version_id
├─ market_routes
├─ domain_events
└─ outbox_events

事务外
└─ Temporal Signal

API 回执
├─ commandId
├─ correlationId
├─ aggregateId / missionId
├─ workflowId
└─ acceptedAt
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ Route 与 Artifact Version 集合一致性检查
├─ 旧 accepted Version 自动 supersede
├─ 未选 Route 自动 deprioritize
├─ 决策事件、correlationId 和命令回执
└─ Workflow 持久审批点解锁

当前缺口
├─ packages/domain 的 routeReviewGate()/routeApprovalGate() 未被生产服务调用
├─ 服务未逐条执行“两条证据、实体类型、角色、渠道”完整 Route Approval Gate
├─ 数据库事务提交后才发 Temporal Signal；Signal 失败会留下已接受路线但 Workflow 仍等待
├─ API 回执没有投影完成或 Workflow 已消费 Signal 的确认
└─ 页面 comment 固定为“进入下一阶段”，没有用户输入评审说明

当前未确认
└─ 未运行审批事务与 Temporal，跨边界失败恢复和重复提交行为未实测
~~~

## 8. 一句话工程解释

~~~text
路线评审完成命令把用户选中的 Route 与对应 Artifact Version 一次定稿并记录事件，事务成功后再用 routeReviewSubmitted 解锁生态研究，但数据库接受与 Workflow 收信之间仍是两个独立步骤
~~~
