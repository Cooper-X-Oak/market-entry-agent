# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 15、React 19、TypeScript、Tailwind CSS、shadcn/ui、TanStack Query、TanStack Table、React Flow 和 Server-Sent Events。该技术栈由项目 PRD 明确规定。

## Users

主要用户是工业企业出海负责人、营销服务商、海外销售人员和市场研究人员。他们在桌面工作台中研究市场路线、组织、利益相关者和公开触达路径，并把判断转化为人工执行的市场进入行动。

## Product Purpose

从少量企业信息出发，建立企业能力证据账本，研究并批准市场进入路线，发现目标组织与利益相关者，验证公开触达路径，生成行动卡，并根据人工记录的真实互动持续更新机会状态。核心成功指标是单位销售资源产生的、经过验证的商业机会价值。

## Positioning

产品的独特机制是把市场研究、证据来源、人工审批、公开触达路径、行动内容和真实互动反馈保存在同一个可追溯闭环中，而不是只生成一次性研究报告或联系人清单。

## Operating Context

用户创建 Market Mission，确认 Mission Brief 和 Capability Claims，评审 Market Routes，在 Ecosystem、Targets、Contact Paths 和 Opportunities 中筛选机会，在 Action Queue 批准和导出行动卡，再把邮件、消息、电话、会议、转介绍、供应商注册、样品和报价结果录入系统。系统每周生成变化提案，用户逐项接受。

## Capabilities and Constraints

- V1 支持多租户 Owner、Editor、Viewer 权限。
- 所有重要判断区分 Fact、Inference、Unknown、Contradiction、User Confirmed 和 Superseded，并显示证据、置信度、版本和影响对象。
- V1 只生成、复制和导出外联内容，不自动发送邮件或消息。
- Contact Point 只保存公开商务触达路径，并保留来源、公开属性和最近验证时间。
- 所有状态变化写入 Domain Event；长期流程由 Temporal 管理。
- 桌面优先，工作台界面使用简体中文，领域枚举保留英文。
- Demo 数据完全虚构，并使用保留域名；不得把 Demo 数据展示为真实商业事实。

## Evidence on Hand

产品与工程事实来自 `docs/PRD/industrial-market-entry-agent-v1-prd.md`。当前没有真实客户、商业结果、市场数据、品牌资产或产品截图，界面不得捏造这些内容。

## Product Principles

- 判断必须透明、可追溯、可被用户修改或否决。
- 事实、推断、未知项和矛盾必须明确分离。
- 市场研究必须最终落到明确对象、公开渠道和下一步动作。
- 自动化负责研究和编排，真实外联与关键审批由用户执行。
- 新证据和真实互动必须更新后续判断，而不是只保留静态报告。

## Accessibility & Inclusion

所有主要操作必须可通过键盘完成；状态不能只依赖颜色表达；焦点、加载、空状态、失败状态和等待用户状态必须明确可辨。
