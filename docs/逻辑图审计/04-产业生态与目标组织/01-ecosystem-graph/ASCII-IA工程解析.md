---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 产业生态与目标组织 01：ecosystem-graph 生态图谱发现与呈现：ASCII IA 工程解析

> **业务问题**：围绕已批准路线发现组织、人员、项目、协会、展会及其公开业务关系并形成可浏览图谱
> **入口 / 根节点**：`discoverEcosystem(routeId)` / `/missions/[missionId]/ecosystem` / `EcosystemGraph`
> **相关文件**：`packages/agents/src/skills.ts` / `apps/worker/src/activities.ts` / `apps/web/app/missions/[missionId]/ecosystem/page.tsx` / `apps/web/components/ecosystem-graph.tsx` / `packages/database/src/schema/research.ts`

## 1. 总体架构

~~~text
生态图谱
├─ Agent：ecosystem_mapper
├─ 持久化：entities + mission_entities + entity_relationships
├─ 版本：ecosystem_map Artifact Version
├─ API：GET entities / relationships / graph
└─ UI：@xyflow/react EcosystemGraph
~~~

### 层间工作顺序

~~~text
每条 approved Route
    ↓ discoverEcosystem(routeId)
ecosystem_mapper + public Connectors
    ↓ EntityCandidate + Relationship Candidate
upsertEntity() + entity_relationships
    ↓
GET entities + relationships
    ↓
ReactFlow nodes + edges
~~~

## 2. Agent 与数据入口信息架构

~~~text
ecosystemMapperSkill
├─ objective：建立实体与业务关系图谱
├─ connectors
│  ├─ web_search / browser
│  ├─ tender_search
│  └─ social_public_search
├─ query：industry ecosystem organizations
├─ query：importer distributor EPC
└─ query：association exhibition project

EcosystemResult
├─ entities[]：candidateKey / identity / aliases / evidenceRefs
└─ relationships[]：sourceKey / targetKey / type / confidence / evidenceRefs
~~~

## 3. 页面与图谱表现信息架构

~~~text
EcosystemPage
├─ GET /entities + GET /relationships
├─ EmptyState：实体为空
├─ Panel“生态图谱”
│  └─ EcosystemGraph
└─ 实体类型概览 Badge

EcosystemGraph
├─ entities.slice(0,80)
├─ 5列固定坐标布局
├─ EntityNode：图标 + label + marketRole
├─ 只保留两端节点都可见的 edge
├─ Background / MiniMap / Controls
└─ height=620 / zoom=0.25..1.6
~~~

## 4. 持久化与领域逻辑信息架构

~~~text
discoverEcosystem()
├─ artifactInTransaction('ecosystem_map')
├─ upsertEntity(candidate)
│  ├─ website 精确相等 → 复用 entity
│  ├─ 否则 INSERT entities
│  └─ UPSERT mission_entities
│     ├─ marketRoles=['ecosystem_member']
│     ├─ relevanceScore=candidate.confidence
│     └─ >=70 → target；否则 observed
└─ INSERT entity_relationships
   └─ attributes.evidenceRefs
~~~

## 5. 发现与展示流程

~~~text
Agent 输出候选
    ↓ candidateKey → entityId Map
关系两端都找到
    ├─ 是 → INSERT directed relationship
    └─ 否 → 跳过该关系
             ↓
Artifact + Entity + Relationship 提交
             ↓
页面请求
    ├─ entities 失败 → ErrorState
    ├─ relationships 失败 → 降级为空数组
    └─ entities 成功 → ReactFlow
~~~

## 6. 数据、证据与资源流程

~~~text
Evidence IDs
├─ EntityCandidate.evidenceRefs
└─ Relationship.evidenceRefs
   ↓ 去重
ArtifactVersion.evidence_refs

关系专属引用
└─ entity_relationships.attributes.evidenceRefs

前端资源
├─ @xyflow/react + style.css
├─ lucide-react entity type icons
└─ 当前无图片、视频或自定义 SVG 文件
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 路线驱动的实体与关系研究
├─ Entity/MissionEntity 分离和 Artifact 版本
├─ ReactFlow 平移、缩放、MiniMap 和类型图标
└─ 空状态与实体类型汇总

当前缺口
├─ PageHeader“导出实体与关系”是普通 button，没有下载逻辑
├─ 图只显示前80个实体；页面没有提示被截断数量
├─ 节点位置是按数组索引固定网格，不是关系驱动布局
├─ Relationship Evidence 没有独立 Link 表，只存 attributes JSON
├─ 缺失 candidateKey 的关系被静默跳过
└─ upsertEntity 只按 website 精确值复用，名称/注册号消歧不在此处执行

当前未确认
└─ 未运行 ReactFlow；大图可读性、边标签重叠和移动端交互未实测
~~~

## 8. 一句话工程解释

~~~text
ecosystem_mapper 按路线生成带证据的实体和关系，Activity 将其写入 Entity 图谱，EcosystemGraph 再把最多80个节点按固定网格呈现，但导出和关系驱动布局尚未实现
~~~
