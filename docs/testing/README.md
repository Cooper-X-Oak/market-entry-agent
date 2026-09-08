# 当前状态与 BM1 验收入口

> **2026-09-08 最新已观察状态：M1 未通过。** 执行身份修复已部署，恢复后的执行复用了成功 Compiler；行业信号研究真实返回后因缺失 externalIds/aliases 和非法 contradictions[0].claimRef 被业务校验拒绝，其余并行研究取消。当前任务仅有 Mission Brief 与已采集网页来源，没有生态、目标、联系与行动卡完整结果。当前代码先批准路线再研究生态，与用户要求的市场生态前置存在差异，尚未改动。Web 仍为按需编译的开发模式，已有 27–32 秒页面请求记录。五地区不能标为通过。

本次文档整理没有重新运行测试或业务任务。此前工程测试结论仅适用于当时范围；私有原始日志在本地 `.grok/verify-artifacts/` 保留，不上传 GitHub，下面历史链接可能只能在本地使用。架构现状见 [业务总图](../逻辑图审计/ASCII-IA工程总览.md)。


本页是当前状态与验收口径的唯一维护入口；BM1 业务范围与退出条件见 [BM1 业务纵向闭环计划](../ChatGptPlan/BM1-业务纵向闭环计划.md)。历史报告和原始证据保留当时的结论，不随本页更新而改写。测试与验证仅在用户明确授权后执行。

## 1. 当前记录基线（2026-09-05）

下表状态来自已有验收与配置记录，文档收敛本身不重新执行这些验收；记录中的观察时间不代表实时状态。本轮另行授权的局部排序实验及其独立进程观察，单独记录在下方工作表与运行报告中。

| 项目 | 当前状态 |
|---|---|
| 产品版本 | `1.0.0` |
| 历史代码基线 | 原 M1 文档记录为 `main@6159dc7f1c37ac1065bfd74262d7ce59a568967f` + working tree；后续 BM1 部署结果见对应运行报告 |
| Web 版本 | Next.js `15.5.24` |
| 测试环境 | Vultr 4 GB 临时开发服务器，本机经 SSH Tunnel 访问 |
| BM1 Fixture 工程链 | 2026-09-05 重建部署验收记录为 PASS；该次 Mission 为 `fixture`，服务器使用两个 Mock 开关 |
| CPA 模型能力 | 2026-09-05 01:43:50 UTC（北京时间 09:43:50）记录：`gpt-6-astra`、`gpt-5.6-sol`、`gpt-5.6-luna` 的结构化输出与 Web Search 均 PASS |
| API / Worker 模型配置 | 2026-09-05 01:47:21 UTC（北京时间 09:47:21）回读：两个容器的 research / extraction / writing 三角色均为 `gpt-6-astra` |
| Embeddings | 独立的 404 问题仍未解决；不在上述 CPA 分层验收范围内 |
| BM1 Live | 全链业务有效性尚未验收；Fixture 工程链与 CPA 能力 PASS 均不替代该验收 |
| 服务器历史状态 | 2026-09-05 重建报告记录服务 Ready；实例和 Tunnel 是否仍在线需在获授权的运行验收中确认 |

证据入口：

- [BM1 重建部署验收](./runs/BM1-重建部署验收-20260905.md)：Fixture 工程链历史结果；其中 Provider 缺失和 Mock 配置仅描述该次运行。
- [CPA 分层检查记录](../../.grok/verify-artifacts/20260905T014226Z-cpa-tiered/inspection-run.json)、[三模型探测结果](../../.grok/verify-artifacts/20260905T014226Z-cpa-tiered/probe-tiered-result.json)、[运行模型配置回读](../../.grok/verify-artifacts/20260905T014226Z-cpa-tiered/runtime-model-config.json)：独立证明上述模型能力与记录时的模型选择，不包含完整 BM1 Live 或 Embeddings 验收。
- [M1 运行验收报告](../ChatGptPlan/M1-运行验收报告.md)、[4 GB 完整可视验收](./runs/M1-可视验收-20260904-170929.md)、[F01/F02 修复回归](./runs/M1-F01-F02-修复回归-20260904-174839.md)：历史 M1 工程证据。

本轮授权工作按以下顺序推进；BM2–BM5 提议不视为已批准或已落地的里程碑。

| 工作 | 本轮实施状态 | 完成边界 |
|---|---|---|
| 收敛旧文档入口与验收口径 | 已完成文档修改 | 本页为唯一当前入口；历史报告、PASS / FAIL / BLOCKED 及原始证据保留 |
| 解除 Demo 默认依赖 | 已完成本地源码修改 | 默认 `postgres-bootstrap` 只初始化身份，完整 Demo 留在显式 `db:seed` / `demo` profile；未部署，未在现有数据库执行初始化 |
| 目标排序业务消融 | 首轮中止，未形成有效业务对照 | 五个市场 29 个候选输入已保存；真实 Schema 转换失败后使用实验适配，首个不搜索组日志显示完成，但最终 JSON 回传为空；搜索组无可审阅结果。保留默认搜索，见 [首轮记录](runs/目标排序消融-20260905.md) |

Bootstrap 定向源码类型检查采用当前 Contracts / Domain 源码引用并通过。常规本机包检查首先因本机依赖准备策略被阻断；直接包级检查随后暴露既有 Contracts 编译声明与当前 Mission stage 源码不一致。未为此改动构建许可、刷新整套产物或修改业务状态机。定向检查只覆盖新 bootstrap 与保留的 seed 及其源码依赖，不表示服务启动或登录验收通过。

局部实验另发现：真实 `target_ranker` 输出 Schema 在原 SDK-Zod 严格转换时因可选字段失败，发生在排序模型请求之前。该问题不推翻既有简单 Schema 的 CPA 分层 PASS，但说明其不能代替真实业务 Agent 的输出结构验收。本次只在实验执行器内对两组应用同一非严格 JSON Schema 传输适配，保留原业务 Zod 校验；应用 Provider 与业务 Schema 尚未因此修复或部署。

## 2. 现在真实到什么程度

### BM1 需要成立的真实工程链

- 登录、Session、Workspace 选择与角色权限。
- Mission 创建、持久化、刷新后保持。
- Idempotency、业务写入、Domain Event、Outbox 同事务。
- Temporal MissionWorkflow 的启动、暂停、恢复和完成。
- Projector、Read Model、`pg_notify`、SSE 和 Web 刷新。
- 公开 URL 抓取、Source Snapshot 和 MinIO Object。
- Overview、Progress、Metrics、Timeline 和 Mission ZIP。

### 已有 Fixture 验收的边界

- Agent 生成的能力声明、市场路线和后续研究内容。
- Mock Connector 返回的目标组织、联系方式和网页结果。
- `RheinWerk Distribution GmbH` 等名称及所有 `.example` 地址。
- 现有三条 Playwright E2E 使用固定 Seed Mission，不证明真实市场研究质量。

因此，已有 Fixture 证据证明对应工程链能够运行，不能证明 BM1 市场研究有效。CPA 分层检查补充了 Provider 能力证据；真实业务结果仍须用新的 Live Mission 按第 9 节验收。

## 3. 历史问题索引：Hydration 红屏

截图的 Hydration 差异属性是：

```text
data-immersive-translate-page-theme="light"
```

项目根布局只输出 `<html lang="zh-CN">`，仓库中也没有上述属性。该属性由浏览器的“沉浸式翻译”扩展在 React Hydration 前注入。

2026-09-04 的无扩展 Agent Browser 验收还发现另一条独立问题：Source 时间在远端 SSR 显示 `09:18:43`，在本地客户端显示 `17:18:43`，同样会触发 Hydration 错误。它来自 `source-manager.tsx` 中未固定时区的 `toLocaleString('zh-CN')`。当前已改为显式 `Asia/Shanghai` formatter，并在带 URL/PDF Source 的新 Session 中硬刷新通过：page errors、`role=alert`、Next.js issues overlay 均为 0。

处理方法：

1. 对 `localhost` 暂停“沉浸式翻译”扩展，或使用关闭扩展的无痕窗口。
2. 重新打开 `http://localhost:3000/login`。
3. 红屏消失后再开始业务测试。

右上角 `Next.js 15.5.24 (outdated)` 是开发环境版本提示，与本次 Hydration 属性差异是两件事。

## 4. M1 基础链回归用例索引

以下保留原 M1 用例编号，用于定位基础功能问题；BM1 业务验收统一使用第 9 节。Demo 登录与 Fixture 结果适用于显式演示场景。

| ID | 操作 | 本阶段通过标准 |
|---|---|---|
| ENV-01 | 关闭扩展后打开 `/login` | 页面正常显示，无 Hydration 红屏 |
| M1-UI-01 | 全新 Session 打开 `/dashboard` | 进入 `/login` |
| M1-UI-02 | 使用 Demo Owner 登录 | 进入 `/workspaces` |
| M1-UI-03 | 选择 Demo Workspace | 进入 `/dashboard`，能看到任务列表 |
| M1-UI-04 | 创建唯一名称的新 Mission | 新 Mission 建立，填写内容正确，初始状态为 `draft` |
| M1-UI-05 | 刷新新 Mission 页面 | Mission 和 Workspace 保持，不回到登录页 |
| M1-UI-06 | 启动 Mission | 状态进入 `running`，随后推进到路线评审等待阶段；研究内容允许是 Fixture |
| M1-SRC-01 | 添加一个可公开访问的 HTTPS URL | 页面出现 Source，后台形成 Snapshot 和对象存储记录 |
| M1-SRC-02 | 上传一个小型 PDF | 页面出现上传 Source；这是当前需要补验的路径 |
| M1-WF-01 | 对运行中的 Mission 执行暂停 | 状态变为 `paused`，按钮变为“继续” |
| M1-WF-02 | 执行继续 | 状态回到 `running` |
| M1-WF-03 | 执行完成 | 状态和阶段变为 `completed`，生命周期按钮消失 |
| M1-READ-01 | 查看 Overview、Metrics、Timeline | 数据与该 Mission 的实际状态一致；允许部分业务指标为 0 |
| M1-EXP-01 | 下载 Mission ZIP | ZIP 可打开，包含 Mission、Sources、Snapshots、Progress、Metrics、Events、Timeline 和 Manifest |
| M1-AUTH-01 | 点击退出，再打开 `/dashboard` | 进入 `/login`，旧 Session 不再访问业务数据 |

Demo 账号：`owner@demo.local` / `Demo123!`，Workspace 为 `Demo Industrial Workspace`。

## 5. 内部验收索引与历史 M1 记录

这些测试需要 API、PostgreSQL、Temporal、MinIO 或 SSE 证据，不适合只看页面判断。下表保留 2026-09-04 的 M1 记录；2026-09-05 的 BM1 Owner 主链与未重跑项见 [BM1 重建部署验收](./runs/BM1-重建部署验收-20260905.md)。

| ID | 测试任务 | 历史 M1 记录 |
|---|---|---|
| M1-INT-01 | 相同 `Idempotency-Key` 和 Payload 返回同一 Mission ID | 新 4 GB 已通过：HTTP 201，返回同一 Mission ID |
| M1-INT-02 | Mission、Idempotency Record、Domain Event、Outbox 同事务 | 新 4 GB 已通过：四行 `xmin=674986` |
| M1-PERM-01 | owner/editor/viewer 和跨 Tenant 权限 | 原服务器通过；新 4 GB 待回归 |
| M1-TEMP-01 | Mission 状态与 Temporal Workflow/Signal 一致 | 新 4 GB 已通过：`missionWorkflow` Completed，History 71 |
| M1-PROJ-01 | Outbox → Projector → Read Model → SSE → Web | 新 4 GB 已通过：暂停态由 SSE 自动刷新；未解决投影失败为 0 |
| M1-STO-01 | URL Source、Snapshot、Object Key 和 MinIO Object 对齐 | 后端已通过；F01 前端成功态已修复并在新 4 GB Session 定向回归通过 |
| M1-UPLOAD-01 | PDF、DOCX、XLSX、PPTX 分别上传和解析 | 代码存在；完整格式兼容性待验收 |
| M1-EXP-02 | ZIP 文件清单、数量和 Manifest 一致 | 新 4 GB 已通过：15 个条目，ZIP SHA256 已记录 |
| M1-BOOT-01 | 清空持久卷后连续重建两次 | 待执行，需要单独破坏性测试授权 |
| M1-TEST-01 | Temporal time-skipping Test Environment | 当前初始化超时，待修复测试基础设施 |

## 6. 自动化测试索引

原 M1 清单记录 13 个可执行测试文件、42 个 `it/test` 用例，另有一个 Playwright helper；本次未重新统计：

- 6 个 Unit/Contract 文件：Contracts、Domain、Policies、Evidence、Connectors、Agent Eval。
- 1 个 PostgreSQL Integration 文件。
- 3 个 Temporal Workflow 文件：Mission、Opportunity、Refresh。
- 3 个 Playwright E2E 文件：固定 Seed Mission 的市场链、能力账本、刷新提案。

现有 Playwright E2E 尚未自动覆盖：创建新 Mission、Idempotency、pause/resume/complete、URL/文件 Source、ZIP、退出登录和新 4 GB 环境回归。

已有命令：

```powershell
pnpm test
pnpm test:integration
pnpm test:workflow
pnpm test:e2e
```

## 7. Fixture 场景与产品边界

- 显式 Fixture / Mock 场景出现虚构公司、`.example` 联系方式或固定路线：属于该模式的设计结果。
- 显式 Fixture / Mock 场景的新 Mission 研究内容与 Demo 类似：属于该模式的设计结果；Live 验收必须使用真实来源与目标。
- 未自动发送邮件或消息：V1 设计为用户复制、导出并在外部执行。
- M2–M6 页面已有代码或 Seed 数据：代码存在不等于该阶段已经完成真实业务验收。

## 8. 提交问题时写这六项

```text
测试 ID：例如 M1-UI-06
时间：
使用的 Mission 名称或 ID：
操作步骤：
预期结果：引用本清单对应行
实际结果：附当前 URL 和截图；注明浏览器扩展是否已关闭
```

提交时注明 Mission 的 `executionMode`，区分 Fixture 演示结果、Provider 调用问题和 BM1 Live 业务有效性问题。

## 9. BM1 业务验收清单

验收前提：在用户授权后确认目标环境已部署拟验收代码，Provider 可用，且 `MOCK_CONNECTORS=false`、`MOCK_MODEL_PROVIDER=false`。每次验收创建全新 `executionMode=live` Mission。已有 CPA PASS 仅覆盖结构化输出与 Web Search；Embeddings 404 作为独立未解决项记录，不能视为已通过。

| ID | 业务操作 | BM1 通过标准 |
|---|---|---|
| BM1-01 | 输入一家真实工业企业、官网、产品范围、目标国家与行业并启动 Mission | 驾驶舱显示 `Live`，Mission 进入企业证据研究 |
| BM1-02 | 查看企业能力账本 | 能力声明引用可打开的公开来源；高影响声明区分确认、矛盾与未知 |
| BM1-03 | 完成 Capability Review | 全部高影响声明已处理，至少一项确认能力有公开证据，流程进入路线研究 |
| BM1-04 | 查看并批准 Market Route | 每条路线显示支持证据、反证、目标角色与触达渠道；批准 1–3 条 |
| BM1-05 | 查看 Target Top 10 | 最多展示 10 个有评分、理由和来源的真实候选组织 |
| BM1-06 | 完成 Target Review | 从 Top 10 选择 1–3 个目标，后续只为已选目标继续研究 |
| BM1-07 | 查看 Contact、Opportunity 与 Action Card | 有公开触达路径时形成 Outreach Card；公开联系方式不足时形成 Research Card |
| BM1-08 | 审批 Action Card | 至少一张卡证据可回溯、未知项明确并成功批准；内容修改形成新版本 |
| BM1-09 | 查看 Mission 驾驶舱 | `Mission → Evidence → Route → Target → Contact → Opportunity → Action Card` 的状态、数量和当前决策一致 |
| BM1-10 | 下载 Mission ZIP | ZIP 包含来源快照、Evidence Index、路线证据链接、Target Assessments、Action Card 证据链接、Timeline 与 Manifest |

BM1 业务退出条件：Top 10 已形成，用户选择 1–3 个目标，至少一张 Action Card 已批准，全部关键判断都能回到公开证据。已有 Fixture 工程路径和 CPA 能力记录分别通过；BM1 Live 全链仍未验收。
