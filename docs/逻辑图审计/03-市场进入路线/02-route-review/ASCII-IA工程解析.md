---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 市场进入路线 02：route-review 路线逐条评审：ASCII IA 工程解析

> **业务问题**：让用户比较每条路线的假设、难度、时间、资源和证据后逐条批准或降低优先级
> **入口 / 根节点**：`/missions/[missionId]/market-routes` / `approve|deprioritize|research`
> **相关文件**：`apps/web/app/missions/[missionId]/market-routes/page.tsx` / `apps/web/app/globals.css` / `apps/api/src/market/missions.controller.ts` / `apps/api/src/market/market.service.ts`

## 1. 总体架构

~~~text
路线逐条评审
├─ SSR：GET /routes → rank ASC
├─ UI：Route Card + Gate 提示
├─ 命令：approve / deprioritize / research
└─ 持久化：market_routes.status + decided_by / decided_at
~~~

### 层间工作顺序

~~~text
MarketRoutesPage
    ↓
展示 proposed / approved / deprioritized
    ↓ 用户操作
approve 或 deprioritize
    ↓
MarketService.updateRoute()
    ↓
market_route.updated.v1
    ↓ router.refresh()
~~~

## 2. HTML / React 信息架构

~~~text
PageHeader
└─ approved.length>0 → “提交路线评审”

Panel“路线候选”
└─ .route-list
   └─ article.route-card
      ├─ .route-rank
      ├─ title / hypothesis
      ├─ status / routeType / keyEntityTypes前2项
      ├─ confidence / entryDifficulty / timeToFirstContactDays
      └─ approve 或 deprioritize + research

下方
├─ Route Approval Gate 可视提示
└─ 评审原则说明
~~~

## 3. CSS 与响应式信息架构

~~~text
.route-card
├─ 默认：64px + 主内容 + 信号 + 操作 四列
├─ <=1180px：三列，隐藏 .route-signals
└─ <=640px：44px + 主内容 两列，操作跨整行

.route-rank
└─ 44x44 / surface-muted / 12px radius

.route-signals
└─ 置信度、难度、首个联系时间
~~~

## 4. 命令与领域逻辑信息架构

~~~text
approveRoute()
├─ require route:approve
├─ updateRoute() 再 require mission:write
└─ status='approved' + decidedByUserId + decidedAt

deprioritizeRoute()
└─ status='deprioritized' + 决策人/时间

researchRoute()
├─ 确认 routeId 存在
└─ signal manualRefreshRequested
   └─ 返回 { requested, requestId, routeId }
~~~

## 5. 用户交互与失败流程

~~~text
routes=[]
└─ EmptyState“路线研究尚未完成”

点击批准
└─ proposed/deprioritized → approved → 页面出现“提交路线评审”

点击降低优先级
└─ approved → deprioritized

点击追加研究
└─ 当前实现触发整个 Mission manual refresh，不是只重研该 Route

routeId 不存在
└─ ROUTE_NOT_FOUND
~~~

## 6. 数据、事件与资源流程

~~~text
MarketRoute row
├─ 读：MissionQueryRepository.routes() ORDER BY rank
├─ 写：tenantId + missionId + routeId
└─ event：market_route.updated.v1

页面图标
└─ lucide-react CheckCircle2 / Search

页面没有独立图片或视频
└─ 路线信息完全由数据库字段和全局 CSS 呈现
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 路线卡片比较、状态标识与响应式布局
├─ 逐条批准、降级和追加研究入口
├─ 决策人、决策时间与事件记录
└─ 至少一条 approved 后才显示整组提交按钮

当前缺口
├─ 页面 Gate 只检查字符串/数组非空，不验证两条独立 Evidence
├─ 页面不展示支持/反向 Evidence 的 excerpt、locator 或来源
├─ approve/deprioritize 统一写 market_route.updated.v1，专项事件只在整组提交时产生
├─ researchRoute() 未显式 require mission:write 或 route:approve
└─ “追加研究”实际 signal manualRefreshRequested，routeId 不进入 Signal payload

当前未确认
└─ 未运行页面，卡片响应式、权限失败和研究回执未实测
~~~

## 8. 一句话工程解释

~~~text
Market Routes 页面把排序后的路线假设压成可比较卡片，用户可先逐条标记 approved 或 deprioritized，但证据详情和定向重研尚未真正进入这条交互链
~~~
