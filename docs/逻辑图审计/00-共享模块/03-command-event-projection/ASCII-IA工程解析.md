---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T18:25:00+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 共享模块 03：command-event-projection 命令、事件、投影与 SSE：ASCII IA 工程解析

> **业务问题**：让业务命令可靠落库、可追溯，并把提交后的变化反馈到工作台
> **入口 / 根节点**：`apiClient()` → `IdempotencyInterceptor` → `MarketService.mutate()` → `DomainEventWriter` → `Projector` → `EventStreamService`
> **相关文件**：`apps/web/lib/api-client.ts` / `apps/api/src/common/idempotency.interceptor.ts` / `packages/database/src/events.ts` / `apps/projector/src/projector.ts` / `apps/api/src/common/event-stream.service.ts` / `apps/web/components/sse-bridge.tsx`

## 1. 总体架构

~~~text
业务命令可靠反馈
├─ 命令入口：REST mutation + Idempotency-Key
├─ 原子写入：aggregate + domain_events + outbox_events
├─ 异步投影：Projector + checkpoint + retry
├─ 实时通知：pg_notify('mission_events') + SSE
└─ 页面刷新：SseBridge → invalidateQueries() + router.refresh()
~~~

### 层间工作顺序

~~~text
Web mutation
    ↓ Idempotency-Key: crypto.randomUUID()
API command
    ↓ tenant transaction
业务表 + domain_events + outbox_events
    ↓ commit
claim_outbox_batch('imea-main-projector-v1', 50, 60)
    ↓
Timeline / Dashboard / Progress / Run Read Model
    ↓ mark outbox published + checkpoint
transaction commit
    ↓ pg_notify mission_events
EventStreamService
    ↓ SSE
SseBridge → router.refresh()
~~~

## 2. 命令与事件入口信息架构

~~~text
apiClient(path, init)
└─ 非 GET / HEAD
   └─ Idempotency-Key=random UUID

IdempotencyInterceptor
├─ endpoint = METHOD + route URL
├─ requestHash = sha256(endpoint + stable(body))
├─ key 已存在且 hash 相同 → 返回原 responseBody
├─ key 已存在且 hash 不同 → 409 Conflict
└─ 成功响应 → idempotency_records 保存 24 小时

MarketService.mutate()
├─ correlationId=randomUUID()
├─ 执行业务 work(tx)
└─ DomainEventWriter.append(tx, payload.before/after)
~~~

## 3. 事件与投影结构信息架构

~~~text
domain_events
├─ tenant_id
├─ aggregate_type / aggregate_id / aggregate_version
├─ event_type / schema_version
├─ actor_type / actor_id
├─ correlation_id / causation_id
└─ payload：missionId / opportunityId / before / after / evidenceRefs

outbox_events
├─ domain_event_id 唯一
├─ status：pending / leased / published / failed
├─ attempts / next_attempt_at / last_error
└─ lease_owner / lease_expires_at

Read Model
├─ timeline_read_model
├─ mission_dashboard_read_model
├─ mission_progress_read_model
└─ run_read_model
~~~

## 4. 投影、幂等与重试信息架构

~~~text
Projector.batch()
└─ claim_outbox_batch(CONSUMER_NAME, 50, 60)
   └─ FOR UPDATE SKIP LOCKED + lease + attempts+1

Projector.process(claimed)
├─ tenant transaction
├─ project(tx, event)
│  ├─ Timeline：event_id onConflictDoNothing()
│  ├─ Dashboard：按当前事实重新聚合
│  ├─ Progress：stage + child Opportunity counts
│  └─ Runs：agent_runs + tool_runs upsert
├─ projection_checkpoints processed_count+1
└─ outbox status='published'

失败
├─ projection_failures upsert
├─ nextRetryAt=min(300秒, 2^attempts 秒)
└─ attempts>=10 → failed；否则 pending
~~~

## 5. 通知与页面刷新流程

~~~text
投影事务成功提交
    ↓ 事务外执行
pg_notify('mission_events', notification JSON)
    ↓
EventStreamService.onModuleInit().listen()
    ├─ JSON 有效 → record()
    └─ JSON 无效 → 忽略；domain_events 仍是权威记录
         ↓
内存 recent history：每 Mission 最多 100 条
    ↓ GET /missions/:missionId/stream
SSE business event + 25秒 heartbeat
    ↓
SseBridge 监听声明的业务事件
    ↓
invalidateQueries(['mission', missionId]) + router.refresh()
~~~

## 6. 重连与资源流程

~~~text
SSE 重连携带 Last-Event-ID
├─ ID 在内存 100 条缓冲内
│  └─ 重放该 ID 之后的事件
└─ ID 不在缓冲内
   └─ stream.reset_required
      └─ Web 执行完整 router.refresh()

持久权威
├─ domain_events：业务变化历史
├─ outbox_events：待投影交付状态
├─ projection_checkpoints：消费者进度
└─ projection_failures：错误、次数、下次重试

临时资源
└─ EventStreamService.history：API 进程内存，重启后清空
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ mutation 请求与响应级幂等记录
├─ aggregate version 串行锁与冲突检测
├─ 业务事实、Event、Outbox 同事务
├─ 租约式 Outbox 消费、投影 checkpoint 和指数退避
├─ 投影提交后才发送 pg_notify
└─ SSE heartbeat、有限重放和 reset_required 降级

当前缺口
├─ SseBridge 对已监听事件统一全页 refresh，没有细粒度 read-model 更新
├─ SSE history 仅进程内 100 条，API 重启后只能要求全量重取
├─ 投影连续失败 10 次后进入 failed，当前未看到自动 dead-letter 处理界面
└─ IdempotencyInterceptor 只记录成功的 200 响应

当前未确认
└─ 未运行 Outbox、Projector、pg_notify 或断线重连，实际恢复行为与延迟未实测
~~~

## 8. 一句话工程解释

~~~text
每个命令先凭 Idempotency-Key 防重，再把业务事实、领域事件和 Outbox 原子提交，Projector 可重试地产生读模型，提交后经 pg_notify 与 SSE 通知 Web 全量取回最新状态
~~~

## 9. M1 实施与运行验收更新

模块状态：已验收

`TransactionManager` 已增加 Ambient Transaction，API Idempotency Interceptor 在 Command 外层开启事务并获取 PostgreSQL advisory transaction lock。业务表、Domain Event、Outbox 和 Idempotency Record 因此共享同一提交边界；Worker Activity 采用相同模式。

Transaction Proof Mission 创建时四类记录的初始 PostgreSQL `xmin` 均为 566222。验收 Mission 最终有 26 个 Domain Events 和 26 个 Outbox，全部 published，Projector Read Model Version=17，未解决 Projection Failure=0。

SSE 已修复 `Promise<Observable>` 和 Response Envelope 两层协议问题。实际 Wire 包含 `event: mission.resumed.v1`；保持打开的 Web 页面在 pause 和 complete 后自动重新读取最新投影。进程内 100 条 History 的容量边界仍保留，超界继续使用 `stream.reset_required` 全量刷新设计。


## 2026-09-08 模块纠正增量

当前源码变化及验收状态以 [模块纠正契约](../../模块纠正契约.md) 和 [机器索引](../../模块纠正索引.json) 为准。本页前文保留历史实现说明；新增代码尚未部署，隔离数据库与完整业务集成仍有阻塞。
