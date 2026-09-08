---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 利益相关者与联系路径 03：contact-verification 联系点验证：ASCII IA 工程解析

> **业务问题**：判断一个公开联系入口是否格式有效、来源可信、仍可访问，并保留足够证据供外联执行
> **入口 / 根节点**：`activities.verifyContactPoint()` / `/contact-points/:contactPointId/verify|confirm|mark-stale`
> **相关文件**：`apps/worker/src/activities.ts` / `packages/connectors/src/contact-verification.ts` / `apps/api/src/market/market.service.ts` / `apps/api/src/market/execution.controller.ts` / `apps/web/app/missions/[missionId]/contact-paths/page.tsx` / `packages/domain/src/gates.ts`

## 1. 总体架构

~~~text
contact_point + evidence_links
    ↓ 自动：contact_verification Connector
格式 / MX / URL / 官方来源 / 独立组 / Employment
    ↓ VerificationResult
contact_verifications
    ↓
contact_point.status + confidence + lastVerifiedAt
    ↓ confirmed / manually_confirmed
Opportunity: contact_path_found → contact_path_verified
~~~

## 2. 页面与 API 信息架构

~~~text
/missions/[missionId]/contact-paths
├─ GET /contact-points
├─ GET /contact-points/:id × N
├─ 来源
│  ├─ URL / locator
│  ├─ excerpt
│  └─ snapshotHash
├─ 验证历史
└─ 操作
   ├─ POST verify
   ├─ POST confirm
   └─ POST mark-stale

页面下载按钮
└─ 当前只有 button，无 onClick / 文件生成
~~~

## 3. 验证状态信息架构

~~~text
contact_point.status
├─ discovered
├─ format_valid
├─ source_confirmed
├─ manually_confirmed
├─ stale
└─ invalid

deriveContactVerificationStatus(facts)
├─ manualConfirmation → manually_confirmed
├─ official + exact locator + independent groups → source_confirmed
├─ 两个独立证据组 → source_confirmed
├─ official → source_confirmed
├─ format / URL valid → format_valid
└─ 其他 → invalid / discovered
~~~

## 4. Connector / JS 判定结构

~~~text
contact_verification Connector 评分线索
├─ email 格式 +10
├─ MX 可达 +15
├─ URL HEAD 可达 +40
├─ official source +40
├─ procurement locator +40
├─ >=2 independent groups +25
├─ employment evidence +20
└─ manual confirmation +50

自动调用
├─ email → validate_mx
└─ 其他 → validate_url

注意
└─ 最终 status 由 facts 组合推导，不直接按 score 阈值推导
~~~

## 5. 自动与人工验证流程

~~~text
自动 Worker
verifyContactPoint(id)
  ↓ 读取 contact + evidence links
  ↓ 调用 Connector
  ↓ 写 contact_verifications + verification evidence links
  ↓ 更新 contact status/confidence/lastVerifiedAt
  ↓ contact_point.verified.v1
  └─ 若 Opportunity 仍是 contact_path_found 且本点 confirmed
       → transition contact_path_verified

页面 API verify
  ↓ 不调用 Connector
score=min(100, currentConfidence + (isPublic ? 40 : 0))
  ↓ 用分数阈值生成 status 和 manual-api-check facts

页面 confirm
  ↓ 写 score=100 / manually_confirmed

页面 stale
  ↓ updateContact(status='stale')
~~~

## 6. 数据、证据与资源流程

~~~text
contact_point_evidence_links
    ↓
verificationFacts
├─ formatValid / mxValid / urlReachability
├─ officialSource / exactLocator
├─ independentConfirmationGroups[]
├─ employmentConfirmed
└─ manualConfirmation
    ↓
contact_verifications
├─ status
├─ score
├─ verifiedAt
└─ details
    ↓
contact_point_verification_evidence_links
    ↓
页面详情 + 时间线投影
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ Worker 使用 Connector 做格式、MX/URL、来源和证据关系校验
├─ 每次验证保留历史记录和证据链接
├─ 自动晋级、人工确认和过期标记
├─ 联系路径页面展示来源、哈希和验证历史
└─ 已确认联系点可推动 Opportunity 进入 contact_path_verified

当前缺口
├─ API verify 使用简化分数逻辑，与 Worker 自动验证规则不一致
├─ API verify 可写入虚拟 independent group='manual-api-check'
├─ confirmContact() 未见显式 requirePermission 调用
├─ confirm 写入的 facts 未设置 manualConfirmation 字段
├─ contactGate() / contactVerifiedGate() 未见接入生产晋级流程
└─ OpportunityWorkflow 在全部验证 Promise 完成后无条件写内存状态 contact_path_verified
   └─ 即使数据库没有任何 confirmed 联系点，Workflow 状态仍可能前进

当前未确认
└─ 未运行 MX/URL 校验或并发流程；真实网络结果与 Workflow/数据库状态一致性未实测
~~~

## 8. 一句话工程解释

~~~text
自动验证链能用公开来源和网络可达性给联系点留痕并推动机会晋级，但页面 API 与 Worker 采用不同判定方式，Workflow 内存状态也可能先于数据库事实
~~~
