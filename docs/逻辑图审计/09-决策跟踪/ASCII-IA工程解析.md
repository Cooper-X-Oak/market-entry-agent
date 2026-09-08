---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 09 决策跟踪：ASCII IA 工程解析

> **业务区域**：让用户从业务总览、事件链、Agent 运行成本和完整导出四个角度追踪任务是如何形成当前结论的
> **上游**：所有 Mission、Opportunity、Artifact、Interaction、Refresh、Agent Run 和 Domain Event
> **下游**：日常经营判断、问题追溯、人工审计和离线交付

## 1. 总体架构

~~~text
业务写入
├─ PostgreSQL 当前业务表
├─ domain_events + outbox
└─ agent_runs + tool_runs
      ↓
Projector
├─ mission_dashboard_read_model
├─ mission_progress_read_model
├─ timeline_read_model
└─ run_read_model
      ↓
决策跟踪
├─ 01 dashboard
├─ 02 timeline
├─ 03 runs
└─ 04 mission-export
~~~

## 2. 业务信息架构

~~~text
决策跟踪
├─ 01-dashboard
│  ├─ 工作区任务总览
│  ├─ 单任务阶段 / 指标 / 待办
│  └─ 高优先级机会与最近变化
├─ 02-timeline
│  ├─ actor / event / aggregate / version
│  ├─ correlationId 事件链
│  └─ evidenceRefs 数量
├─ 03-runs
│  ├─ Agent Skill / Model / Prompt / Context
│  ├─ Tool Run / Evidence
│  └─ Token / Cost / Duration / Error
└─ 04-mission-export
   └─ ZIP 业务快照 + CSV/Markdown 交付文件
~~~

## 3. 页面与 API 信息架构

~~~text
Web
├─ /dashboard
├─ /missions/[missionId]
├─ /missions/[missionId]/timeline
└─ /missions/[missionId]/runs

API
├─ GET /missions?page=1&pageSize=50
├─ GET /missions/:id/metrics
├─ GET /missions/:id/workflow-progress
├─ GET /missions/:id/timeline
├─ GET /missions/:id/runs
├─ GET /missions/:id/runs/:runId
└─ GET /missions/:id/export
~~~

## 4. HTML / CSS / JS 结构

~~~text
DashboardPage
├─ MetricStrip + DataTable + Panel
└─ Promise.all 拉取前20个 Mission metrics

MissionOverviewPage
├─ 5个 API 并行读取
├─ StageProgress + MetricStrip
└─ 高优先级机会 / 当前待办 / 最近判断

TimelinePage
└─ reduce Map(correlationId) + details 展开事件链

RunsPage
└─ DataTable + 页面端合计 Token/Cost
~~~

## 5. 投影与读取流程

~~~text
Transaction 写业务表 + Domain Event + Outbox
    ↓ Projector claim batch(50, lease 60s)
timeline / dashboard / progress / runs 投影
    ↓ PostgreSQL NOTIFY mission_events
EventStream SSE
    ↓
前端 router.refresh()

部分页面实际读取
├─ Timeline / Runs → Read Model
├─ Mission workflow progress → Read Model，缺失时回退 Temporal Query
└─ Dashboard → Missions + 实时 metrics，不读取 mission_dashboard_read_model
~~~

## 6. 数据、证据与导出资源流程

~~~text
审计数据
├─ domain_events / aggregateVersion
├─ correlationId / causationId
├─ actorType / actorId
├─ evidenceRefs
├─ agent_runs / tool_runs
├─ source_snapshots / contentHash
└─ artifacts / versions
    ↓
页面只读观察
    +
JSZip 完整任务下载
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 工作区和单任务两级总览
├─ correlationId 折叠的决策事件链
├─ Agent/Tool 运行、证据、Token 和成本记录
├─ Projector 重试、checkpoint 和 SSE 更新
└─ 完整任务 ZIP 导出

当前缺口
├─ Dashboard 不使用已存在的 mission_dashboard_read_model
├─ 工作区指标只汇总前20个任务，任务表最多显示50个
├─ Timeline 没有分页、事件详情或证据跳转
├─ Run Read Model 刷新依赖后续业务事件触发 Projector
├─ Runs“导出运行记录”按钮没有处理函数
└─ Mission ZIP 不包含互动、评分、审批、刷新、运行等完整审计表

当前未确认
└─ 未运行 Projector、SSE 或导出；投影延迟、页面汇总和 ZIP 内容未实测
~~~

## 8. 一句话工程解释

~~~text
决策跟踪用事件投影、运行投影和 ZIP 快照把自动研究过程变得可回看，但页面读取口径和导出覆盖范围还没有完全统一
~~~
