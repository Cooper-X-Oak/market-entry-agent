---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 产业生态与目标组织 03：target-ranking 目标组织排序：ASCII IA 工程解析

> **业务问题**：从生态实体中选出值得投入后续利益角色、触达路径和机会研究资源的组织
> **入口 / 根节点**：`activities.rankTargets()` / `/missions/[missionId]/targets` / `Target Gate` 页面说明
> **相关文件**：`apps/worker/src/activities.ts` / `apps/web/app/missions/[missionId]/targets/page.tsx` / `apps/api/src/market/market.service.ts` / `packages/domain/src/gates.ts` / `packages/database/src/schema/research.ts`

## 1. 总体架构

~~~text
目标组织排序
├─ 自动排序：rankTargets()
├─ 人工状态：promote / archive / PATCH target
├─ 页面：TargetsPage + DataTable
└─ 下游：createOpportunity / OpportunityWorkflow
~~~

### 层间工作顺序

~~~text
mission_entities
    ↓ relevanceScore DESC
score>=50
    ↓ 前20个
targetStatus='high_priority'
    ↓ Target Ranking Artifact
MissionWorkflow 再按 maxTargets slice
    ↓
逐个创建 Opportunity child
~~~

## 2. 页面与 API 信息架构

~~~text
TargetsPage
├─ GET /targets
├─ DataTable
│  ├─ 排名：当前固定“—”
│  ├─ organization / website
│  ├─ marketRoles / country / city
│  ├─ relevanceScore / targetStatus
│  └─ 创建机会 / 补充研究
└─ Target Gate 文案
   ├─ 身份消歧 + 官方身份
   ├─ 已批准路线关系
   ├─ product_fit>=50
   └─ evidence_quality>=40

API
├─ GET /targets
├─ PATCH /targets/:entityId
├─ POST /entities/:entityId/promote
└─ POST /entities/:entityId/archive
~~~

## 3. 状态与筛选信息架构

~~~text
mission_entities.targetStatus
├─ observed
├─ target
├─ high_priority
└─ archived

MarketService.targets()
└─ entities() 后过滤 targetStatus!='observed'
   └─ target / high_priority / archived 都会返回

updateTarget()
└─ targetStatus / relevanceScore / primaryRouteId
~~~

## 4. 排序与规则信息架构

~~~text
实际生产规则：rankTargets()
├─ currentStage='researching_targets'
├─ ORDER BY relevanceScore DESC
├─ relevanceScore>=50
├─ slice(0,20)
└─ 标为 high_priority

声明的 targetGate()
├─ entityResolved
├─ hasOfficialIdentity
├─ marketRoleKnown
├─ linkedToApprovedRoute
├─ productFit>=50
└─ evidenceQuality>=40

当前调用关系
└─ 未发现 rankTargets() 调用 targetGate()
~~~

## 5. 排序与人工操作流程

~~~text
自动
├─ score>=50 → high_priority
└─ score<50 → 保持原 targetStatus

人工 promote
└─ targetStatus='target' + entity.promoted.v1

人工 archive
└─ targetStatus='archived' + entity.archived.v1

补充研究
└─ researchEntity() → generic manualRefreshRequested
~~~

## 6. 数据、Artifact 与资源流程

~~~text
mission_entities
├─ market_roles
├─ relevance_score
├─ discovery_reason
├─ target_status
└─ primary_route_id
    ↓
target_ranking Artifact Version
├─ payload=全部排序 rows
└─ summary='{N} qualified targets'

页面当前无目标专属图片或图表
└─ 复用 DataTable / Confidence / StatusBadge
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ relevanceScore 排序和 high_priority 批量标记
├─ Target Ranking Artifact Version
├─ 手工 target 状态、相关性和主路线更新 API
└─ 目标列表与创建机会入口

当前缺口
├─ 生产排序未执行页面所述完整 Target Gate
├─ 固定前20个先于 Mission maxTargets，配置大于20仍最多返回20给 Workflow
├─ Targets API 包含 archived，页面没有默认排除或筛选
├─ 排名列固定显示“—”，未呈现实际顺序编号
├─ “导出”是普通 button，没有实现下载
└─ researchEntity() 没有显式 mission:write 权限且只触发通用刷新

当前未确认
└─ 未运行排序或页面；实际目标数量、配置边界和人工修改冲突未实测
~~~

## 8. 一句话工程解释

~~~text
当前目标排序按 mission_entities.relevanceScore 取分数不低于50的前20个并标成 high_priority，页面虽展示完整 Target Gate 文案，但生产链尚未执行这些身份、路线和证据条件
~~~
