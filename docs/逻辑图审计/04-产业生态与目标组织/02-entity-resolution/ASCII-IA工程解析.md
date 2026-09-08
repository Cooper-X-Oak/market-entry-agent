---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 产业生态与目标组织 02：entity-resolution 实体身份消歧：ASCII IA 工程解析

> **业务问题**：判断生态候选是新实体、已有实体重复项，还是需要人工确认的同名关联
> **入口 / 根节点**：`missionWorkflow()` → `activities.resolveEntities()` → `entity_resolver`
> **相关文件**：`apps/worker/src/activities.ts` / `packages/agents/src/skills.ts` / `packages/agents/src/schemas.ts` / `packages/evidence/src/index.ts` / `packages/database/src/schema/research.ts`

## 1. 总体架构

~~~text
实体身份消歧
├─ 规则库：resolveEntity(candidate, existing)
├─ Agent：entity_resolver
├─ Activity：resolveEntities()
└─ 当前输出：Entity Resolution Decisions Artifact Version
~~~

### 层间工作顺序

~~~text
Mission 当前全部 entities
    ↓ 每个 entity
entity_resolver
    ↓ create / merge / link 决策
decisions[]
    ↓
ecosystem_map Artifact Version
    └─ 当前没有执行实体合并或链接写入
~~~

## 2. 身份输入信息架构

~~~text
EntityIdentity
├─ canonicalName
├─ countryCode
├─ website
└─ registrationNumber

Agent Schema 输出
├─ decision=create|merge|link
├─ matchedEntityId（可选）
├─ canonicalName
├─ confidence
├─ reasons[]
└─ evidenceRefs[]
~~~

## 3. 比对规则信息架构

~~~text
resolveEntity() 纯函数
├─ registrationNumber 相同 → merge 理由
├─ 官方 domain 相同 → merge 理由
├─ 规范名称 + countryCode 相同 → merge 理由
├─ 仅规范名称相同 → link，需要 review
└─ 无可靠匹配 → create

名称规范化
├─ lower case
├─ 删除 ltd/limited/inc/corp/gmbh/llc/co
└─ 非字母数字归一为空格
~~~

## 4. Activity 运行时信息架构

~~~text
resolveEntities()
├─ SELECT mission_entities JOIN entities
├─ 对每行执行 runner.execute(entity_resolver)
├─ 收集 { entityId, result }
├─ 汇总所有 evidenceRefs
└─ artifactInTransaction
   ├─ type='ecosystem_map'
   ├─ title='Entity Resolution Decisions'
   └─ payload={ decisions }
~~~

## 5. 执行与失败流程

~~~text
实体 N 个
└─ 顺序执行 N 次 Agent
   ├─ 全部成功 → 写 Decisions Version
   └─ 任一失败 → resolveEntities Activity 失败并由 Temporal 重试

OpportunityWorkflow.resolveEntity()
└─ 只读取 Opportunity 并返回 { decision:'resolved' }
   └─ 不调用这里的 entity_resolver 决策
~~~

## 6. 数据与事件流程

~~~text
输入实体
└─ entities + mission_entities

输出
└─ artifacts(type='ecosystem_map')
   └─ artifact_versions.payload.decisions[]
      └─ artifact.version_proposed.v1

未发生
├─ entities.status / merged_into_id 更新
├─ entity_aliases 写入
├─ relationship 重定向
└─ mission_entities 合并
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ create/merge/link 结构化决策 Schema
├─ 官方域名、注册号、规范名和国家的本地规则函数
├─ 每个 Mission Entity 的 Agent 决策
└─ 决策与 Evidence 作为 Artifact Version 保存

当前缺口
├─ resolveEntities() 不应用 merge/link/create 决策到 entities
├─ 本地 resolveEntity() 纯函数未被生产 Activity 调用
├─ Agent 输入 objective 只有实体名称，候选对比集合依赖通用 Context
├─ entity_aliases 与 mergedIntoId 在该流程未写入
└─ OpportunityWorkflow 把已有 organizationId 直接视为 resolved

当前未确认
└─ 未运行 Agent；决策一致性、重复实体数量与人工复核入口未实测
~~~

## 8. 一句话工程解释

~~~text
当前实体消歧会为每个 Entity 生成有证据的 create、merge 或 link 决策报告，但报告尚未驱动 entities、aliases 和 relationships 的真实合并，因此“已消歧”目前主要是分析产物而非数据变更
~~~
