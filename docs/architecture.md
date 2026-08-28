# Architecture

## Boundaries

The system separates five responsibilities:

1. The Web app renders mission/read-model state and sends explicit user commands.
2. The API validates input, enforces tenant role permissions, persists commands and signals workflows.
3. Temporal owns long-running orchestration, retries, pauses, approvals, schedules and child Opportunity execution.
4. Agents reason within versioned Skills and can only use explicitly permitted Connectors.
5. PostgreSQL is the authority for business state, evidence, artifact versions, events and projections; S3-compatible storage holds raw documents/pages.

No Agent directly mutates a business table. Activities parse structured Agent output, apply quality gates, and persist changes through transaction-scoped application services.

## Write and projection flow

```text
User command
  -> AuthGuard + Zod input boundary + permission policy
  -> transaction
       -> aggregate table write
       -> domain_events append
       -> outbox_events append
  -> command receipt with correlation/workflow identity

Projector
  -> claims pending outbox rows
  -> writes dashboard/progress/timeline/run projections
  -> pg_notify mission_events
  -> marks outbox event published and commits
  -> emits pg_notify only after commit

Web
  -> initial REST snapshot
  -> SSE stream
  -> invalidates/refetches affected read models
```

`Idempotency-Key` is accepted for mutation requests. A tenant/endpoint/key tuple stores the request hash and successful response for 24 hours; a reused key with a different request is rejected.

## Evidence and artifact model

- `Source` is the stable public/document identity.
- `SourceSnapshot` is immutable fetched content with object key and hash.
- `EvidenceItem` points to an exact snapshot locator and records stance, relevance and freshness.
- `ContactPointEvidenceLink` states whether an item supports the exact value, role or employment and records authority/independence.
- `Claim` separates observed, inferred, unknown, user-confirmed, contradicted and superseded judgments.
- `Artifact` is a stable product such as route set or refresh proposal.
- `ArtifactVersion` is immutable proposed/accepted/superseded content.
- `Interaction` stores raw body/hash; its interpretation links new Evidence/Claims and business changes back to user feedback.

Refresh never silently replaces accepted reasoning. It creates a proposal version; a user accepts, requests more research or defers it.

## Tenant and permission model

Every tenant-owned aggregate carries `tenant_id`; repositories include tenant filters; migrations enable RLS using `current_tenant_id()`. Mutating transactions set `app.tenant_id` with `set_config(..., true)`. Roles are:

- Owner: workspace management, all task operations and full export.
- Editor: task work, route/action approval, approved export; no workspace or full export authority.
- Viewer: read and approved export only.

## Runtime components

| Component | Scale model | Durable dependency |
|---|---|---|
| Web | stateless replicas | API |
| API | stateless replicas | PostgreSQL, Temporal, S3 |
| Worker | horizontally scalable on one Task Queue | Temporal, PostgreSQL, S3, providers |
| Projector | one active consumer in V1; row claiming is retry-safe | PostgreSQL |
| PostgreSQL | managed or stateful service | backups/PITR |
| Temporal | managed or clustered | Temporal persistence |
| S3 | managed or MinIO | versioning/retention |

## Failure behavior

- Connector errors carry retryable semantics; Temporal applies capped exponential retry.
- Business approvals are Signals and survive restarts.
- Paused Missions/Opportunities wait durably.
- Outbox retries use attempt count, `next_attempt_at` and error text.
- Agent output is Zod parsed; unknown evidence references or missing required evidence fail the quality gate.
- Budget usage at 80% creates attention state; exhaustion moves the Mission to budget review.
