---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 决策跟踪 03：runs Agent 与工具运行记录：ASCII IA 工程解析

> **业务问题**：每个 Agent 为什么运行、用了哪个模型和 Prompt、调用了什么工具、消耗多少 Token/成本、成功还是失败
> **入口 / 根节点**：`AgentRunner.execute()` → `DatabaseRunStore` → `run_read_model` → `/runs`
> **相关文件**：`packages/agents/src/runner.ts` / `apps/worker/src/run-store.ts` / `packages/database/src/schema/events.ts` / `apps/projector/src/projector.ts` / `packages/database/src/schema/read-models.ts` / `apps/web/app/missions/[missionId]/runs/page.tsx`

## 1. 总体架构

~~~text
Worker Activity
  ↓ AgentRunner.execute(skillKey)
DatabaseRunStore.start()
  ↓ agent_runs.status='running'
Connector calls
  ↓ tool_runs running → succeeded/failed
ContextBuilder + ModelProvider
  ↓ Agent output / Evidence Validation
agent_runs succeeded/failed
  ↓ Projector.projectRuns()
run_read_model
  ↓ RunsPage
~~~

## 2. Agent Run 信息架构

~~~text
agent_runs / run_read_model
├─ runId / missionId / opportunityId
├─ activityType / skillKey
├─ status
├─ modelProvider / modelName
├─ promptVersionId / contextVersion
├─ inputContextHash
├─ evidenceItemIds[]
├─ inputArtifactIds[] / outputArtifactVersionIds[]
├─ inputTokens / outputTokens
├─ costAmount
├─ traceId
├─ startedAt / completedAt
└─ errorCode / errorMessage
~~~

## 3. Tool Run 信息架构

~~~text
tool_runs
├─ agentRunId
├─ connectorType / operation
├─ status
├─ requestSummary
├─ responseSummary
├─ sourceIds[]
├─ snapshotIds[]
├─ evidenceIds[]
├─ durationMs / costAmount
├─ startedAt / completedAt
└─ errorMessage

Connector evidence
└─ 同时写 Sources + Snapshots + Evidence Items
~~~

## 4. 页面信息架构

~~~text
/missions/[missionId]/runs
├─ Header 汇总
│  ├─ runs.length
│  ├─ inputTokens + outputTokens
│  └─ USD costAmount
├─ “导出运行记录”button
└─ DataTable
   ├─ runType / skillKey
   ├─ status / model
   ├─ Context v / Prompt v
   ├─ inputContextHash 前12位
   ├─ evidence count / tool count
   ├─ Token / cost / duration
   ├─ startedAt
   └─ errorMessage
~~~

## 5. 运行记录流程

~~~text
start()
├─ upsert prompt_versions(skillKey, version)
├─ hash(JSON.stringify(input))
└─ INSERT agent_runs running

每个 Tool
├─ toolStarted → tool_runs running
├─ execute connector
├─ persist evidence
└─ toolCompleted / toolFailed

Model
├─ contextReady → contextVersion/hash/evidence IDs
├─ generate structured output
├─ assertSkillQuality + EvidenceValidator
└─ complete(tokens,cost) / fail(error)
~~~

## 6. 投影与读取流程

~~~text
agent_runs + tool_runs
    ↓ Projector.projectRuns(tenantId, missionId)
run_read_model
├─ toolRuns 以 JSON 嵌入
├─ Token / cost / status
└─ errorMessage
    ↓
GET /runs（permission run:read）
GET /runs/:runId
    ↓
RunsPage
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ Agent、Connector、模型、Context Hash、Evidence 的关联记录
├─ 成功/失败、Token、成本和错误信息
├─ Tool Run 的来源、快照和证据落库
├─ Read Model 与任务范围查询
└─ 页面合计与运行表格

当前缺口
├─ agent_runs/tool_runs 更新本身不发送 Domain Event
│  └─ projectRuns() 只在处理其他 Mission Event 时被调用，读模型可能延迟或停留旧状态
├─ projectRuns() 没有写 runReadModel.promptVersion
│  └─ 页面 Prompt v 可能持续显示“—”
├─ projectRuns() 没有计算/写 runReadModel.durationMs
│  └─ 页面耗时可能持续显示“—”
├─ 有 GET /runs/:runId，但没有对应运行详情页面
├─ 页面只显示 tool count，不展开 Tool Run
└─ “导出运行记录”按钮没有 onClick 或下载链接

当前未确认
└─ 未运行 Agent 或 Projector；读模型刷新时机、耗时字段和失败运行显示未实测
~~~

## 8. 一句话工程解释

~~~text
运行记录底层保存了 Agent 与 Connector 的完整审计字段，但页面读的是由业务事件顺带刷新的 Read Model，部分版本和耗时字段没有被投影进去
~~~
