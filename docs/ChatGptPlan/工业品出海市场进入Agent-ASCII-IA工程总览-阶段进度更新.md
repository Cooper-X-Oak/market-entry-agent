---
created_at: '2026-09-03T16:41:17+08:00'
updated_at: '2026-09-05'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 工业品出海市场进入 Agent：ASCII IA 历史工程总览

> **文档定位（2026-09-05）**：本文保留 M1–M6 的历史工程拆解、进度记录与诊断索引，不承担当前状态、后续阶段安排或验收口径。当前状态与验收统一见 [当前状态与 BM1 验收入口](../testing/README.md)；业务范围与退出条件见 [BM1 业务纵向闭环计划](./BM1-业务纵向闭环计划.md)。BM1 贯通 `Mission → Evidence → Route → Target → Contact → Opportunity → Action Card`，本文中的历史分段不代表新增里程碑已经批准。

> **业务目标**：把企业与目标市场的少量输入，推进为有证据、可审批、可执行、可持续更新的市场进入行动包
> **用户主入口**：`/dashboard` → `/missions/new` → `/missions/[missionId]/*`
> **工程主干**：`apps/web` / `apps/api` / `apps/worker` / `apps/projector` / `packages/*` / PostgreSQL / Temporal / S3

## 1. 项目级业务主流程

~~~text
工业企业出海负责人
    ↓ 创建范围明确的 Market Mission
/missions/new
    ↓ POST /api/v1/missions
01 市场任务启动
    ↓ 启动 MissionWorkflow
02 企业能力证据
    ↓ 用户确认事实、推断、矛盾与未知项
03 市场进入路线
    ↓ 用户批准至少一条有证据的路线
04 产业生态与目标组织
    ↓ 实体消歧、关系建图、目标排序
05 利益角色与公开触达路径
    ↓ 主路径 + 备用路径 + 来源与验证事实
06 市场进入机会
    ↓ 透明评分、资格判断、下一步动作
07 行动卡与人工外联
    ↓ 用户审批、导出并在系统外实际联系
08 真实互动与市场刷新
    ↓ 记录结果、解释新事实、生成刷新建议
09 决策追踪与任务经营
    └─ Dashboard / Timeline / Runs / Export
       持续回答：发生了什么、依据是什么、下一步做什么
~~~

## 2. 按业务发生顺序拆分原子问题

~~~text
docs/逻辑图审计/
│
├─ 00-共享模块/
│  ├─ 01-auth-workspace
│  │  └─ 登录、会话、Workspace 与成员角色
│  ├─ 02-tenant-permission
│  │  └─ tenant_id / RLS / owner-editor-viewer 权限
│  ├─ 03-command-event-projection
│  │  └─ Idempotency-Key → transaction → domain_events → outbox_events → Projector → SSE
│  └─ 04-agent-connector-runtime
│     └─ Agent Skill → Connector → Evidence → Artifact Version
│
├─ 01-市场任务启动/
│  ├─ 01-mission-create                    ← 原 M1 记录已完整处理
│  │  └─ /missions/new → MissionForm → POST /api/v1/missions → missions
│  ├─ 02-mission-lifecycle
│  │  └─ start / pause / resume / complete 与 MissionWorkflow 状态
│  ├─ 03-mission-sources
│  │  └─ 企业官网、URL、上传资料与 Source Snapshot 接入
│  └─ 04-mission-progress-export
│     └─ Overview、workflow-progress、metrics、SSE 与全任务 ZIP
│
├─ 02-企业能力证据/
│  ├─ 01-capability-extraction
│  │  └─ 企业资料 → Capability Claim + Evidence
│  ├─ 02-capability-review
│  │  └─ 查看、编辑、confirm、contradict
│  └─ 03-capability-research
│     └─ 对未知项和冲突项重新研究
│
├─ 03-市场进入路线/
│  ├─ 01-route-research
│  │  └─ 生成 3–8 条 evidence-backed Market Route
│  ├─ 02-route-review
│  │  └─ approve / deprioritize / additional research
│  └─ 03-route-review-complete
│     └─ Route Approval Gate → 进入生态研究
│
├─ 04-产业生态与目标组织/
│  ├─ 01-ecosystem-graph
│  │  └─ Entity + Relationship 图谱
│  ├─ 02-entity-resolution
│  │  └─ 组织身份消歧、合并与关联
│  └─ 03-target-ranking
│     └─ Target Gate、排序、创建 Opportunity
│
├─ 05-利益角色与公开触达路径/
│  ├─ 01-stakeholder-mapping
│  │  └─ 采购、技术影响者、决策者、渠道等角色映射
│  ├─ 02-contact-discovery
│  │  └─ 官方公开主路径与备用路径发现
│  └─ 03-contact-verification
│     └─ Evidence Link + Verification Facts + verify / confirm / mark-stale
│
├─ 06-市场进入机会/
│  ├─ 01-opportunity-create
│  │  └─ 目标组织提升为可推进机会
│  ├─ 02-opportunity-qualification
│  │  └─ 价值、证据、可触达性、资源成本与透明评分
│  └─ 03-opportunity-lifecycle
│     └─ research / pause / resume / archive 与 OpportunityWorkflow
│
├─ 07-行动卡与人工外联/
│  ├─ 01-action-card-build
│  │  └─ 联系对象、渠道、理由、内容、跟进计划
│  ├─ 02-action-card-review
│  │  └─ approve / request_changes / regenerate 与版本链
│  └─ 03-action-card-execute-export
│     └─ Markdown / CSV / 用户外部执行 / execute 标记
│
├─ 08-真实互动与市场刷新/
│  ├─ 01-interaction-record
│  │  └─ 邮件、消息、电话、会议等真实结果录入
│  ├─ 02-interaction-interpretation
│  │  └─ 新 Evidence / Claim / Opportunity 状态 / Action Card 版本
│  ├─ 03-refresh-proposal
│  │  └─ 周期或手动刷新 → 只生成变化建议
│  └─ 04-refresh-review
│     └─ accept / research / defer，不静默覆盖已接受判断
│
└─ 09-决策追踪与任务经营/
   ├─ 01-dashboard
   │  └─ 任务组合、阶段与关键指标
   ├─ 02-timeline
   │  └─ 领域事件投影后的决策时间线
   ├─ 03-runs
   │  └─ Agent Run / Tool Run / 成本 / 失败信息
   └─ 04-mission-export
      └─ 任务事实、证据、实体、机会、行动卡与时间线 ZIP
~~~

## 3. 实际技术拓扑

~~~text
apps/web：Next.js 15 + React 19
    │ REST 命令 / REST 初始快照 / SSE 失效通知
    ↓
apps/api：NestJS 11 + Fastify
    ├─ AuthGuard + ZodPipe + permission policy
    ├─ MarketService / WorkspaceService / ExportService
    ├─ PostgreSQL 事务写入
    │      ├─ 业务表
    │      ├─ domain_events
    │      └─ outbox_events
    ├─ TemporalGateway ───────────────┐
    └─ ObjectStorageConnector ───→ S3 / MinIO
                                      │
Temporal Server                       │
    ↓ 长期状态、Signal、重试、Schedule │
apps/worker                            │
    ├─ packages/workflows             │
    ├─ packages/agents                │
    ├─ packages/connectors ───────────┘
    └─ 结构化结果 → 质量门 → PostgreSQL

PostgreSQL outbox_events
    ↓ claim_outbox_batch
apps/projector
    ↓ read models + projection_checkpoints
pg_notify mission_events
    ↓
apps/api EventStreamService
    ↓ SSE
apps/web 失效并重新读取最新投影
~~~

## 4. 文档入口与历史工程索引

- [当前状态与 BM1 验收入口](../testing/README.md)：唯一当前状态与验收口径入口。
- [BM1 业务纵向闭环计划](./BM1-业务纵向闭环计划.md)：业务范围、决策点与退出条件。

以下为原 M1 工程记录索引：

~~~text
项目总览
├─ 00-共享模块/                       M1 四个模块已运行验收
├─ 01-市场任务启动/                   M1 四个模块已运行验收
├─ M1-运行验收报告.md                 组件、代码、事务与运行证据
└─ M1-端到端验收报告.md               用户主链与最终一致性证据
~~~

- [M1 运行验收报告](./M1-运行验收报告.md)
- [M1 端到端验收报告](./M1-端到端验收报告.md)
- [ASCII IA 工程总览](../逻辑图审计/ASCII-IA工程总览.md)

## 5. M1 历史快照边界（2026-09-04）

~~~text
当次已确认
├─ PostgreSQL、Temporal、MinIO、API、Worker、Projector 与 Web 共同运行
├─ Auth / Workspace / Tenant / Permission 经过真实角色切换验收
├─ Command / Idempotency / Domain Event / Outbox / Projector / SSE 全链成立
├─ Mission Lifecycle、URL Source Snapshot、Progress、Metrics、Timeline 与 ZIP 成立
└─ M1 八个原子模块均已从静态链推进到真实运行链

当次边界
├─ 未清空持久卷执行“空环境连续重建两次”
├─ URL Source 已验收，文件上传兼容性未在该轮重复验收
└─ 本机 Temporal time-skipping Test Environment 初始化仍超时

产品代码
└─ 已完成 M1 范围内实现修复；基线 commit 保持不变，变更仍在工作树中
~~~

## 6. 历史工作进度记录

### 6.1 进度统计口径

| 维度 | 统计口径 | 索引用途 |
|---|---|---|
| 范围建模 | 原子问题是否已经进入总目录 | 判断审计边界是否可管理 |
| 详细工程审计 | 是否追踪到页面、函数、接口、状态、事务、事件、资源和依赖 | 判断模块是否已经具备开发与审查依据 |
| 运行验证 | 是否完成服务启动、测试、浏览器、数据库、Temporal、Projector 与 SSE 验证 | 判断静态设计是否在真实环境成立 |
| 产品实现 | 是否有代码变更、测试证据和验收结果 | 判断业务能力是否真正可用 |

### 6.2 M1 历史进度基线

| 项目 | 当时记录值 | 当时状态判断 |
|---|---:|---|
| 业务区域总图 | 9 个业务区域 | 已建立 |
| 共享模块总图 | 4 个共享模块 | 已建立 |
| 原子问题目录 | 34 个原子问题 | 已列出 |
| 详细原子审计 | 8 / 34 | 约 24% |
| 共享模块详细审计 | 4 / 4 | M1 已运行验收 |
| 业务模块详细审计 | 4 / 30 | 市场任务启动四个模块已运行验收 |
| 运行验证 | M1 主链 1 条 | 已通过 |
| 产品代码变更 | M1 实现已落工作树 | Auth、Transaction、Worker、Mission、Source、SSE、Export、Web、部署脚本 |
| 代码基线 | `main@6159dc7f1c37ac1065bfd74262d7ce59a568967f` + M1 working tree | 尚未提交 |

### 6.3 M0 / M1 历史判断

~~~text
M0 工程审计基线
├─ 已完成：项目业务主流程总图
├─ 已完成：共享模块与九个业务区域的原子目录
├─ 已完成：实际技术拓扑快照
├─ 已完成：01-mission-create 运行链静态追踪
└─ 历史结论：M0 已形成

M1 市场任务启动可运行闭环
├─ 已完成：四个共享模块实现、审计与真实运行验收
├─ 已完成：mission-lifecycle
├─ 已完成：mission-sources 的 URL Source Snapshot 路径
├─ 已完成：mission-progress-export
├─ 已完成：数据库、Temporal、对象存储、投影、SSE 与浏览器验收
└─ 历史结论：M1 核心工程验收链通过；不代表 BM1 Live 业务验收通过
~~~

### 6.4 进度解释

该次记录确认的是 M1 八个原子模块的静态链、开发修复和运行链

约 24% 仍表示详细审计累计覆盖，不代表全产品完成率；它表示 M1 范围已经具有可重复开发所需的实际底座

## 7. M1–M6 历史阶段拆解

本节保留旧计划的模块映射与退出门，供追溯和诊断；不作为当前执行顺序或业务里程碑的验收安排。

### 7.1 历史阶段图

~~~text
原工程拆解
  ↓
M0 工程审计基线                          已完成
  ↓
M1 共享底座与市场任务启动闭环            核心验收通过
  ↓
M2 企业能力证据与市场路线审批闭环        历史分段
  ↓
M3 产业生态、目标组织与公开触达闭环
  ↓
M4 市场机会与行动卡闭环
  ↓
M5 真实互动与受控刷新闭环
  ↓
M6 决策经营、全量导出与发布验收
~~~

### 7.2 阶段范围、累计覆盖与退出门

| 阶段 | 原子模块范围 | 阶段结束时详细审计累计覆盖 | 核心业务结果 | 阶段退出门 |
|---|---|---:|---|---|
| M1 | `00-共享模块` 4 个模块，`01-市场任务启动` 剩余 3 个模块 | 8 / 34，约 24% | 用户可以创建任务、接入来源、控制生命周期，并看到可验证的进度与导出 | 共享权限、事务事件、工作流、投影、SSE、来源接入和任务导出全部经过真实运行验收 |
| M2 | `02-企业能力证据` 3 个模块，`03-市场进入路线` 3 个模块 | 14 / 34，约 41% | 企业资料可以形成可追溯能力证据，并生成至少一条经人工批准的市场路线 | Claim、Evidence、矛盾、未知项、研究回路、路线版本与 Route Approval Gate 全链成立 |
| M3 | `04-产业生态与目标组织` 3 个模块，`05-利益角色与公开触达路径` 3 个模块 | 20 / 34，约 59% | 已批准路线可以转化为去重后的目标组织、利益角色和可核验公开触达路径 | 实体消歧、关系图谱、目标排序、主备触达路径、来源和验证事实能够回溯 |
| M4 | `06-市场进入机会` 3 个模块，`07-行动卡与人工外联` 3 个模块 | 26 / 34，约 76% | 目标组织可以成为透明评分的机会，并形成经审批、可导出的行动卡 | Opportunity 生命周期、评分解释、Action Card 版本链、审批、Markdown 与 CSV 导出、execute 标记成立 |
| M5 | `08-真实互动与市场刷新` 4 个模块 | 30 / 34，约 88% | 真实互动可以转化为新证据和变更建议，并由用户决定是否接受 | Interaction 解释链、刷新建议、accept、research、defer 和禁止静默覆盖规则经过验收 |
| M6 | `09-决策追踪与任务经营` 4 个模块 | 34 / 34，100% | 用户可以从 Dashboard、Timeline、Runs 和全任务 ZIP 经营整个任务 | 指标一致、事件可追踪、运行成本与失败可见、全量导出完整、端到端回归通过 |

## 8. M1 历史执行计划

### 8.1 M1 目标

原计划目标：把静态总览推进为第一个可运行、可复现、可审计的工程闭环

闭环范围从登录与 Workspace 开始，经过任务创建、任务生命周期、来源接入、工作流、事件投影和 SSE，最终到 Overview、进度、指标与全任务导出

### 8.2 M1 工作包顺序

| 顺序 | 工作包 | 主要内容 | 核心交付物 |
|---:|---|---|---|
| 1 | M1-WP01 运行基线 | 启动 PostgreSQL、Temporal、S3 或 MinIO、API、Worker、Projector 和 Web，记录版本、配置、健康状态与基础测试 | `运行验收报告.md`，启动命令，环境变量清单，失败记录 |
| 2 | M1-WP02 Auth 与 Workspace | 追踪登录、会话、Workspace、成员角色和 API Guard | `00-共享模块/01-auth-workspace/ASCII-IA工程解析.md` |
| 3 | M1-WP03 Tenant 与 Permission | 追踪 `tenant_id`、RLS、owner、editor、viewer 与越权边界 | `00-共享模块/02-tenant-permission/ASCII-IA工程解析.md`，权限矩阵 |
| 4 | M1-WP04 Command、Event 与 Projection | 验证 Idempotency-Key、数据库事务、domain events、outbox、Projector、read model、pg_notify 与 SSE | `00-共享模块/03-command-event-projection/ASCII-IA工程解析.md`，事件链运行证据 |
| 5 | M1-WP05 Agent 与 Connector Runtime | 追踪 Agent Skill、Connector、Evidence、Artifact Version、质量门、失败与重试 | `00-共享模块/04-agent-connector-runtime/ASCII-IA工程解析.md`，运行契约 |
| 6 | M1-WP06 Mission Lifecycle | 追踪 start、pause、resume、complete 与 MissionWorkflow 状态、Signal 和持久化 | `01-市场任务启动/02-mission-lifecycle/ASCII-IA工程解析.md`，状态转移矩阵 |
| 7 | M1-WP07 Mission Sources | 追踪官网、URL、上传资料、对象存储、Source Snapshot 与后续消费接口 | `01-市场任务启动/03-mission-sources/ASCII-IA工程解析.md`，来源生命周期图 |
| 8 | M1-WP08 Progress 与 Export | 追踪 Overview、workflow-progress、metrics、SSE 失效刷新和全任务 ZIP | `01-市场任务启动/04-mission-progress-export/ASCII-IA工程解析.md`，导出清单 |
| 9 | M1-WP09 端到端验收 | 执行创建任务、启动、暂停、恢复、接入来源、观察投影、刷新页面和导出 ZIP 的完整用例 | `M1-端到端验收报告.md`，测试证据，缺口清单 |

### 8.3 M1 历史验证主链

~~~text
用户登录
  ↓
选择 Workspace
  ↓
创建 Mission
  ↓
同一 Idempotency-Key 重放验证
  ↓
业务表 + domain_events + outbox_events 同事务验证
  ↓
MissionWorkflow 启动
  ↓
Projector 消费 outbox 并更新 read model
  ↓
pg_notify → API SSE
  ↓
Web 失效并重新读取投影
  ↓
添加 URL 或上传资料并形成 Source Snapshot
  ↓
pause → resume → complete
  ↓
Overview、metrics、timeline 最小投影和 ZIP 导出核对
~~~

### 8.4 M1 退出验收清单

| 验收域 | 通过条件 |
|---|---|
| 可重复启动 | 全栈可以从空环境按文档启动两次，命令和依赖一致 |
| 身份与租户 | owner、editor、viewer 的允许和拒绝场景与权限矩阵一致 |
| 幂等写入 | 同一命令重放不会产生重复业务记录、重复事件或重复工作流 |
| 事务一致性 | 业务写入、domain event 和 outbox event 保持原子性 |
| 工作流一致性 | Mission 状态与 Temporal Workflow 状态在 start、pause、resume、complete 后一致 |
| 投影一致性 | Projector checkpoint、read model、API 返回和页面展示一致 |
| SSE 可恢复 | 断线重连后页面可以重新读取最新投影，不依赖丢失的单条消息 |
| 来源可追溯 | URL 与上传资料都能回溯到 Source Snapshot、对象资源和所属 Mission |
| 导出完整性 | ZIP 包含当前阶段要求的任务事实、来源、事件和进度数据 |
| 测试证据 | 单元、集成与端到端测试均有命令、结果和失败定位信息 |

## 9. 历史原子模块完成标准

原工程计划使用以下五层记录模块完成情况；当前 BM1 业务退出门统一见 [验收入口](../testing/README.md#9-bm1-业务验收清单)。

| 层级 | 完成标准 |
|---|---|
| L1 范围 | 业务问题、输入、输出、参与者和边界明确 |
| L2 静态链 | 页面、接口、服务、函数、数据库、事件、工作流和资源已追踪 |
| L3 运行链 | 正常路径、失败路径、重试、幂等、权限和恢复已经实际验证 |
| L4 开发闭环 | 发现的缺口已经形成代码变更、迁移、测试和文档 |
| L5 业务验收 | 用户可见结果、证据来源、审批点和下一步动作符合业务目标 |

## 10. 历史进度记录字段

原工程计划使用以下字段追踪原子模块；后续当前状态统一维护到 [验收入口](../testing/README.md)，本页保留历史快照。

~~~text
模块状态：未开始 / 静态审计 / 运行验证 / 开发修复 / 已验收
代码基线：branch + commit
文档基线：更新时间
测试证据：命令 + 结果 + 失败链接
已知缺口：问题编号 + 优先级 + 责任阶段
阶段累计：已验收原子模块数 / 34
~~~

原计划把 Dashboard、Timeline 与 Runs 的最小观测能力放在 M1 中用于调试和验收

原计划把 `09-决策追踪与任务经营` 的完整产品能力归入 M6；该归类只保留为历史索引

## 11. M1 历史交付结果

### 11.1 核心链

~~~text
登录                                    PASS
  ↓
选择 Workspace                          PASS
  ↓
创建 Mission + Idempotency 重放          PASS
  ↓
业务表 + Domain Event + Outbox
+ Idempotency Record 同事务              PASS
  ↓
Temporal MissionWorkflow                 PASS
  ↓
Projector → Read Model                   PASS
  ↓
pg_notify → 命名 SSE → Web 自动刷新      PASS
  ↓
URL → Source Snapshot → MinIO Object     PASS
  ↓
pause → resume → complete               PASS
  ↓
Overview / Metrics / Timeline / ZIP      PASS
~~~

### 11.2 最终证据摘要

| 证据 | 结果 |
|---|---|
| Mission | `91975fbe-9f96-483c-8848-b5debdd8cee0`，completed |
| Temporal | `WORKFLOW_EXECUTION_STATUS_COMPLETED`，History Length=103 |
| Transaction | 创建时 Mission、Domain Event、Outbox、Idempotency Record 初始 `xmin=566222` |
| Projector | Read Model Version=17，26/26 Outbox published，未解决失败 0 |
| Agent / Tool | 5 / 16，全部 succeeded |
| MinIO | 本 Mission 9 Objects，URL Snapshot Object 存在 |
| Timeline | 26 条，最新 `mission.completed.v1` |
| ZIP | 17 Entries，M1 必需文件零缺失，SHA-256 `2bb87691860cfe0a3a6d6478497cb2e9b83fe6d81760b61889e9d6a407009b6b` |

完整证据见 [M1 运行验收报告](./M1-运行验收报告.md) 与 [M1 端到端验收报告](./M1-端到端验收报告.md)

### 11.3 保留边界

- 未清空 devserver 持久卷执行空环境连续重建两次
- 文件上传兼容性未在本轮重复执行；本轮按主链要求验收 URL Source
- 本机 Temporal time-skipping Test Environment 初始化超时；真实 Temporal Server 验收通过
