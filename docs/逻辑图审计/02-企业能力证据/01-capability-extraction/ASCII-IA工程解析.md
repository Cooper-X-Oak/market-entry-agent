---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 企业能力证据 01：capability-extraction 企业能力提取：ASCII IA 工程解析

> **业务问题**：从企业官网和用户资料中提取本次 Mission 可用的能力事实及关键未知项
> **入口 / 根节点**：`missionWorkflow()` → `activities.extractCapabilityClaims()` → `capability_evidence_extractor`
> **相关文件**：`packages/workflows/src/mission-workflow.ts` / `apps/worker/src/activities.ts` / `packages/agents/src/skills.ts` / `packages/contracts/src/research.ts` / `packages/database/src/schema/research.ts`

## 1. 总体架构

~~~text
企业能力提取
├─ Workflow：extractCapabilityClaims step
├─ Agent：capability_evidence_extractor
├─ Connector：company_website / browser / document
├─ 输出：CapabilityResult Schema
└─ 持久化：ArtifactVersion + claims + claim_evidence_links
~~~

### 层间工作顺序

~~~text
Mission + Source + Snapshot + uploaded documents
    ↓ ContextBuilder
capability_evidence_extractor
    ↓ Schema + EvidenceValidator
CapabilityResult
    ↓ tenant transaction
capability_ledger Artifact Version
    ↓
claims + claim_evidence_links
~~~

## 2. 输入与触发信息架构

~~~text
MissionWorkflow researching_routes
└─ Promise.all
   └─ extractCapabilityClaims()

AgentTaskInput
├─ Mission 企业、产品、国家、目标、预算
├─ knownClaims：observed/inferred/user_confirmed/unknown
├─ artifactRefs：当前 Artifact Version
├─ uploadedSources：document:{name}|{objectKey}
├─ openQuestions
└─ toolPermissions
~~~

## 3. Agent 与 Connector 信息架构

~~~text
capabilityEvidenceExtractorSkill
├─ permittedConnectors
│  ├─ company_website
│  ├─ browser
│  └─ document
├─ 官网 URL
│  ├─ fetch_page
│  ├─ discover_product_pages
│  └─ discover_certification_pages
├─ 上传文件
│  └─ parse_pdf / docx / xlsx / pptx
└─ maxResearchLoops=2
~~~

## 4. 输出与领域逻辑信息架构

~~~text
CapabilityResult
├─ claims[]
│  ├─ category / statement
│  ├─ status=observed|inferred|unknown
│  ├─ confidence
│  ├─ evidenceRefs[]
│  └─ currentMissionImpact=low|medium|high
└─ missingCapabilities[]
   ├─ capability
   ├─ routeDependency
   └─ questionForUser
~~~

## 5. 持久化执行流程

~~~text
extractCapabilityClaims()
    ↓ runner.execute()
去重所有 claims.evidenceRefs
    ↓ artifactInTransaction()
artifacts(type='capability_ledger')
    ↓ artifact_versions(status='proposed')
每个 output claim
    ↓ INSERT claims(origin='agent', artifactVersionId)
每个 evidenceRef
    ↓ INSERT claim_evidence_links(weight=100)
每个 missingCapability
    ↓ INSERT claims
       status='unknown' / confidence=0 / impact='high'
~~~

## 6. 数据与证据流程

~~~text
Source
└─ SourceSnapshot(content_hash, object_key, extracted_text)
   └─ EvidenceItem(excerpt, locator, stance, relevance, freshness)
      └─ claim_evidence_links
         └─ Claim
            └─ artifact_version_id → Capability Ledger Version

事件
└─ artifact.version_proposed.v1
   └─ evidenceRefs 写入事件 payload
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 官网、产品页、认证页和 Office 文档研究计划
├─ CapabilityResult 结构化校验
├─ 引用必须属于当前上下文 Evidence 集合
├─ 能力账本 Artifact Version 与 Claim/Evidence Link 同事务
└─ 缺失能力显式生成 high-impact unknown Claim

当前缺口
├─ 新一轮提取会追加 Claim，未发现按声明语义去重或自动 supersede 旧 Claim
├─ output.result.claims 可为空，Schema 没有最小数量要求
├─ missingCapability 没有 Evidence Link，依赖 valueJson 保存路线依赖说明
└─ Claim.createdByAgentRunId 在该写入路径未设置

当前未确认
└─ 未运行模型与 Connector，真实 Source 的解析质量和 Evidence 覆盖率未实测
~~~

## 8. 一句话工程解释

~~~text
MissionWorkflow 把官网与上传资料交给 capability_evidence_extractor，输出经 Schema 和证据引用校验后，以一个 Capability Ledger 版本挂接多条 Claim 与精确 Evidence Link，并把缺失能力落成高影响 unknown
~~~
