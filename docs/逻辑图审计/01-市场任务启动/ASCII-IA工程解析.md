---
created_at: '2026-09-03T16:41:17+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 01 市场任务启动：ASCII IA 工程解析

> **业务区域**：定义一次出海研究的企业范围、目标市场、业务目标、预算与后续任务生命周期
> **入口 / 根节点**：`/missions/new`、`/missions/[missionId]`、`/api/v1/missions`
> **相关文件**：`apps/web/app/missions` / `apps/api/src/market/missions.controller.ts` / `apps/api/src/market/market.service.ts` / `packages/workflows/src/mission-workflow.ts`

## 1. 区域总体架构

~~~text
市场任务启动
│
├─ 01-mission-create                         ← 本轮完整快照
│  ├─ apps/web/app/missions/new/page.tsx
│  ├─ MissionForm
│  ├─ POST /api/v1/missions
│  └─ missions(status=draft, current_stage=draft)
│
├─ 02-mission-lifecycle                      ← 已完成
│  ├─ POST /missions/:missionId/start
│  ├─ pause / resume / complete
│  └─ MissionWorkflow + Mission 状态机
│
├─ 03-mission-sources                        ← 已完成
│  ├─ POST /sources/url
│  ├─ POST /sources/upload
│  └─ mission_sources → sources → source_snapshots
│
└─ 04-mission-progress-export                ← 已完成
   ├─ /missions/[missionId]
   ├─ progress / workflow-progress / metrics / stream
   └─ GET /missions/:missionId/export → ZIP
~~~

## 2. 业务发生顺序

~~~text
用户定义企业、产品、市场、目标与预算
    ↓
创建 draft Mission
    ↓ 用户明确点击 start
MissionWorkflow
    ↓
compile mission
    ↓
ingest company sources
    ↓
能力、路线、竞品、专家信号并行研究
    ↓
awaiting_route_review
    ↓ 用户批准路线
生态、目标、机会、行动卡
    ↓
active + weekly Refresh Schedule
    ↓ pause / resume / complete
任务结束或持续刷新
~~~

## 3. 区域入口与消费者

~~~text
/dashboard
    ↓ 新建任务
/missions/new
    ↓ 创建成功
/missions/[missionId]
    ├─ 消费 Mission 当前状态与阶段
    ├─ 触发 refresh / pause / resume
    ├─ 展示 metrics / stage progress
    └─ 导出 Mission ZIP

下游业务区域
├─ Capability Ledger 消费 Mission 范围与 Source
├─ Market Routes 消费目标国家、行业、能力与预算
├─ Ecosystem / Targets 消费已批准 Route
├─ Opportunities / Action Queue 消费目标与触达结果
└─ Refresh Center / Timeline / Runs 消费长期工作流和事件投影
~~~

## 4. 共享运行时关系

~~~text
所有 Mission 命令
    ↓ apps/web/lib/api-client.ts
JWT Cookie / Bearer + Idempotency-Key
    ↓
AuthGuard + ZodPipe + requirePermission()
    ↓
TransactionManager
    ├─ SET LOCAL app.tenant_id
    ├─ 写业务聚合
    ├─ DomainEventWriter.append()
    └─ OutboxRepository.enqueue()
            ↓
        apps/projector
            ↓
        Read Model + SSE

长期任务命令
    ↓ TemporalGateway
MissionWorkflow
    ├─ Signal：route review / pause / resume / refresh / budget / complete
    ├─ Query：stage / progress / pending approvals / budget / child status
    └─ Continue As New：控制长期历史
~~~

## 5. 当前区域边界

~~~text
当前已实现
├─ Mission 创建、读取、更新、启动、暂停、继续、刷新、完成接口
├─ 企业 URL 与上传文件的 Source 接口
├─ progress / workflow-progress / metrics / SSE / ZIP export 接口
└─ MissionWorkflow 的编译、研究、审批等待、子机会和刷新主干

当前完整原子问题
├─ 创建 draft Mission
├─ Mission 生命周期与 Temporal 长期状态
├─ URL / 文件 Source 接入与 Snapshot
└─ Overview 进度、指标、SSE 与全任务 ZIP

运行时状态
└─ 按用户要求未实测；这里只确认静态代码与声明的调用关系
~~~

## 6. 区域一句话工程解释

~~~text
市场任务启动区先把企业、市场、目标和预算固化为 draft Mission，再由显式生命周期命令把它交给 Temporal 长期推进，并通过事件投影持续反馈进度
~~~

## 7. 原子问题导航

~~~text
已完成
├─ 01-mission-create/ASCII-IA工程解析.md
├─ 02-mission-lifecycle/ASCII-IA工程解析.md
├─ 03-mission-sources/ASCII-IA工程解析.md
└─ 04-mission-progress-export/ASCII-IA工程解析.md
~~~

- [创建市场任务：原子问题](./01-mission-create/ASCII-IA工程解析.md)
- [任务生命周期：原子问题](./02-mission-lifecycle/ASCII-IA工程解析.md)
- [企业资料来源：原子问题](./03-mission-sources/ASCII-IA工程解析.md)
- [任务进度与导出：原子问题](./04-mission-progress-export/ASCII-IA工程解析.md)
