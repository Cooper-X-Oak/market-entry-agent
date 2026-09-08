---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 企业能力证据 02：capability-review 能力声明人工评审：ASCII IA 工程解析

> **业务问题**：让用户查看、修改、确认或否决 Agent 提取的企业能力声明
> **入口 / 根节点**：`/missions/[missionId]/capability-ledger` / `ClaimEditor` / `PATCH|POST /capabilities/:claimId/*`
> **相关文件**：`apps/web/app/missions/[missionId]/capability-ledger/page.tsx` / `apps/web/components/claim-editor.tsx` / `apps/api/src/market/missions.controller.ts` / `apps/api/src/market/market.service.ts`

## 1. 总体架构

~~~text
能力声明人工评审
├─ SSR：Capability Ledger 页面读取 Claims + Sources
├─ UI：DataTable + ClaimEditor + CommandButton
├─ API：update / confirm / contradict
└─ 持久化：claims 更新 + claim.updated.v1
~~~

### 层间工作顺序

~~~text
GET /capabilities
    ↓ updatedAt DESC
能力声明表格
    ↓ edit / confirm / conflict
MarketService.updateCapability()
    ↓
UPDATE claims + claim.updated.v1
    ↓ Projector / SSE
router.refresh()
~~~

## 2. 页面与组件信息架构

~~~text
CapabilityLedgerPage
├─ PageHeader“企业能力证据账本”
├─ SourceManager
├─ DataTable“能力声明”
│  ├─ statement + claimType + impactLevel
│  ├─ StatusBadge(status)
│  ├─ Confidence(confidence)
│  ├─ updatedAt
│  └─ ClaimEditor / 确认 / 冲突
└─ 侧栏
   ├─ 判断标签解释
   └─ 用户操作说明
~~~

## 3. 编辑表现与状态信息架构

~~~text
ClaimEditor
├─ open=false → “编辑”按钮
├─ open=true → 绝对定位 .panel(width=420)
│  ├─ textarea statement
│  ├─ number confidence(min=0,max=100)
│  └─ “保存” / “保存中…”
├─ pending → disabled
└─ 保存成功 → close + router.refresh()
~~~

## 4. API 与领域逻辑信息架构

~~~text
PATCH /capabilities/:claimId
└─ claimUpdateSchema
   ├─ statement / valueJson / status
   ├─ confidence 0..100
   └─ impactLevel low|medium|high

POST /confirm
└─ status='user_confirmed'

POST /contradict
└─ status='contradicted'

updateCapability()
├─ require mission:write
├─ tenantId + missionId + claimId 条件
├─ updatedAt=now / createdByUserId=当前用户
└─ claim.updated.v1
~~~

## 5. 用户交互与失败流程

~~~text
用户编辑 statement/confidence
    ↓ PATCH
成功 → 关闭浮层 → 刷新页面
失败 → finally pending=false
         └─ ClaimEditor 当前没有 error 状态或错误提示

用户点击确认
    ↓ POST /confirm
Claim.status=user_confirmed

用户点击冲突
    ↓ POST /contradict
Claim.status=contradicted

claimId 不存在或不属于 Mission
└─ CLAIM_NOT_FOUND，事务不写事件
~~~

## 6. 数据与资源流程

~~~text
MissionQueryRepository.capabilities()
└─ claims WHERE tenantId + missionId ORDER BY updatedAt DESC
   └─ 页面直接展示 Claim 行

用户更新
└─ claims
   ├─ statement / value_json / status / confidence / impact_level
   ├─ created_by_user_id=当前用户
   └─ updated_at=now
      ↓
domain_events(event_type='claim.updated.v1')

页面图标
└─ lucide-react Pencil / Save / Check / TriangleAlert / RefreshCw
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 全部 Claim 按最近更新排序
├─ 声明和置信度内联编辑
├─ user_confirmed 与 contradicted 快捷操作
└─ 修改与领域事件同事务

当前缺口
├─ ClaimEditor 捕获不到 API 错误，保存失败没有可见反馈
├─ 浮层没有 Escape、点击外部关闭或 Dialog 焦点管理
├─ 页面未展开 Claim 对应的 Evidence excerpt / locator
├─ confirm/contradict 没有二次确认和用户备注
└─ “冲突”只改状态，不创建新的反证 Evidence

当前未确认
└─ 未运行页面，浮层定位、键盘可达性、刷新和并发编辑冲突未实测
~~~

## 8. 一句话工程解释

~~~text
Capability Ledger 把当前 Mission 的 Claim 直接列给用户，编辑、确认和冲突操作都更新同一 Claim 并写 claim.updated.v1，但证据详情与编辑失败提示仍未进入这条 UI 链
~~~
