---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 02 企业能力证据：ASCII IA 工程解析

> **业务区域**：把企业公开资料转换为可追溯、可人工修正的能力事实、推断、矛盾与未知项
> **入口 / 根节点**：`/missions/[missionId]/capability-ledger` / `extractCapabilityClaims()`
> **相关文件**：`apps/web/app/missions/[missionId]/capability-ledger/page.tsx` / `apps/worker/src/activities.ts` / `packages/agents/src/skills.ts` / `packages/database/src/schema/research.ts`

## 1. 区域业务主干

~~~text
Mission Source / Snapshot
    ↓
01-capability-extraction
    ↓ capability_ledger Artifact Version
claims + claim_evidence_links
    ↓
02-capability-review
    ↓ edit / confirm / contradict
用户锁定当前任务事实或标出冲突
    ↓
03-capability-research
    └─ 新 Source 或问题 → 重新提取新版本
~~~

## 2. 原子问题导航

~~~text
02-企业能力证据/
├─ 01-capability-extraction/ASCII-IA工程解析.md
├─ 02-capability-review/ASCII-IA工程解析.md
└─ 03-capability-research/ASCII-IA工程解析.md
~~~

- [企业能力提取](./01-capability-extraction/ASCII-IA工程解析.md)
- [能力声明人工评审](./02-capability-review/ASCII-IA工程解析.md)
- [能力重新研究](./03-capability-research/ASCII-IA工程解析.md)

## 3. 区域共享状态

~~~text
Claim status
├─ observed
├─ inferred
├─ user_confirmed
├─ contradicted
├─ unknown
└─ superseded

事实来源
Claim
└─ claim_evidence_links
   └─ EvidenceItem
      └─ SourceSnapshot
         └─ Source / S3 object
~~~

## 4. 当前整体边界

~~~text
当前已实现
├─ Agent 自动提取、缺失能力转 unknown
├─ Artifact Version、Claim 与 Evidence Link 持久化
├─ 用户编辑、确认、冲突和重新提取
└─ Capability Ledger 页面按更新时间展示全部 Claim

当前未确认
└─ 未运行 Agent、Connector 或页面；证据覆盖率、重复 Claim 和交互效果未实测
~~~

## 5. 一句话工程解释

~~~text
企业能力区把不可变 Source Snapshot 交给受证据约束的 Agent 生成版本化能力账本，再允许用户直接修正或锁定每条 Claim，并可随新资料重新提取
~~~
