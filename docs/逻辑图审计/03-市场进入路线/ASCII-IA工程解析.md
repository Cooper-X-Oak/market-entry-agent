---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 03 市场进入路线：ASCII IA 工程解析

> **业务区域**：研究企业通过哪些商业结构进入目标市场，并由用户选择后续生态研究边界
> **入口 / 根节点**：`researchMarketRoutes()` / `/missions/[missionId]/market-routes` / `routeReviewSubmitted`
> **相关文件**：`packages/agents/src/skills.ts` / `apps/worker/src/activities.ts` / `apps/web/app/missions/[missionId]/market-routes/page.tsx` / `apps/api/src/market/market.service.ts`

## 1. 区域业务主干

~~~text
能力 Claim + 市场 Source/Evidence
    ↓
01-route-research
    ↓ 3–8 条 Market Route + market_route_set Version
02-route-review
    ↓ 用户逐条 approve / deprioritize / research
03-route-review-complete
    ↓ 接受对应 Artifact Version + routeReviewSubmitted
MissionWorkflow 解锁 researching_ecosystem
~~~

## 2. 原子问题导航

~~~text
03-市场进入路线/
├─ 01-route-research/ASCII-IA工程解析.md
├─ 02-route-review/ASCII-IA工程解析.md
└─ 03-route-review-complete/ASCII-IA工程解析.md
~~~

- [路线研究](./01-route-research/ASCII-IA工程解析.md)
- [路线逐条评审](./02-route-review/ASCII-IA工程解析.md)
- [路线评审完成](./03-route-review-complete/ASCII-IA工程解析.md)

## 3. 共享业务状态

~~~text
Market Route
├─ routeType / hypothesis / applicableScenarios
├─ keyEntityTypes / keyStakeholderRoles / primaryChannels
├─ capabilityRequirements
├─ supporting / counter Evidence
├─ confidence / difficulty / time / resource / rank
└─ status：proposed / approved / deprioritized
~~~

## 4. 当前整体边界

~~~text
当前已实现
├─ Agent 研究、证据门、版本化路线集
├─ 路线卡片、逐条批准/降级/追加研究
└─ Artifact 接受与 Workflow 审批 Signal

当前未确认
└─ 未运行路线 Agent、页面或 Workflow；实际研究质量与审批推进未实测
~~~

## 5. 一句话工程解释

~~~text
路线区先用独立 Evidence 约束 Agent 生成 3–8 条商业进入假设，再由用户接受具体路线与对应 Artifact Version，只有提交整组评审后 MissionWorkflow 才继续发现生态
~~~
