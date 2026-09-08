---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 利益相关者与联系路径 01：stakeholder-mapping 利益相关者映射：ASCII IA 工程解析

> **业务问题**：目标组织里哪些职能角色会影响采购、技术、准入或渠道决策，下一步应该优先接触谁
> **入口 / 根节点**：`OpportunityWorkflow` → `activities.mapStakeholders()` / `/entities/:entityId/stakeholders`
> **相关文件**：`apps/worker/src/activities.ts` / `packages/agents/src/skills.ts` / `apps/api/src/market/market.service.ts` / `apps/api/src/market/ecosystem.controller.ts` / `packages/database/src/schema/research.ts` / `packages/database/src/schema/execution.ts`

## 1. 总体架构

~~~text
Opportunity + Organization + approved route + Evidence
    ↓ stakeholder_mapper Agent
StakeholderMapOutput
    ├─ roleType
    ├─ title / personId（可选）
    ├─ decisionInfluence
    ├─ contactPriority
    ├─ confidence
    └─ relevanceReason
    ↓ Worker 持久化
stakeholder_roles
    ↓ opportunity_stakeholders
Opportunity → stakeholder_mapped
~~~

## 2. 页面与 API 信息架构

~~~text
自动入口
└─ OpportunityWorkflow → mapStakeholders(opportunityId)

人工 API
├─ GET  /entities/:entityId/stakeholders
├─ POST /entities/:entityId/stakeholders
├─ PATCH /stakeholders/:stakeholderId
└─ POST /entities/:entityId/stakeholders/research

Web
└─ 当前没有 stakeholder 专属页面
   └─ Opportunity 相关界面只消费汇总数量或后续 Action Card 结果
~~~

## 3. 角色模型信息架构

~~~text
stakeholder_roles
├─ tenantId / missionId / organizationEntityId
├─ personEntityId（可空）
├─ roleType（15种业务角色枚举）
├─ title
├─ decisionInfluence: 0..100
├─ contactPriority: 1..10
├─ confidence: 0..100
├─ relevanceReason
└─ status='confirmed'（人工新增默认）

opportunity_stakeholders
├─ opportunityId
├─ stakeholderRoleId
└─ rank = contactPriority
~~~

## 4. Agent / JS 规则结构

~~~text
stakeholder_mapper
├─ Connectors
│  ├─ web_search
│  ├─ browser
│  └─ social_public_search
├─ 研究方向
│  ├─ procurement director
│  ├─ engineering team
│  ├─ supplier qualification team
│  └─ channel partnership manager
└─ 输出原则
   ├─ 先识别业务角色
   ├─ 人员姓名可以缺失
   └─ 每个判断绑定 evidenceRefs
~~~

## 5. 交互与状态流程

~~~text
自动流程
Opportunity(target_identified / entity_resolved)
    ↓ activities.mapStakeholders()
运行 Agent + 保存决策报告
    ↓
写 Stakeholder Map Artifact Version
    ↓
插入 stakeholder_roles
    ↓
插入 opportunity_stakeholders
    ↓
transitionOpportunity('stakeholder_mapped', evidenceRefs)

人工流程
POST stakeholder
    ↓ mission:write
stakeholder.discovered.v1
    ↓
PATCH stakeholder
    ↓ mission:write
stakeholder.updated.v1
~~~

## 6. 数据、Artifact 与资源流程

~~~text
公开网页 / 社交公开信息
    ↓ Sources + Evidence Items
stakeholder_mapper 输出
    ↓
artifact_versions
└─ artifactType='stakeholder_map'
    ↓
stakeholder_roles + opportunity_stakeholders
    ↓ domain_events / outbox
Projector → 时间线 / 任务看板

页面资源
└─ 当前无专属图片、图谱或 stakeholder UI 资源
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 自动识别采购、工程、准入、渠道等角色
├─ 角色影响力、联系优先级和可信度结构化落库
├─ Stakeholder Map Artifact 留存
├─ 角色与具体 Opportunity 关联
└─ 人工新增、修改和重新研究 API

当前缺口
├─ 没有专属 Web 页面供用户浏览和维护角色
├─ researchStakeholders() 只发送通用 manualRefreshRequested
├─ 重新研究 Signal 没有携带目标组织和角色范围
├─ researchStakeholders() 未见显式 mission:write 权限检查
└─ 人工新增默认 status='confirmed'、confidence=100，不要求来源证据

当前未确认
└─ 未运行角色 Agent；真实角色覆盖、证据质量和重复角色情况未实测
~~~

## 8. 一句话工程解释

~~~text
利益相关者映射把一个目标公司转换成带影响力和联系优先级的决策角色清单，但当前用户主要通过自动 Opportunity 流程消费，尚无独立页面管理这些角色
~~~
