# Data model

PostgreSQL is the authority for business facts, evidence, workflow references, audit events and read models. UUID primary keys are used for business rows; tenant-owned roots include `tenant_id`. Child/link rows are isolated through their tenant-owning parent.

## Core keys and relationships

```text
tenants ─┬─ tenant_members ─ users
         └─ missions ─┬─ sources ─ source_snapshots ─ document_chunks
                      ├─ artifacts ─ artifact_versions
                      ├─ claims ─ claim_evidence_links ─ evidence_items ─ source_snapshots
                      ├─ market_routes
                      ├─ entities ─ entity_aliases / entity_relationships / stakeholder_roles
                      ├─ opportunities ─ opportunity_scores
                      │                ├─ opportunity_stakeholders
                      │                ├─ opportunity_contacts
                      │                ├─ action_cards
                      │                └─ interactions
                      ├─ domain_events ─ outbox_events
                      ├─ agent_runs ─ tool_runs
                      └─ workflow_instances / refresh_proposals
```

Important uniqueness contracts include aggregate event version per Tenant/Aggregate, Action Card version per Opportunity, normalized Contact value per Mission/type, one Outbox row per Domain Event, one Timeline row per Event, and one Checkpoint per consumer.

## Tenant isolation

`imea_api` and `imea_worker` execute every business transaction after transaction-local `set_config('app.tenant_id', tenantId, true)`. Direct tenant tables use `tenant_id = current_tenant_id()` RLS policies with `FORCE ROW LEVEL SECURITY`; child/link policies use an `EXISTS` join to the tenant-owned parent. Repository queries additionally carry Tenant and Mission predicates, so an arbitrary foreign resource ID resolves as not found. `imea_projector` cannot freely scan tenant business data: it receives events through `claim_outbox_batch` and then projects under the event Tenant context. `imea_migrator` is the DDL path.

## Contact Evidence Chain

```text
contact_points
  ├─ normalized_value + verification_status + confidence
  ├─ contact_point_evidence_links
  │    └─ evidence_items ─ source_snapshots ─ sources
  └─ contact_verifications
       ├─ facts + before/after status + method/result/history
       └─ contact_verification_evidence_links ─ evidence_items
```

Each evidence link records relation type, source authority, independent-group key, what it supports, and observation time. Evidence keeps the excerpt and exact locator; Snapshot keeps fetched time, content hash and raw object key. Verification status is reproducible from stored `ContactVerificationFacts`; `source_confirmed`, `cross_confirmed` and `manually_confirmed` are not inferred from confidence alone.

## Interaction Feedback Chain

`interactions` stores the submitted summary, full raw content/hash/object key, submitted facts, outcome and interpretation state. `interaction_evidence_links` points to the immutable interaction evidence. The Interpreter emits evidence-linked Claims, Contact/Route changes, a legal Opportunity transition, score changes and a next action. `interaction_claim_links` records the resulting Claim changes. Action Card revisions use `based_on_version_no` and `feedback_refs`, preserving the user comment or interaction-derived feedback that caused the new immutable version.

## Domain Event and Outbox

Every core state-changing transaction appends a versioned `domain_events` row containing Tenant, Aggregate, `aggregate_version`, schema-versioned event type, actor, correlation/causation IDs and payload evidence refs. The same transaction inserts its unique `outbox_events` row. A rollback removes both. `claim_outbox_batch` leases pending or expired rows with `FOR UPDATE SKIP LOCKED`; attempts, lease expiry and last error support recovery.

## Read models and checkpoints

The Projector materializes mission dashboard/progress, targets, contact paths, Opportunity board, Action queue, Timeline and Run views. `timeline_read_model.event_id` makes replay idempotent. `projection_checkpoints` stores each consumer's last event/time and processed count; `projection_failures` stores retryable failure state. A Projector restart resumes from the checkpoint and can reclaim expired leases. `pg_notify` is sent only after the read-model transaction commits; the API converts that committed notification into the `.v1` mission SSE envelope with `readModelVersion`.
