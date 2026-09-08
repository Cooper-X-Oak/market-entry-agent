---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 市场机会 02：opportunity-qualification 机会资格评分：ASCII IA 工程解析

> **业务问题**：这个机会的业务价值、证据可信度、触达成熟度和资源投入是否值得继续
> **入口 / 根节点**：`OpportunityWorkflow` → `activities.qualifyOpportunity()` → `scoreOpportunity()`
> **相关文件**：`apps/worker/src/activities.ts` / `packages/agents/src/skills.ts` / `packages/domain/src/scoring.ts` / `packages/database/src/schema/execution.ts` / `apps/web/app/missions/[missionId]/opportunities/[opportunityId]/page.tsx`

## 1. 总体架构

~~~text
Opportunity 已完成 contact verification
    ↓ opportunity_qualifier Agent
QualificationResult
    ↓ scoreOpportunity()
baseScore × evidenceMultiplier × executionMultiplier
    ↓
opportunity_scores vN
    + UPDATE opportunities 汇总字段
    + opportunity_qualification Artifact
    + opportunity.scored.v1
~~~

## 2. 页面与 API 信息架构

~~~text
机会详情页
├─ 最终机会分
├─ evidenceConfidence
├─ commercialValueBand
├─ resourceEfficiency
└─ 8维评分
   ├─ product_fit
   ├─ route_fit
   ├─ demand_signal
   ├─ timing_signal
   ├─ stakeholder_relevance
   ├─ contactability
   ├─ evidence_quality
   └─ strategic_value

API
└─ GET /opportunities/:opportunityId/scores
   └─ 返回多版本历史
~~~

## 3. 评分公式信息架构

~~~text
baseScore
├─ productFit             × 0.15
├─ routeFit               × 0.15
├─ demandSignal           × 0.15
├─ timingSignal           × 0.10
├─ stakeholderRelevance   × 0.10
├─ contactability         × 0.15
├─ evidenceQuality        × 0.10
└─ strategicValue         × 0.10

evidenceMultiplier
├─ low    0.70
├─ medium 0.85
└─ high   1.00

executionMultiplier
├─ target_only        0.60
├─ stakeholder_mapped 0.75
├─ contact_found      0.85
└─ contact_verified   1.00

finalScore = round(baseScore × evidence × execution)
~~~

## 4. 商业价值与资源结构

~~~text
commercialValueBand → points
├─ very_low  10
├─ low       25
├─ medium    50
├─ high      75
└─ strategic 100

verifiedOpportunityValue = points × finalScore / 100

resourceCost
= salesHours
+ technicalHours × 1.5
+ marketCostPoints
+ sampleCostPoints
+ travelCostPoints

resourceEfficiency = verifiedOpportunityValue / max(resourceCost,1)
~~~

## 5. 评分执行流程

~~~text
qualifyOpportunity()
  ↓ 运行 opportunity_qualifier
evidenceQuality
├─ >=70 → high
├─ >=40 → medium
└─ <40  → low
  ↓ 固定 execution='contact_verified'
scoreOpportunity()
  ↓
INSERT opportunity_scores(versionNo+1, generatedBy='agent')
  ↓
UPDATE opportunities
├─ hypothesis / score / evidenceConfidence
├─ commercialValueBand
├─ estimated hours / cost points
├─ resourceEfficiency
└─ nextAction
  ↓
Artifact + event
~~~

## 6. 数据、Artifact 与资源流程

~~~text
Agent Context
├─ claims + evidence
├─ approved route
├─ stakeholder roles
└─ verified contacts
    ↓
opportunity_scores（追加版本，不覆盖历史）
    ↓
artifact_versions
└─ artifactType='opportunity_qualification'
    ↓
opportunities 当前汇总值
    ↓
机会详情页 / 看板 / Projector

视觉资源
└─ Confidence 进度组件 + MetricStrip，无独立图表资源
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 8维加权评分
├─ 证据质量乘数和执行成熟度乘数
├─ 商业价值、资源成本和资源效率换算
├─ 多版本 score history
└─ 评分 Artifact、证据引用和领域事件

当前缺口
├─ qualifyOpportunity() 固定传 execution='contact_verified'
│  └─ 不读取数据库实际联系成熟度
├─ sampleCostPoints 和 travelCostPoints 固定为0
├─ Activity 返回 status='contact_path_verified'，不执行资格状态迁移
├─ Agent unknowns 只进入 Workflow 内存 pendingUnknowns，不单独落业务表
└─ 互动再评分采用“各维简单平均”，与首次加权公式不同

当前未确认
└─ 未运行评分；Agent 维度输入、数值分布和资源效率可比性未实测
~~~

## 8. 一句话工程解释

~~~text
资格评分把八类业务信号压缩为最终分和资源效率并保留版本，但首次 Agent 评分与互动后再评分使用了不同公式
~~~
