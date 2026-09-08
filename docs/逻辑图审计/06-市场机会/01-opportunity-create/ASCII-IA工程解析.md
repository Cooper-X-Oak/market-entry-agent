---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 市场机会 01：opportunity-create 机会创建：ASCII IA 工程解析

> **业务问题**：什么时候把目标组织升级成需要独立 Workflow、评分、行动和持续跟踪的 Opportunity
> **入口 / 根节点**：`MarketService.createOpportunity()` / `activities.createOpportunity()`
> **相关文件**：`apps/api/src/market/execution.controller.ts` / `apps/api/src/market/market.service.ts` / `apps/worker/src/activities.ts` / `packages/workflows/src/mission-workflow.ts` / `packages/workflows/src/client.ts` / `packages/domain/src/gates.ts`

## 1. 总体架构

~~~text
路径A：人工
TargetsPage
  ↓ POST /opportunities
MarketService.createOpportunity()
  ↓ INSERT opportunities + event
TemporalGateway.startOpportunity()

路径B：自动
MissionWorkflow + ranked targetIds
  ↓ activities.createOpportunity()
幂等检查 + 第一条 approved route
  ↓ INSERT opportunities + event
startChild(opportunityWorkflow)
  ↓ recordChildWorkflow()
~~~

## 2. 页面与 API 信息架构

~~~text
POST /api/v1/missions/:missionId/opportunities
Body
├─ organizationId（必填）
├─ routeId（Zod Schema 必填）
├─ title（可选）
├─ hypothesis（可选）
└─ priority（可选）

TargetsPage
└─ 对目标行触发创建

MarketService.batchCreateOpportunities()
└─ 代码存在，但当前 Controller 未暴露批量 API
~~~

## 3. 创建数据结构

~~~text
opportunities 初始字段
├─ tenantId / missionId
├─ organizationId
├─ routeId
├─ title
├─ hypothesis
├─ priority='medium'
├─ status='target_identified'
└─ nextAction
   ├─ 人工：Map stakeholders and discover public contact paths
   └─ 自动：Map stakeholders
~~~

## 4. 创建规则结构

~~~text
人工 createOpportunity()
├─ require mission:write
├─ entity() 必须属于当前 Mission
├─ routeId = input.routeId ?? missionEntity.primaryRouteId
└─ 没有 routeId → ROUTE_APPROVAL_REQUIRED

自动 activities.createOpportunity()
├─ tenant + mission + organization 已存在 → 返回现有 id
├─ 取 rank 最小的第一条 approved route
├─ organization 必须存在
└─ 创建 target_identified

声明的 opportunityCreationGate()
├─ entityResolved
├─ approvedRouteId
├─ stakeholderRoleCount > 0
├─ contactPointCount > 0
├─ evidenceRefs > 0
└─ score >= threshold
~~~

## 5. 交互与 Workflow 流程

~~~text
人工请求
  ↓ DB transaction
opportunity.created.v1
  ↓ transaction 已提交
Temporal startOpportunity
  ↓ workflowId='opportunity:{tenantId}:{opportunityId}'

自动 MissionWorkflow
  ↓ targetIds slice(maxTargets)
createOpportunity
  ↓ startChild OpportunityWorkflow
  ↓ recordChildWorkflow
workflow_instances.status='running'
~~~

## 6. 数据、事件与资源流程

~~~text
mission_entities + entities + market_routes
    ↓
opportunities
    ↓ domain_events / outbox
opportunity.created.v1
    ↓
Projector → timeline / dashboard / progress

Temporal
├─ deterministic workflowId
└─ Workflow History 保存长流程状态

视觉资源
└─ 无专属图片；Targets 表格和 Opportunity 卡片承担入口展示
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 用户单条创建与 Workflow 自动创建
├─ 自动创建按组织幂等复用已有 Opportunity
├─ approved route 缺失时自动路径阻断
├─ 创建事件进入 Outbox
└─ 自动路径登记 workflow_instances

当前缺口
├─ 实际创建未调用 opportunityCreationGate()
│  └─ 创建发生在 stakeholder、contact、score 之前
├─ 人工 Schema 强制 routeId，Service 的 primaryRouteId 回退通常无法从 API 使用
├─ 人工路径不校验 route 确实是当前 Mission 的 approved route
├─ 人工路径 DB 先提交、Temporal 后启动，启动失败会留下孤立 Opportunity
├─ 人工路径未把 workflowId 写回 opportunities.workflowId
└─ batchCreateOpportunities() 串行执行，任一失败会形成部分创建结果

当前未确认
└─ 未实际创建；唯一约束、Temporal 重复启动和部分失败恢复未实测
~~~

## 8. 一句话工程解释

~~~text
机会创建目前是“先建一个 target_identified 业务壳，再由 OpportunityWorkflow 补齐角色、联系和评分”，并没有执行代码中声明的完整 Opportunity Creation Gate
~~~
