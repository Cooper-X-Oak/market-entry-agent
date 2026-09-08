# BM1 业务纵向闭环计划

## 目标

让用户用一家真实工业企业完成一次可掌控的市场进入研究：

```text
Mission
  → Public Evidence
  → Capability Review
  → Market Route Review
  → Target Top 10
  → Target Selection 1–3
  → Public Contact 或 Research Plan
  → Opportunity
  → Action Card Approval
```

BM1 成功的业务结果是：用户从 Top 10 中选择 1–3 个真实目标，并批准至少一张证据可回溯的 Action Card。

## 四个人工决策点

| 决策点 | 用户掌控内容 | 流程继续条件 |
|---|---|---|
| Capability Review | 企业具备什么能力、哪些仍未知 | 高影响声明全部处理，至少一项确认能力有证据 |
| Route Review | 哪条进入路线值得继续 | 批准 1–3 条有支持证据和反证的路线 |
| Target Review | 哪些组织值得投入研究 | 从 Top 10 选择 1–3 个目标 |
| Action Review | 下一步行动是否可靠 | 至少批准一张 Outreach 或 Research Action Card |

## 实现范围

1. Live Mission 使用 OpenAI Web Search 与公开网页形成 Source Snapshot 和 Evidence。
2. 企业能力、市场路线、目标评分、联系方式和 Action Card 均绑定 Evidence。
3. 首轮研究最多形成 15–20 个原始候选，工作台展示 Top 10。
4. 用户选择的 1–3 个目标才进入 Contact、Opportunity 与 Action Card。
5. 有可靠公开触达路径时生成 Outreach Card；触达信息不足时生成 Research Card。
6. Action Card 修改形成新版本，审批决定由 Temporal Workflow 推进。
7. Mission 驾驶舱集中显示执行模式、业务链、数量、当前决策和下一步入口。
8. Mission ZIP 输出完整来源、证据链接、目标评分、行动卡与事件轨迹。

真实外联由用户在外部渠道执行并记录，不属于 BM1 自动执行范围。

## 资源边界

- Search calls：最多 80。
- Pages fetched：最多 120。
- Model tokens：最多 1,000,000。
- 证据充分时提前停止研究。
- 数据来源限于公开可访问内容。

## 验收方式

使用全新 Session 和全新 Live Mission，从登录开始走完四个决策点；同时核对 Web、Temporal、PostgreSQL、Object Storage、Projector、SSE 和 ZIP 中的同一条业务链。详细用例统一见 [BM1 业务验收清单](../testing/README.md#9-bm1-业务验收清单)，执行测试或验证须有用户明确授权。

## 状态与证据入口

本文维护 BM1 的业务范围、人工决策点、资源边界与退出条件。当前状态、Fixture 工程链记录、CPA 能力记录和 Live 验收缺口统一维护在 [当前状态与 BM1 验收入口](../testing/README.md)，不在本计划中重复维护。
