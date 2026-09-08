---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 06 市场机会：ASCII IA 工程解析

> **业务区域**：把高优先级目标组织变成可持续推进、可评分、可追踪状态的市场进入机会
> **上游**：目标排序、已批准路线、利益相关者与联系路径
> **下游**：Action Card、真实互动、机会成交阶段和经营决策

## 1. 总体架构

~~~text
高优先级 target + approved route
    ↓ 01 opportunity-create
opportunities.status='target_identified'
    ↓ OpportunityWorkflow
entity → stakeholders → contacts → verify
    ↓ 02 opportunity-qualification
opportunity_scores + qualification Artifact
    ↓ 03 opportunity-lifecycle
action_ready → approved → contacted → ... → won/lost
~~~

## 2. 业务信息架构

~~~text
市场机会
├─ 01-opportunity-create
│  ├─ 人工从目标页创建
│  └─ MissionWorkflow 自动批量创建 child
├─ 02-opportunity-qualification
│  ├─ 8维评分
│  ├─ 证据 / 执行成熟度乘数
│  └─ 商业价值与资源效率
└─ 03-opportunity-lifecycle
   ├─ 状态机
   ├─ 暂停 / 继续 / 归档 / 追加研究
   └─ 页面看板与机会详情
~~~

## 3. 页面与 API 信息架构

~~~text
Web
├─ /missions/[missionId]/targets
│  └─ 创建 Opportunity
├─ /missions/[missionId]/opportunities
│  └─ Kanban
└─ /missions/[missionId]/opportunities/[opportunityId]
   ├─ 评分
   ├─ stakeholder / contact 数量
   ├─ 当前 Action Card
   ├─ 真实互动
   └─ research / pause / archive

API
├─ GET/POST /opportunities
├─ GET/PATCH /opportunities/:id
├─ GET /opportunities/:id/scores
├─ GET /opportunities/:id/workflow-progress
└─ POST /opportunities/:id/research|pause|resume|archive
~~~

## 4. HTML / CSS / JS 结构

~~~text
OpportunitiesPage
├─ Kanban CSS columns
├─ 9个固定状态列
├─ Opportunity Card
│  ├─ title / nextAction
│  ├─ priority / score
│  └─ commercialValueBand / resourceEfficiency
└─ “看板 / 表格 / 导出”目前均为普通 button

OpportunityDetailPage
├─ MetricStrip
├─ 8维 Confidence
├─ Action Card 摘要
├─ InteractionForm
└─ CommandButton → research / pause / archive
~~~

## 5. 交互与状态流程

~~~text
创建
  ↓ target_identified
映射角色
  ↓ stakeholder_mapped
发现联系
  ↓ contact_path_found
验证联系
  ↓ contact_path_verified
生成行动卡
  ↓ action_ready
批准
  ↓ approved
执行与互动
  ↓ contacted → responded → qualified
  ↓ meeting / supplier_registration / sample / quotation
  └→ won / lost

任意主要推进阶段
├─→ paused → 指定状态恢复
└─→ archived（仅部分早期状态允许）
~~~

## 6. 数据、Artifact 与资源流程

~~~text
opportunities
├─ organizationId / routeId
├─ status / priority / ownerId
├─ score / evidenceConfidence
├─ commercialValueBand
├─ estimatedSalesHours / TechnicalHours / MarketCostPoints
├─ resourceEfficiency
└─ nextAction
    ↓
opportunity_scores（多版本）
    ↓
artifact_versions: opportunity_qualification
    ↓
domain_events / workflow_instances
    ↓
Projector + SSE → 机会页 / 任务页 / 时间线
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 人工与 MissionWorkflow 两条创建路径
├─ OpportunityWorkflow 长生命周期编排
├─ 多维评分和评分历史
├─ 显式状态机与领域事件
└─ 看板、详情、追加研究、暂停和归档入口

当前缺口
├─ opportunityCreationGate() 未接入实际创建路径
├─ 人工创建先写数据库、后启动 Temporal，失败时可能留下无 Workflow 机会
├─ API pause/resume 与 Workflow 内存状态可能发生阶段分离
├─ 看板只渲染9个状态，其他状态机会不会显示在任何列
├─ “表格 / 导出”按钮没有交互处理
└─ 页面没有 resume 按钮，暂停后无法在详情页继续

当前未确认
└─ 未运行 OpportunityWorkflow；状态一致性、批量中断和看板覆盖未实测
~~~

## 8. 一句话工程解释

~~~text
市场机会是贯穿目标、联系、行动和真实结果的主业务聚合，但当前数据库、Temporal 状态与页面看板的覆盖范围并不完全一致
~~~
