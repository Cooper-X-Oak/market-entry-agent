---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 行动卡 03：action-card-execute-export 行动卡执行与导出：ASCII IA 工程解析

> **业务问题**：已批准行动如何交给人执行、导出到工作工具，并把实际完成外联反映到机会状态
> **入口 / 根节点**：`MarketService.actionCardExport()` / `executeActionCard()` / Action Queue
> **相关文件**：`apps/api/src/market/market.service.ts` / `apps/api/src/market/execution.controller.ts` / `apps/web/app/missions/[missionId]/action-queue/page.tsx` / `apps/web/app/missions/[missionId]/action-queue/[actionCardId]/page.tsx` / `apps/api/src/market/export.service.ts`

## 1. 总体架构

~~~text
approved Action Card
├─ 导出
│  ├─ GET export?format=markdown
│  └─ GET export?format=csv
│      ↓ 用户复制到外部邮件/CRM/表单工具
└─ 执行
   └─ 用户真实外联完成后 POST execute
       ↓ action_card='executed'
       ↓ opportunity='contacted'
       ↓ 后续 InteractionForm 记录结果
~~~

## 2. 页面信息架构

~~~text
Action Queue
├─ review → 批准
├─ approved → 标记已执行
└─ Header → 导出完整任务 ZIP

Action Card Detail
├─ approved/exported/executed/completed → Markdown / CSV
├─ approved/exported → 标记已执行
├─ 复制 email / message / call 内容
└─ 执行前 confirmText
   └─ “仅在已经完成实际外联后确认”
~~~

## 3. 导出信息架构

~~~text
Markdown Action Card
├─ Opportunity Summary
├─ Target Organization
├─ Stakeholder
├─ Contact Paths
├─ Why Contact / Interest / Value
├─ Message Templates
├─ Attachments / Follow Up / Success Signals
├─ Evidence
└─ Unknowns

CSV
└─ 单行29列
   mission / organization / route / opportunity / score /
   stakeholder / primary+backup contact / content / owner / dueAt

完整任务 ZIP
└─ 由 MissionExportService 生成，另见 09-mission-export
~~~

## 4. API 与权限结构

~~~text
GET /action-cards/:id/export
├─ permission: export:approved
├─ 允许状态：approved/exported/executed/completed
├─ format=csv → text/csv
└─ 其他 → text/markdown

POST /action-cards/:id/execute
├─ actionCard() 确认所属 Mission
├─ updateActionCard(status='executed')
│  └─ mission:write + actionCardTransitions
└─ updateOpportunity(status='contacted')
   └─ mission:write + opportunityTransitions
~~~

## 5. 执行与状态流程

~~~text
导出
approved
  ↓ assemble mission/entity/route/stakeholder/contact/owner
  ↓ append event action_card.executed.v1
  ↓ 返回文件内容
  └─ action_cards.status 保持原值

标记执行
approved 或 exported
  ↓ Transaction A：Action Card → executed
  ↓ Transaction B：Opportunity approved → contacted
  ↓
用户再提交 Interaction
~~~

## 6. 数据、文件与资源流程

~~~text
数据库
├─ missions / entities / mission_entities
├─ market_routes
├─ opportunities
├─ stakeholder_roles
├─ contact_points
├─ action_cards
└─ users
    ↓ string assembly
Markdown / CSV HTTP attachment
    ↓
用户本地文件 / 外部执行工具

产品资源边界
└─ 不调用邮件、电话、CRM 或表单提交 Connector
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 只允许已批准及之后状态导出
├─ Markdown 和 CSV 两种单卡格式
├─ 文件名包含 Mission、Organization 和 versionNo
├─ 用户确认后标记执行
└─ Action Card executed 与 Opportunity contacted 联动

当前缺口
├─ 导出记录的事件类型是 action_card.executed.v1
│  └─ metadata.operation='export'，但卡片状态没有变成 exported
├─ 执行是两个独立数据库事务
│  └─ 第二步失败时卡片可能 executed、Opportunity 仍 approved
├─ 执行不要求提交实际外联证据或 Interaction ID
├─ CSV 的 person_name 实际写 stakeholder.personId UUID
├─ Markdown 的 Unknowns 实际来自 completionSignals
└─ 导出 Evidence 只列 route summary / contact sourceId，未内嵌完整 Evidence Item

当前未确认
└─ 未下载文件或点击执行；文件编码、字段完整性和跨事务一致性未实测
~~~

## 8. 一句话工程解释

~~~text
行动卡执行坚持“系统准备内容、人完成真实外联”，但导出被记成 executed 事件且执行跨两个事务，审计语义和原子性仍不完整
~~~
