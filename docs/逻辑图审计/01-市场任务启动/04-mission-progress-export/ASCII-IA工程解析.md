---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T18:25:00+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 市场任务启动 04：mission-progress-export 任务进度与全量导出：ASCII IA 工程解析

> **业务问题**：让负责人看清 Mission 当前阶段、规模、待办和最近变化，并导出完整业务包
> **入口 / 根节点**：`/missions/[missionId]` / `GET /workflow-progress` / `GET /metrics` / `GET /export`
> **相关文件**：`apps/web/app/missions/[missionId]/page.tsx` / `apps/web/components/stage-progress.tsx` / `apps/api/src/market/market.service.ts` / `apps/api/src/market/export.service.ts` / `apps/projector/src/projector.ts`

## 1. 总体架构

~~~text
任务进度与全量导出
├─ SSR 页面：MissionOverviewPage
├─ 进度：mission_progress_read_model，缺失时 Temporal Query
├─ 指标：MarketService.metrics() 直接聚合业务表
├─ 最近变化：timeline_read_model
└─ 导出：MissionExportService + JSZip + mission.exported.v1
~~~

### 层间工作顺序

~~~text
/missions/[missionId]
    ↓ Promise.all
Mission + Metrics + Workflow Progress + Opportunities + Timeline
    ↓
StageProgress / MetricStrip / 当前待办 / 最近变化
    ↓ 用户点击导出
GET /api/v1/missions/:missionId/export
    ↓ export:all
查询 Mission 全域事实
    ↓ JSZip
完整 ZIP 下载 + mission.exported.v1
~~~

## 2. 页面与组件信息架构

~~~text
MissionOverviewPage
├─ PageHeader
│  ├─ title=mission.name
│  └─ refresh / pause-resume / export
├─ Panel“任务阶段”
│  └─ StageProgress
├─ MetricStrip
│  ├─ approvedRoutes / targets / verifiedContacts
│  ├─ opportunities / actionCards
│  └─ budgetUsage
├─ 任务卡摘要
├─ 高优先级机会 Top 5
├─ 当前待办
│  ├─ draft → 启动任务
│  ├─ awaiting_route_review → 进入路线评审
│  └─ 其他 → 系统正在推进
└─ 最近判断变化 Top 5
~~~

## 3. 进度与指标信息架构

~~~text
missionWorkflowProgress()
├─ queries.progress(tenantId, missionId)
│  └─ 有投影 → 直接返回
└─ 无投影
   ├─ Temporal query getMissionProgress
   │  └─ 添加 readModelVersion=0 / lastEventId=null
   └─ Query 失败 → null

metrics()
├─ approvedRoutes：market_routes.status='approved'
├─ targets：mission_entities 全部行
├─ verifiedContacts：source/cross/manual confirmed
├─ actionCards：按 Mission 的全部版本
└─ opportunities：全部状态
~~~

## 4. 页面状态与表现信息架构

~~~text
StageProgress
├─ stages：compiling ... active
├─ 当前 index 之前 → complete
├─ 当前 index → current
├─ 当前 index 之后 → pending
└─ stage-meta
   ├─ 当前工位
   ├─ 子机会 actionReady/total
   ├─ 待用户处理数量
   └─ 预算使用百分比

页面降级
├─ Mission 不存在 → ErrorState
├─ Metrics 缺失 → 全部 0
├─ Opportunities 缺失 → 空数组
└─ Timeline 缺失 → “暂无判断变化”
~~~

## 5. 全量导出执行流程

~~~text
GET /missions/:missionId/export
    ↓ MissionExportService.create()
requirePermission(role, 'export:all')
    ↓
读取 missions
    ↓ 并行查询
claims / routes / entities / relationships / contacts
/ opportunities / actionCards / evidence+snapshot+source / timeline
    ↓
JSZip(DEFLATE level=6)
    ↓
Content-Type: application/zip
Content-Disposition: {mission-slug}-full-export.zip
~~~

## 6. ZIP 数据与资源流程

~~~text
ZIP 根目录
├─ mission.json
├─ capability-ledger.csv
├─ market-routes.md
├─ entities.csv
├─ relationships.csv
├─ contact-points.csv
├─ opportunities.csv
├─ action-cards/
│  └─ {opportunity}-action-card-v{versionNo}.md
├─ evidence-index.csv
└─ timeline.csv

导出审计
└─ domain_events(event_type='mission.exported.v1')
   └─ metadata.format='zip' / files=9+cardRows.length
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ Mission Overview 的阶段、指标、机会、待办和时间线摘要
├─ 进度优先读投影、缺失时降级 Temporal Query
├─ Owner 全量 ZIP 及导出领域事件
└─ CSV 引号转义、文件名 slug 与 Action Card 分文件输出

当前缺口
├─ 页面导出链接对 editor/viewer 仍可见，但 API 只允许 export:all 的 owner
├─ /metrics 的 targets 统计全部 mission_entities，与 Projector 只统计 target/high_priority 不一致
├─ Projector 当前把 budgetUsage 写为 {}，Temporal fallback state 也未包含 budgetUsage 字段
├─ Action Card 总数和导出包含全部版本，不只当前版本
├─ mission.exported.v1 在 ZIP generateAsync() 前写入；压缩失败仍可能已有导出事件
└─ ZIP 在内存生成，没有流式压缩或大任务容量保护

当前未确认
└─ 未生成真实 ZIP，未实测大数据量内存、字符编码、下载权限和文件可打开性
~~~

## 8. 一句话工程解释

~~~text
Mission Overview 并行读取任务、投影进度、实时聚合指标、机会和时间线，Owner 还能把当前全域事实打成带证据索引和行动卡版本的 ZIP，并留下 mission.exported.v1 审计事件
~~~

## 9. M1 实施与运行验收更新

模块状态：已验收

Mission ZIP 已新增 `mission-sources.json`、`sources.json`、`source-snapshots.json`、`mission-progress.json`、`metrics.json`、`domain-events.json` 和 `export-manifest.json`，并保留原有 Capability、Entity、Relationship、Contact、Route、Opportunity 与 Timeline 文件。

验收 Mission 的 Overview/Progress 最终为 completed、100%、Read Model Version=17；Metrics 为 routes=0、targets=3、contacts=0、actionCards=0、opportunities=0；Timeline 26 条，最新为 `mission.completed.v1`。ZIP 共 17 Entries，M1 九个必需文件零缺失，SHA-256 为 `2bb87691860cfe0a3a6d6478497cb2e9b83fe6d81760b61889e9d6a407009b6b`。

Mission Export API 的 owner 权限生效；editor/viewer 页面仍显示 Export 链接的 UX 一致性可在后续界面权限收口时处理，API 权限边界没有放宽。
