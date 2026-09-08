---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 市场进入路线 01：route-research 路线研究：ASCII IA 工程解析

> **业务问题**：生成三至八条可解释、有支持和反向证据的目标市场进入路线
> **入口 / 根节点**：`missionWorkflow()` → `activities.researchMarketRoutes()` → `market_route_researcher`
> **相关文件**：`packages/workflows/src/mission-workflow.ts` / `apps/worker/src/activities.ts` / `packages/agents/src/skills.ts` / `packages/contracts/src/research.ts` / `packages/database/src/schema/research.ts`

## 1. 总体架构

~~~text
路线研究
├─ Workflow：researching_routes 并行步骤
├─ Agent：market_route_researcher
├─ Connector：web_search / browser / tender_search
├─ 质量门：3–8 条 + 每条至少两条独立 Evidence
└─ 输出：market_route_set Version + market_routes
~~~

### 层间工作顺序

~~~text
Mission + Capability Claims + 市场 Evidence
    ↓ AgentContext
market_route_researcher
    ↓ Schema + EvidenceValidator
MarketRouteResearchResult
    ↓ tenant transaction
Artifact Version + Market Route rows + proposed events
~~~

## 2. 触发与研究计划信息架构

~~~text
MissionWorkflow
└─ Promise.all
   ├─ extractCapabilityClaims
   ├─ researchMarketRoutes
   ├─ researchCompetitors
   └─ researchExpertSignals

planQueries()
├─ distributor procurement model
├─ supplier registration
├─ EPC contractors
├─ tender award
├─ trade association
└─ exhibition exhibitors
~~~

## 3. 输出 Schema 信息架构

~~~text
routes[3..8]
└─ 每条 Route
   ├─ routeType / title / hypothesis
   ├─ applicableScenarios[]
   ├─ keyEntityTypes[] 至少1
   ├─ keyStakeholderRoles[] 至少1
   ├─ primaryChannels[] 至少1
   ├─ capabilityRequirements[] 至少1
   ├─ supportingEvidenceRefs[] 至少2
   ├─ counterEvidenceRefs[]
   ├─ confidence / entryDifficulty / resourceIntensity
   ├─ timeToFirstContactDays
   └─ rank
~~~

## 4. 证据与质量逻辑信息架构

~~~text
AgentRunner.assertSkillQuality('market_route_researcher')
├─ routes.length >= 3
├─ 每条 supportingEvidenceRefs.length >= 2
└─ entity types / channels / capability requirements 非空

EvidenceValidator
├─ 每个 Evidence ID 必须属于当前 Context
├─ 不允许 required conclusion 无引用
└─ independentGroupKey 至少两个独立来源组
~~~

## 5. 持久化执行流程

~~~text
researchMarketRoutes()
    ↓ 收集 supporting + counter refs
artifactInTransaction(type='market_route_set')
    ↓ artifact.version_proposed.v1
逐条 INSERT market_routes(status='proposed')
    ↓
market_route.proposed.v1
    ↓
markMissionAwaitingRouteReview()
├─ mission.currentStage='awaiting_route_review'
├─ approvals(type='market_route', status='pending')
└─ mission.stage_changed.v1
~~~

## 6. 数据与资源流程

~~~text
Artifact Version.payload
└─ 完整 MarketRouteResearchResult

market_routes
├─ 可查询和排序的 Route 字段
├─ artifact_version_id
├─ evidence_summary=支持 Evidence UUID 逗号串
└─ counter_evidence_summary=反向 Evidence UUID 逗号串

Artifact Version.evidence_refs
└─ 所有路线支持与反向 Evidence UUID 去重集合
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 3–8 条路线数量约束
├─ 组织类型、角色、渠道、能力要求的结构约束
├─ 每条两条支持证据与独立来源组校验
├─ 路线集 Artifact Version 和逐条 Route 数据
└─ 研究结束自动进入路线审批等待

当前缺口
├─ market_routes.evidenceSummary 保存的是 Evidence UUID 字符串，不是可读证据摘要
├─ counterEvidenceRefs 允许为空
├─ rank 未在写入前检查 Mission 内唯一
└─ 研究结果写入时不会清理或 supersede 旧 route rows

当前未确认
└─ 未运行搜索与模型，路线的真实独立来源、排序和成本未实测
~~~

## 8. 一句话工程解释

~~~text
market_route_researcher 并行利用公开搜索、网页和招投标来源生成 3–8 条路线，只有结构完整且每条引用至少两个独立证据组时，Activity 才把路线集版本和候选 Route 写入审批队列
~~~
