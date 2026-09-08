---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 决策跟踪 04：mission-export 完整任务导出：ASCII IA 工程解析

> **业务问题**：如何把一个 Mission 当前可交付的企业能力、路线、生态、联系、机会、行动卡、证据和时间线打包给人离线查看
> **入口 / 根节点**：`GET /missions/:missionId/export` → `MissionExportService.create()`
> **相关文件**：`apps/api/src/market/missions.controller.ts` / `apps/api/src/market/export.service.ts` / `apps/web/app/missions/[missionId]/page.tsx` / `apps/web/app/missions/[missionId]/action-queue/page.tsx`

## 1. 总体架构

~~~text
Mission Overview / Action Queue
    ↓ <a href='/export'>
MissionExportService.create()
    ↓ permission export:all
并行查询9类业务数据
    ↓ JSZip(DEFLATE level 6)
ZIP Buffer
    ↓ HTTP application/zip
'{mission-slug}-full-export.zip'
    ↓
mission.exported.v1
~~~

## 2. ZIP 文件信息架构

~~~text
full-export.zip
├─ mission.json
├─ capability-ledger.csv
├─ market-routes.md
├─ entities.csv
├─ relationships.csv
├─ contact-points.csv
├─ opportunities.csv
├─ action-cards/
│  └─ {opportunity-slug}-action-card-v{N}.md × 每个版本
├─ evidence-index.csv
└─ timeline.csv
~~~

## 3. 数据读取信息架构

~~~text
并行 SELECT
├─ claims
├─ market_routes
├─ mission_entities JOIN entities
├─ entity_relationships
├─ contact_points
├─ opportunities
├─ action_cards JOIN opportunities
├─ evidence_items JOIN snapshots JOIN sources
└─ timeline_read_model

Mission
└─ 单独先按 tenantId + missionId 查询
~~~

## 4. 文件生成结构

~~~text
csv(rows)
└─ 对数据库行做 CSV 序列化

market-routes.md
└─ 每条 Route
   title / type / status / confidence / difficulty /
   resource intensity / hypothesis / evidence / counter evidence

action-card Markdown
└─ Opportunity + Stakeholder + Contact + Message + Follow-up + Signals

evidence-index.csv
└─ evidence + source URL/title + locator + snapshotHash + capturedAt
~~~

## 5. 用户交互流程

~~~text
用户点击“导出”或“导出完整任务”
  ↓ 浏览器直接访问 API
Auth Cookie
  ↓ export:all
内存构建 ZIP
  ↓ Content-Disposition attachment
浏览器下载
  ↓ API 再写 mission.exported.v1

注意
└─ timeline.csv 在 export event 写入之前已经查询
   └─ 本次 ZIP 不包含自己的 mission.exported.v1
~~~

## 6. 数据、证据与资源边界

~~~text
导出包含
├─ 当前数据库行
├─ 所有 Action Card 版本
├─ Evidence 摘录和 Snapshot Hash
└─ 已投影 Timeline

导出不包含对象本体
├─ uploaded document 原文件
├─ connector rawObjectKey 对象
├─ source snapshot 全文对象
└─ interaction raw evidence 文件

只输出引用
└─ objectKey / source/evidence 索引并未形成可离线展开的完整资源包
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ tenant 和 Mission 范围查询
├─ export:all 权限
├─ 结构化 JSON/CSV/Markdown 混合 ZIP
├─ Action Card 按版本独立文件
├─ Evidence URL、摘录、Locator 和 Snapshot Hash 索引
└─ 导出事件留痕

当前缺口
├─ 不包含 stakeholder_roles 独立表
├─ 不包含 opportunity_scores、interactions、interaction interpretations
├─ 不包含 approvals、refresh_proposals、artifacts/version 清单
├─ 不包含 agent_runs、tool_runs、workflow_instances
├─ 不包含源文件和 Snapshot 全文，不能完全离线复核证据
├─ 所有 Action Card 都导出，不区分 review/approved/executed
├─ timeline.csv 不包含本次导出事件
└─ JSZip 在内存构建整个 Buffer，大任务占用随数据量增长

当前未确认
└─ 未生成 ZIP；实际文件名冲突、CSV 序列化、压缩大小和大任务内存未实测
~~~

## 8. 一句话工程解释

~~~text
完整任务导出是一份面向业务交付的轻量 ZIP，而不是可重建系统状态的全量审计包，因为互动、评分、审批、运行记录和原始证据对象都没有包含
~~~


## 2026-09-08 模块纠正增量

当前源码变化及验收状态以 [模块纠正契约](../../模块纠正契约.md) 和 [机器索引](../../模块纠正索引.json) 为准。本页前文保留历史实现说明；新增代码尚未部署，隔离数据库与完整业务集成仍有阻塞。
