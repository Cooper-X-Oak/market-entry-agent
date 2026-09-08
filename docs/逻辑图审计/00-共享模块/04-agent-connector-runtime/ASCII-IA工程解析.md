---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T18:25:00+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 共享模块 04：agent-connector-runtime Agent 与 Connector 运行时：ASCII IA 工程解析

> **业务问题**：让长期工作流以受控工具、结构化输出和证据约束执行市场研究
> **入口 / 根节点**：`createAgentRuntime()` / `AgentRunner.execute()` / `skillCatalog` / `ToolRegistry.execute()`
> **相关文件**：`apps/worker/src/agent-factory.ts` / `packages/agents/src/runner.ts` / `packages/agents/src/skills.ts` / `packages/agents/src/context-builder.ts` / `packages/connectors/src/*`

## 1. 总体架构

~~~text
Agent 与 Connector 运行时
├─ Worker 装配：createAgentRuntime(env, db)
├─ 技能边界：12 个 AgentSkill + Zod outputSchema
├─ 工具边界：ToolRegistry + permittedConnectors + toolPermissions
├─ 上下文边界：AgentContextRepository + ContextBuilder
├─ 模型边界：MockModelProvider 或 OpenAIAgentsModelProvider
└─ 证据边界：EvidenceValidator + RunStore + S3 raw object
~~~

### 层间工作顺序

~~~text
Temporal Activity 提交 AgentTaskInput
    ↓ skillKey
AgentRunner.execute()
    ↓
Skill.planQueries()
    ↓ permitted + runtime tool permissions
ToolRegistry → Connector
    ↓ evidence / normalized output / rawObjectKey
ContextBuilder
    ↓ versioned prompt + output Schema
ModelProvider.generate()
    ↓ quality gate + EvidenceValidator
RunStore complete 或 fail
    ↓
Activity 把结构化结果写入业务事实和 Artifact
~~~

## 2. Skill 目录信息架构

~~~text
skillCatalog
├─ mission_compiler
├─ capability_evidence_extractor
├─ market_route_researcher
├─ competitor_researcher
├─ expert_signal_researcher
├─ ecosystem_mapper
├─ entity_resolver
├─ stakeholder_mapper
├─ contact_path_finder
├─ opportunity_qualifier
├─ action_card_builder
└─ interaction_interpreter

每个 AgentSkill
├─ key / name / objective / instructions
├─ outputSchema
├─ maxResearchLoops
├─ permittedConnectors
└─ planQueries(input)
~~~

## 3. Connector 与 Provider 信息架构

~~~text
MOCK_CONNECTORS=true
└─ createMockConnectorRegistry()

MOCK_CONNECTORS=false
├─ web_search → WebSearchConnector(Tavily)
├─ tender_search → TenderSearchConnector
├─ social_public_search → SocialPublicSearchConnector
├─ browser → BrowserConnector + ObjectStorageConnector
├─ company_website → CompanyWebsiteConnector
├─ document → DocumentConnector + optional OpenAIEmbeddingProvider
└─ contact_verification → ContactVerificationConnector

MOCK_MODEL_PROVIDER=true
└─ MockModelProvider(deterministicAgentFixtures)

MOCK_MODEL_PROVIDER=false
└─ OpenAIAgentsModelProvider + OPENAI_MODEL_RESEARCH
~~~

## 4. 运行时、权限与质量信息架构

~~~text
AgentRunner.execute(input)
├─ skill 不存在 → Unknown Agent Skill
├─ PromptRegistry.active(skill.key)
├─ RunStore.start()
├─ queries 上限
│  └─ min(预算 search+browser, maxResearchLoops*10)
├─ 每个 query
│  ├─ connectorType 必须在 input.toolPermissions
│  ├─ RunStore.toolStarted()
│  ├─ ToolRegistry.execute()
│  ├─ 成功 → toolCompleted()
│  └─ 失败 → toolFailed()，继续其他 query
├─ ContextBuilder.build(input, results)
├─ ModelProvider.generate(outputSchema)
├─ assertSkillQuality()
├─ EvidenceValidator.validate()
└─ complete() 或 fail()
~~~

## 5. 执行与失败流程

~~~text
Connector 不存在
└─ CONNECTOR_UNAVAILABLE(retryable=false)

Live Connector 模式缺 TAVILY_API_KEY
└─ Worker 装配失败

单个 Connector 调用失败
└─ 记录 Tool Run failed；Agent 仍用其他结果继续

模型输出不满足 Schema 或业务质量门
└─ AGENT_OUTPUT_INVALID / AGENT_EVIDENCE_INSUFFICIENT

引用未知 Evidence 或路线缺独立来源
└─ EvidenceValidator 拒绝

整个 Agent 执行失败
└─ RunStore.fail() → Activity / Temporal 决定是否重试
~~~

## 6. 数据、证据与资源流程

~~~text
ConnectorResult
├─ items
├─ evidence[]
│  ├─ source：类型、URL、authority、independentGroupKey
│  ├─ snapshot：fetchedAt、contentHash、objectKey
│  └─ evidence：excerpt、locator、stance、relevance、freshness
├─ normalizedOutputs[]
├─ rawObjectKey
├─ costAmount
└─ durationMs
       ↓
ContextBuilder
├─ Mission / Route / Organization / Opportunity 上下文
├─ 已接受 Artifact 与用户反馈
└─ 允许引用的 evidenceIds
       ↓
Model 结构化输出
       ↓
业务表 + Claim/Evidence + ArtifactVersion + Domain Event
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 12 个边界明确的 Skill
├─ Mock 与 Live Connector/Model 两套装配
├─ Connector 白名单和每次任务工具权限双重限制
├─ Agent Run / Tool Run / token / cost / error 记录
├─ 结构化 Schema、专项质量门和证据引用校验
└─ Browser/Document 原始内容进入 S3/MinIO 对象存储

当前缺口
├─ 单个 Connector 失败后继续，最终是否应失败主要由输出质量门间接决定
├─ Skill 与 Prompt 当前由代码内目录注册，未发现用户侧版本选择界面
├─ Live 模式 Provider 限额、网络与凭据错误只能运行时获知
└─ AgentRunner 不直接写业务表，实际持久化边界分散在 Worker Activities

当前未确认
└─ 未调用真实模型、Tavily、Browser、S3 或 Mock Runtime；成本、质量和重试未实测
~~~

## 8. 一句话工程解释

~~~text
Worker 根据环境装配 Mock 或 Live 研究能力，AgentRunner 只让指定 Skill 调用允许的 Connector，并在结构化 Schema、专项质量门和 Evidence 引用全部通过后才把结果交回 Activity 持久化
~~~

## 9. M1 实施与运行验收更新

模块状态：已验收（Mock Runtime）

真实 Mission Workflow 已调用 Agent 与 Connector Runtime：5 个 Agent Runs 全部 succeeded，16 个 Tool Runs 全部 succeeded，Connector Types 为 browser、company_website、web_search，Agent/Tool Failure 均为 0。Browser 和 Company Website 内容已经形成 Source Snapshot 与 MinIO Object。

本次结论只覆盖 M1 devserver 的 Mock Runtime 运行契约，不把 OpenAI/Tavily 凭据、外部限额、费用或真实网络质量标为已验收；Live Provider 仍需单独的外部依赖验收。


## 2026-09-08 模块纠正增量

当前源码变化及验收状态以 [模块纠正契约](../../模块纠正契约.md) 和 [机器索引](../../模块纠正索引.json) 为准。本页前文保留历史实现说明；新增代码尚未部署，隔离数据库与完整业务集成仍有阻塞。
