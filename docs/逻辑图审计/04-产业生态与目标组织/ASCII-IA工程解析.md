---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 04 产业生态与目标组织：ASCII IA 工程解析

> **业务区域**：围绕已批准路线发现组织与业务关系，整理身份并筛出优先目标
> **入口 / 根节点**：`discoverEcosystem()` / `resolveEntities()` / `rankTargets()` / `/ecosystem` / `/targets`
> **相关文件**：`apps/worker/src/activities.ts` / `packages/agents/src/skills.ts` / `apps/web/components/ecosystem-graph.tsx` / `apps/web/app/missions/[missionId]/targets/page.tsx`

## 1. 区域业务主干

~~~text
已批准 Market Routes
    ↓ 每条路线
01-ecosystem-graph
    ↓ Entity + Relationship + Ecosystem Map
02-entity-resolution
    ↓ 当前生成消歧决策 Artifact
03-target-ranking
    ↓ relevanceScore 排序 + high_priority
目标组织进入 Opportunity 创建
~~~

## 2. 原子问题导航

~~~text
04-产业生态与目标组织/
├─ 01-ecosystem-graph/ASCII-IA工程解析.md
├─ 02-entity-resolution/ASCII-IA工程解析.md
└─ 03-target-ranking/ASCII-IA工程解析.md
~~~

- [生态图谱发现与呈现](./01-ecosystem-graph/ASCII-IA工程解析.md)
- [实体身份消歧](./02-entity-resolution/ASCII-IA工程解析.md)
- [目标组织排序](./03-target-ranking/ASCII-IA工程解析.md)

## 3. 区域共享数据

~~~text
entities
    ↕ mission_entities：marketRoles / relevanceScore / targetStatus / primaryRouteId
entity_relationships：source → type → target
    ↓
ecosystem_map Artifact Version
    ↓
target_ranking Artifact Version
~~~

## 4. 当前整体边界

~~~text
当前已实现
├─ 路线驱动的生态 Agent、实体/关系持久化
├─ ReactFlow 图谱浏览
├─ 消歧决策报告
└─ relevanceScore 目标排序与 high_priority 标记

当前未确认
└─ 未运行 Agent 或图谱页面；实体重复率、关系证据和大图性能未实测
~~~

## 5. 一句话工程解释

~~~text
生态区按已批准路线生成实体与关系图，再输出身份决策并按 relevanceScore 选目标，但当前消歧和 Target Gate 的执行深度低于页面文案表达
~~~
