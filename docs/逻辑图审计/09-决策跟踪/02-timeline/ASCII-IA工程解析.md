---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 决策跟踪 02：timeline 决策时间线：ASCII IA 工程解析

> **业务问题**：一次用户命令或自动流程产生了哪些连续事件，谁触发、改变了哪个聚合、用了多少证据
> **入口 / 根节点**：Domain Event + Outbox → `timeline_read_model` → `/timeline`
> **相关文件**：`packages/database/src/domain-events.ts` / `packages/database/src/schema/events.ts` / `apps/projector/src/projector.ts` / `packages/database/src/schema/read-models.ts` / `packages/database/src/repositories.ts` / `apps/web/app/missions/[missionId]/timeline/page.tsx`

## 1. 总体架构

~~~text
业务 Transaction
├─ UPDATE/INSERT 业务表
├─ domain_events
└─ outbox_events
    ↓ Projector
timeline_read_model
    ↓ GET /missions/:missionId/timeline
TimelinePage
    ↓ correlationId 分组
一次业务动作 → 多个领域事件链
~~~

## 2. 时间线信息架构

~~~text
TimelineItem
├─ eventId
├─ eventType
├─ actorType
├─ actorDisplayName
├─ aggregateType / aggregateId
├─ correlationId / causationId
├─ aggregateVersion / schemaVersion
├─ title / summary
├─ evidenceRefs[]
└─ occurredAt
~~~

## 3. 页面信息架构

~~~text
/missions/[missionId]/timeline
├─ PageHeader
│  └─ “按 correlationId 折叠一次业务动作产生的完整领域事件链”
└─ Panel
   └─ details group × correlationId（默认 open）
      ├─ group title / event count / time
      └─ event article × N
         ├─ actor icon：user / agent / system
         ├─ title / summary / occurredAt
         ├─ eventType Badge
         ├─ aggregateType / aggregateVersion
         ├─ eventId
         └─ evidence count
~~~

## 4. 投影与 JS 分组结构

~~~text
Projector.project(event)
├─ payload.missionId 不存在 → 不进入 Mission Timeline
├─ title = event.eventType
├─ actorDisplayName = event.actorId
├─ evidenceRefs = payload.evidenceRefs ?? []
└─ summary
   ├─ payload.after 是 object
   │  └─ eventType + JSON.stringify(after).slice(0,500)
   └─ 否则只显示 eventType

TimelinePage
└─ events.reduce(Map<correlationId, event[]>)
~~~

## 5. 事件链流程

~~~text
一个 Command correlationId
  ↓
Event A aggregateVersion=N
  ↓ causationId（可选）
Event B aggregateVersion=M
  ↓
Outbox 分批投影
  ↓
同 correlationId 在页面合并为 details

查询顺序
└─ timeline_read_model.occurredAt DESC
~~~

## 6. 数据、证据与实时流程

~~~text
domain_events（事实源）
    ↓ outbox lease / retry / checkpoint
timeline_read_model（页面读模型）
    ↓ Projector transaction commit
pg_notify('mission_events')
    ↓ SSE
TimelinePage router.refresh()

Evidence
└─ 页面只显示 evidenceRefs.length
   └─ 不展开 Evidence Item / Source / Snapshot
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 领域事件、聚合版本、actor、correlation/causation 字段
├─ Outbox 至少一次处理与失败重试
├─ correlationId 页面分组
├─ 用户/Agent/System 图标区分
└─ SSE 触发页面刷新

当前缺口
├─ title 直接等于英文 eventType，没有中文业务标题转换
├─ actorDisplayName 实际存 actorId，不是用户显示名
├─ summary 是截断到500字符的 after JSON，不是结构化差异视图
├─ 页面无分页/筛选，Mission 全部事件一次读取
├─ 只显示证据数量，无法点击查看证据
├─ 不显示 causationId、schemaVersion 或完整 before/after
└─ 同一 correlationId 的跨事件链完整性依赖各写入端正确复用 correlationId

当前未确认
└─ 未运行 Projector 或打开页面；事件顺序、重试重复和大任务性能未实测
~~~

## 8. 一句话工程解释

~~~text
决策时间线用 correlationId 把领域事件串成业务动作链，但目前展示层仍是事件类型加截断 JSON，只能看“发生了什么”，还不能深入看“证据为什么支持它”
~~~
