---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 05 利益相关者与联系路径：ASCII IA 工程解析

> **业务区域**：把目标组织拆成可影响采购决策的角色，并找到有公开证据、可验证、可执行的联系入口
> **上游**：`mission_entities` / `opportunities` / `approved routes`
> **下游**：机会资格评估、Action Card、外联执行与互动记录

## 1. 总体架构

~~~text
目标组织 / Opportunity
    ↓ 01 stakeholder-mapping
stakeholder_roles + opportunity_stakeholders
    ↓ 02 contact-discovery
contact_points + contact_point_evidence_links
    ↓ 03 contact-verification
contact_verifications + contact_point.status
    ↓ 至少一个 confirmed / manually_confirmed
Opportunity: contact_path_found → contact_path_verified
~~~

## 2. 业务信息架构

~~~text
利益相关者与联系路径
├─ 01-stakeholder-mapping
│  ├─ 采购、工程、供应商准入、渠道等决策角色
│  ├─ 自动 Agent 映射
│  └─ 人工新增 / 修改 API
├─ 02-contact-discovery
│  ├─ 官方公开联系点优先
│  ├─ primary + backup
│  └─ 联系点与来源证据绑定
└─ 03-contact-verification
   ├─ 自动 Connector 校验
   ├─ 页面人工验证 / 确认 / 标记过期
   └─ 验证历史与状态晋级
~~~

## 3. 页面、API 与运行时入口

~~~text
Web
└─ /missions/[missionId]/contact-paths
   ├─ 联系点列表与详情
   ├─ 来源证据 / 快照哈希 / 验证历史
   └─ verify / confirm / stale

API
├─ /entities/:entityId/stakeholders
├─ /stakeholders/:stakeholderId
├─ /entities/:entityId/stakeholders/research
├─ /contact-points
├─ /contact-points/:contactPointId
├─ /contact-points/:contactPointId/verify
├─ /contact-points/:contactPointId/confirm
└─ /contact-points/:contactPointId/mark-stale

Worker / Temporal
└─ OpportunityWorkflow
   → mapStakeholders()
   → findContactPaths()
   → verifyContactPoint() × N
~~~

## 4. HTML / CSS / JS 结构

~~~text
contact-paths/page.tsx
├─ React Client 页面
├─ fetch 联系点列表
├─ 再逐个 fetch 联系点详情
├─ DataTable / StatusBadge / Confidence
└─ JS 事件
   ├─ verify → POST verify
   ├─ confirm → POST confirm
   └─ stale → POST mark-stale

CSS
└─ 复用现有页面布局、表格、按钮和状态组件

利益相关者
└─ 当前没有独立 Web 页面；主要由 Opportunity 自动流程和 API 消费
~~~

## 5. 交互与状态流程

~~~text
机会已识别
  ↓ stakeholder_mapper
stakeholder_mapped
  ↓ contact_path_finder
contact_path_found
  ↓ 对全部联系点并行验证
contact_path_verified
  ↓
机会资格评估

联系点状态
discovered
├─→ format_valid
├─→ source_confirmed
├─→ manually_confirmed
├─→ stale
└─→ invalid
~~~

## 6. 数据、证据与资源流程

~~~text
Web Search / Browser / Social Public Search
    ↓ evidence_refs
Agent structured output
    ├─ stakeholder map Artifact Version
    └─ contact path set Artifact Version
          ↓
PostgreSQL
├─ stakeholder_roles
├─ opportunity_stakeholders
├─ contact_points
├─ opportunity_contacts
├─ contact_point_evidence_links
└─ contact_verifications
          ↓ domain_events / outbox
Projector → timeline / dashboard / SSE
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 自动角色映射、联系点发现和批量验证
├─ 联系点与原始来源证据绑定
├─ 官方来源、独立证据组、Employment 关系参与验证
├─ 联系点详情、历史和人工操作页面
└─ 业务事件进入投影链

当前缺口
├─ 利益相关者没有独立可视化页面
├─ stakeholder/contact research 只发通用 manualRefreshRequested
├─ 部分 research/confirm 入口没有显式业务权限检查
├─ 页面“下载/导出”按钮没有处理函数
├─ API verify 与 Worker Connector verify 使用两套不同判定逻辑
└─ Workflow 内存状态可在所有校验完成后直接写 contact_path_verified，可能与数据库实际状态分离

当前未确认
└─ 未运行 Agent、Connector 或页面；真实命中率、并发行为和来源可达性未实测
~~~

## 8. 一句话工程解释

~~~text
该区域用 Agent 把组织拆成决策角色，再把公开联系入口与来源证据绑定并验证，最终为机会资格评估提供一条可追溯的主联系路径和备选路径
~~~
