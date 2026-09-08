---
created_at: '2026-09-03T16:41:17+08:00'
updated_at: '2026-09-08T19:12:52+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 工业品出海市场进入 Agent：ASCII IA 工程总览

本图描述当前工作区实现；Git 提交字段是修改前基线，本次提交保存图与源码。文档存在不代表业务通过。

## 1. 业务目标与参与者

~~~text
委托研究方 + 可选供应方 + 产品 / 地区 / 客户角色范围
    ↓ 用户创建 Mission，研究人员审阅证据与决策
真实市场认识 → 进入路线 → 匹配客户 → 官方联系路径 → 待审核行动建议
    ↓
网页可读、持久化可重读、结果可导出

当前业务要求
├─ 先搞清市场生态，再决定进入路线和目标
├─ 委托方不等于供应方；未知供应能力不得虚构
├─ 喀山限定城市；其余范围为马来西亚、印尼、哈萨克斯坦、越南
└─ 不自动批准行动卡，不自动对外触达
~~~

## 2. 当前实现的执行顺序（不是已批准的新设计）

~~~text
/missions/new → POST /api/v1/missions → MissionWorkflow
    ↓ loadMission → compileMission
供应方是否已知？
    ├─ 已知 → ingestCompanySources → extractCapabilityClaims → 人工能力审核
    └─ 未知 → 跳过供应方能力研究
    ↓ Promise.all（三个结果必须全部成功）
    ├─ researchMarketRoutes：提出市场进入路线
    ├─ researchCompetitors：研究竞争对手
    └─ researchExpertSignals：研究观点、专家线索
    ↓ 人工路线审核 → recordRouteReview
    ↓ discoverEcosystem：围绕已批准路线建立实体与关系
    ↓ resolveEntities → rankTargets → 人工目标审核
    ↓ createOpportunity → OpportunityWorkflow
    ↓ 联系研究 → 资格判断 → 行动卡 → 人工审核
    ↓ 后续互动 / 刷新 / 导出

实际源码
├─ packages/workflows/src/mission-workflow.ts：主编排、并行与审核等待
├─ packages/agents/src/skills.ts：路线、竞品、专家、生态研究目标
└─ apps/worker/src/activities.ts：Agent 调用、业务保存与事件

与业务要求的差异
├─ 生态位于路线批准之后，不是路线判断的前置输入
├─ 路线与竞品、专家同时执行，不等待本轮另外两项完成再综合判断
├─ 供应方未知时仍固定启动竞争对手研究；竞争/客户角色定位尚未解决
└─ 行业信号失败会阻断进入生态；修好 Schema 不等于纠正业务顺序
~~~

## 3. 当前执行身份与运行事实

~~~text
稳定业务执行身份 missionExecutionId
├─ restart：新身份
├─ recover：复用身份，优先 Reset 旧有效 History
├─ ownershipRunId：仅所有权 / Fencing
├─ V2：endpoint 区分 activityType，key 使用 executionId + businessId
├─ requestHash：归一化业务 payload，排除运行身份元数据
├─ loadMission：纯读取
└─ 旧 History 缺少新字段时继续 v1 参数逻辑

2026-09-08 本轮已读取的运行记录（不是实时监控）
├─ 成功 Compiler 被复用，恢复后进入三个研究节点
├─ 行业信号收到真实 Provider 返回后 OUTPUT_INVALID
│  ├─ opinions 中 externalIds / aliases 缺失
│  └─ contradictions[0].claimRef 非法 UUID
├─ 其余两个研究记录取消；没有执行到 discoverEcosystem
├─ 该 Mission 仅有 mission_brief Artifact，网页来源已保存但未形成生态成果
└─ 五地区业务均未完成；不以单项工程通过替代业务结果

网页访问边界
├─ Web 开发模式按需编译，已有页面请求 27 / 32 秒的记录
├─ 不能把“登录页能打开”当成交互可用
└─ 本轮没有修改 Web 部署方式
~~~

## 4. 原子问题目录与文档状态

本轮只更新总图，不逐一重写原子文档。已有 34 份原子文档均需对照累计改动重新核对，因此取消旧的“34/34 已完成”结论。

~~~text
00-共享模块
├─ [需更新] 共享模块 01：auth-workspace 账户、会话与工作区：ASCII IA 工程解析
│  └─ 文档 → `00-共享模块/01-auth-workspace/ASCII-IA工程解析.md`
├─ [需更新] 共享模块 02：tenant-permission 租户隔离与权限：ASCII IA 工程解析
│  └─ 文档 → `00-共享模块/02-tenant-permission/ASCII-IA工程解析.md`
├─ [需更新] 共享模块 03：command-event-projection 命令、事件、投影与 SSE：ASCII IA 工程解析
│  └─ 文档 → `00-共享模块/03-command-event-projection/ASCII-IA工程解析.md`
├─ [需更新] 共享模块 04：agent-connector-runtime Agent 与 Connector 运行时：ASCII IA 工程解析
│  └─ 文档 → `00-共享模块/04-agent-connector-runtime/ASCII-IA工程解析.md`
01-市场任务启动
├─ [需更新] 市场任务启动 01：mission-create 创建市场任务：ASCII IA 工程解析
│  └─ 文档 → `01-市场任务启动/01-mission-create/ASCII-IA工程解析.md`
├─ [需更新] 市场任务启动 02：mission-lifecycle 任务生命周期：ASCII IA 工程解析
│  └─ 文档 → `01-市场任务启动/02-mission-lifecycle/ASCII-IA工程解析.md`
├─ [需更新] 市场任务启动 03：mission-sources 企业资料来源接入：ASCII IA 工程解析
│  └─ 文档 → `01-市场任务启动/03-mission-sources/ASCII-IA工程解析.md`
├─ [需更新] 市场任务启动 04：mission-progress-export 任务进度与全量导出：ASCII IA 工程解析
│  └─ 文档 → `01-市场任务启动/04-mission-progress-export/ASCII-IA工程解析.md`
02-企业能力证据
├─ [需更新] 企业能力证据 01：capability-extraction 企业能力提取：ASCII IA 工程解析
│  └─ 文档 → `02-企业能力证据/01-capability-extraction/ASCII-IA工程解析.md`
├─ [需更新] 企业能力证据 02：capability-review 能力声明人工评审：ASCII IA 工程解析
│  └─ 文档 → `02-企业能力证据/02-capability-review/ASCII-IA工程解析.md`
├─ [需更新] 企业能力证据 03：capability-research 能力重新研究：ASCII IA 工程解析
│  └─ 文档 → `02-企业能力证据/03-capability-research/ASCII-IA工程解析.md`
03-市场进入路线
├─ [需更新] 市场进入路线 01：route-research 路线研究：ASCII IA 工程解析
│  └─ 文档 → `03-市场进入路线/01-route-research/ASCII-IA工程解析.md`
├─ [需更新] 市场进入路线 02：route-review 路线逐条评审：ASCII IA 工程解析
│  └─ 文档 → `03-市场进入路线/02-route-review/ASCII-IA工程解析.md`
├─ [需更新] 市场进入路线 03：route-review-complete 路线评审完成：ASCII IA 工程解析
│  └─ 文档 → `03-市场进入路线/03-route-review-complete/ASCII-IA工程解析.md`
04-产业生态与目标组织
├─ [需更新] 产业生态与目标组织 01：ecosystem-graph 生态图谱发现与呈现：ASCII IA 工程解析
│  └─ 文档 → `04-产业生态与目标组织/01-ecosystem-graph/ASCII-IA工程解析.md`
├─ [需更新] 产业生态与目标组织 02：entity-resolution 实体身份消歧：ASCII IA 工程解析
│  └─ 文档 → `04-产业生态与目标组织/02-entity-resolution/ASCII-IA工程解析.md`
├─ [需更新] 产业生态与目标组织 03：target-ranking 目标组织排序：ASCII IA 工程解析
│  └─ 文档 → `04-产业生态与目标组织/03-target-ranking/ASCII-IA工程解析.md`
05-利益相关者与联系路径
├─ [需更新] 利益相关者与联系路径 01：stakeholder-mapping 利益相关者映射：ASCII IA 工程解析
│  └─ 文档 → `05-利益相关者与联系路径/01-stakeholder-mapping/ASCII-IA工程解析.md`
├─ [需更新] 利益相关者与联系路径 02：contact-discovery 联系路径发现：ASCII IA 工程解析
│  └─ 文档 → `05-利益相关者与联系路径/02-contact-discovery/ASCII-IA工程解析.md`
├─ [需更新] 利益相关者与联系路径 03：contact-verification 联系点验证：ASCII IA 工程解析
│  └─ 文档 → `05-利益相关者与联系路径/03-contact-verification/ASCII-IA工程解析.md`
06-市场机会
├─ [需更新] 市场机会 01：opportunity-create 机会创建：ASCII IA 工程解析
│  └─ 文档 → `06-市场机会/01-opportunity-create/ASCII-IA工程解析.md`
├─ [需更新] 市场机会 02：opportunity-qualification 机会资格评分：ASCII IA 工程解析
│  └─ 文档 → `06-市场机会/02-opportunity-qualification/ASCII-IA工程解析.md`
├─ [需更新] 市场机会 03：opportunity-lifecycle 机会生命周期：ASCII IA 工程解析
│  └─ 文档 → `06-市场机会/03-opportunity-lifecycle/ASCII-IA工程解析.md`
07-行动卡
├─ [需更新] 行动卡 01：action-card-build 行动卡生成：ASCII IA 工程解析
│  └─ 文档 → `07-行动卡/01-action-card-build/ASCII-IA工程解析.md`
├─ [需更新] 行动卡 02：action-card-review 行动卡编辑与审批：ASCII IA 工程解析
│  └─ 文档 → `07-行动卡/02-action-card-review/ASCII-IA工程解析.md`
├─ [需更新] 行动卡 03：action-card-execute-export 行动卡执行与导出：ASCII IA 工程解析
│  └─ 文档 → `07-行动卡/03-action-card-execute-export/ASCII-IA工程解析.md`
08-互动与刷新
├─ [需更新] 互动与刷新 01：interaction-record 真实互动记录：ASCII IA 工程解析
│  └─ 文档 → `08-互动与刷新/01-interaction-record/ASCII-IA工程解析.md`
├─ [需更新] 互动与刷新 02：interaction-interpretation 互动解释与业务更新：ASCII IA 工程解析
│  └─ 文档 → `08-互动与刷新/02-interaction-interpretation/ASCII-IA工程解析.md`
├─ [需更新] 互动与刷新 03：refresh-proposal 定期刷新与变化提案：ASCII IA 工程解析
│  └─ 文档 → `08-互动与刷新/03-refresh-proposal/ASCII-IA工程解析.md`
├─ [需更新] 互动与刷新 04：refresh-review 刷新提案评审：ASCII IA 工程解析
│  └─ 文档 → `08-互动与刷新/04-refresh-review/ASCII-IA工程解析.md`
09-决策跟踪
├─ [需更新] 决策跟踪 01：dashboard 工作区与任务仪表盘：ASCII IA 工程解析
│  └─ 文档 → `09-决策跟踪/01-dashboard/ASCII-IA工程解析.md`
├─ [需更新] 决策跟踪 02：timeline 决策时间线：ASCII IA 工程解析
│  └─ 文档 → `09-决策跟踪/02-timeline/ASCII-IA工程解析.md`
├─ [需更新] 决策跟踪 03：runs Agent 与工具运行记录：ASCII IA 工程解析
│  └─ 文档 → `09-决策跟踪/03-runs/ASCII-IA工程解析.md`
├─ [需更新] 决策跟踪 04：mission-export 完整任务导出：ASCII IA 工程解析
│  └─ 文档 → `09-决策跟踪/04-mission-export/ASCII-IA工程解析.md`
~~~

## 5. 跨业务共享链

~~~text
Web → API 身份 / Workspace / 权限 / 命令幂等
    ↓ Workflow → Worker → Agent → Connector / Provider
    ↓ 原业务 Schema 与证据校验
    ↓ 业务记录 + Domain Event + Outbox + Idempotency 同事务
    ↓ Projector → Read Model → SSE → Web 重新读取

主要消费者
├─ 用户：总图、研究来源、路线、目标、行动卡和导出
├─ 开发者：原子文档中的入口、调用、状态与边界
└─ 运行系统：源码与迁移；构建产物不纳入 Git
~~~

## 6. 文档导航（原子文档保留旧快照，不代表本轮已复核）

- [00 共享模块：区域总览](./00-共享模块/ASCII-IA工程解析.md)
  - [01 Auth 与 Workspace](./00-共享模块/01-auth-workspace/ASCII-IA工程解析.md)
  - [02 Tenant 与权限](./00-共享模块/02-tenant-permission/ASCII-IA工程解析.md)
  - [03 Command、Event 与 Projection](./00-共享模块/03-command-event-projection/ASCII-IA工程解析.md)
  - [04 Agent 与 Connector Runtime](./00-共享模块/04-agent-connector-runtime/ASCII-IA工程解析.md)
- [01 市场任务启动：区域总览](./01-市场任务启动/ASCII-IA工程解析.md)
  - [01 Mission Create](./01-市场任务启动/01-mission-create/ASCII-IA工程解析.md)
  - [02 Mission Lifecycle](./01-市场任务启动/02-mission-lifecycle/ASCII-IA工程解析.md)
  - [03 Mission Sources](./01-市场任务启动/03-mission-sources/ASCII-IA工程解析.md)
  - [04 Mission Progress 与 Export](./01-市场任务启动/04-mission-progress-export/ASCII-IA工程解析.md)
- [02 企业能力证据：区域总览](./02-企业能力证据/ASCII-IA工程解析.md)
  - [01 Capability Extraction](./02-企业能力证据/01-capability-extraction/ASCII-IA工程解析.md)
  - [02 Capability Review](./02-企业能力证据/02-capability-review/ASCII-IA工程解析.md)
  - [03 Capability Research](./02-企业能力证据/03-capability-research/ASCII-IA工程解析.md)
- [03 市场进入路线：区域总览](./03-市场进入路线/ASCII-IA工程解析.md)
  - [01 Route Research](./03-市场进入路线/01-route-research/ASCII-IA工程解析.md)
  - [02 Route Review](./03-市场进入路线/02-route-review/ASCII-IA工程解析.md)
  - [03 Route Review Complete](./03-市场进入路线/03-route-review-complete/ASCII-IA工程解析.md)
- [04 产业生态与目标组织：区域总览](./04-产业生态与目标组织/ASCII-IA工程解析.md)
  - [01 Ecosystem Graph](./04-产业生态与目标组织/01-ecosystem-graph/ASCII-IA工程解析.md)
  - [02 Entity Resolution](./04-产业生态与目标组织/02-entity-resolution/ASCII-IA工程解析.md)
  - [03 Target Ranking](./04-产业生态与目标组织/03-target-ranking/ASCII-IA工程解析.md)
- [05 利益相关者与联系路径：区域总览](./05-利益相关者与联系路径/ASCII-IA工程解析.md)
  - [01 Stakeholder Mapping](./05-利益相关者与联系路径/01-stakeholder-mapping/ASCII-IA工程解析.md)
  - [02 Contact Discovery](./05-利益相关者与联系路径/02-contact-discovery/ASCII-IA工程解析.md)
  - [03 Contact Verification](./05-利益相关者与联系路径/03-contact-verification/ASCII-IA工程解析.md)
- [06 市场机会：区域总览](./06-市场机会/ASCII-IA工程解析.md)
  - [01 Opportunity Create](./06-市场机会/01-opportunity-create/ASCII-IA工程解析.md)
  - [02 Opportunity Qualification](./06-市场机会/02-opportunity-qualification/ASCII-IA工程解析.md)
  - [03 Opportunity Lifecycle](./06-市场机会/03-opportunity-lifecycle/ASCII-IA工程解析.md)
- [07 行动卡：区域总览](./07-行动卡/ASCII-IA工程解析.md)
  - [01 Action Card Build](./07-行动卡/01-action-card-build/ASCII-IA工程解析.md)
  - [02 Action Card Review](./07-行动卡/02-action-card-review/ASCII-IA工程解析.md)
  - [03 Action Card Execute 与 Export](./07-行动卡/03-action-card-execute-export/ASCII-IA工程解析.md)
- [08 互动与刷新：区域总览](./08-互动与刷新/ASCII-IA工程解析.md)
  - [01 Interaction Record](./08-互动与刷新/01-interaction-record/ASCII-IA工程解析.md)
  - [02 Interaction Interpretation](./08-互动与刷新/02-interaction-interpretation/ASCII-IA工程解析.md)
  - [03 Refresh Proposal](./08-互动与刷新/03-refresh-proposal/ASCII-IA工程解析.md)
  - [04 Refresh Review](./08-互动与刷新/04-refresh-review/ASCII-IA工程解析.md)
- [09 决策跟踪：区域总览](./09-决策跟踪/ASCII-IA工程解析.md)
  - [01 Dashboard](./09-决策跟踪/01-dashboard/ASCII-IA工程解析.md)
  - [02 Timeline](./09-决策跟踪/02-timeline/ASCII-IA工程解析.md)
  - [03 Runs](./09-决策跟踪/03-runs/ASCII-IA工程解析.md)
  - [04 Mission Export](./09-决策跟踪/04-mission-export/ASCII-IA工程解析.md)

## 7. 本轮边界

~~~text
当前已完成：总图与当前真实执行顺序对齐
当前需更新：34 份原子文档；不是 34 个业务功能通过
当前缺口：市场认识前置设计、行业信号输出校验、网页慢编译
当前未确认：其他四地区真实结果、完整目标/联系/行动卡链路
本轮操作：文档与 Git 保存；未测试、未部署、未重跑业务
~~~
