# Workflows, Agents and Connectors

## Mission Workflow

```text
compile mission
  -> ingest company sources
  -> parallel capability / routes / competitors / expert signals
  -> wait for Route Approval Signal
  -> ecosystem discovery per approved route
  -> entity resolution
  -> target ranking
  -> create Opportunity child workflows
  -> active
  -> weekly Refresh Schedule
  -> complete on Mission completion signal
```

Typed Signals support route review, pause/resume, manual refresh, capability research, budget updates, child milestones and completion. Each Opportunity uses `opportunity:{tenantId}:{opportunityId}`, remains alive after the parent reaches `active`, and reports status/action milestones. Queries expose stage, completed work, pending approvals, budget usage and child status counts. The Workflow persists state through Continue As New.

## Opportunity Workflow

```text
resolve target identity
  -> map stakeholders
  -> find public contact paths
  -> verify primary and backup paths
  -> qualify and score opportunity
  -> build Action Card
  -> wait for Action Card decision
  -> wait for Interaction Signals
  -> interpret facts and status
  -> optionally build a new Action Card version
  -> close at won/lost/archived
```

Action Card decisions carry the expected version. `request_changes` persists user feedback and creates a `basedOnVersionNo` revision before waiting again; approval moves into the durable Interaction wait. Interaction Signals are queued by ID, interpreted in order, applied transactionally and can regenerate another card. Pause/resume, priority/budget updates and focused research are typed Signals. No message is sent by the Workflow. `execute` means the user performed the external action and explicitly marked it.

## Refresh Workflow

The weekly Temporal Schedule and manual request each start a separately identified Refresh Workflow. It loads active sources, contacts and competitor scope; refreshes each item with retry policy; identifies changed source hashes; and writes a proposed `refresh_proposal` Artifact Version. The accepted version changes only after user approval in Refresh Center.

## Retry, idempotency and history

Activity inputs always include Tenant, Mission, optional aggregate IDs, an idempotency key and correlation/causation identity. Activities perform small scoped operations and persist business facts, Domain Event and Outbox atomically; a retry returns the existing result for the same key. Connector/transient failures use capped exponential retry, while validation and gate failures are non-retryable. Mission and Opportunity histories use Continue As New with restored state, including pending interactions, approvals and child milestones.

## Agent Skills

| Skill key | Responsibility |
|---|---|
| `mission_compiler` | Normalize sparse mission input |
| `capability_evidence_extractor` | Build capability Claim/Evidence ledger |
| `market_route_researcher` | Generate 3–8 evidence-backed entry routes |
| `competitor_researcher` | Map competitor local entry patterns |
| `expert_signal_researcher` | Extract attributable market opinions |
| `ecosystem_mapper` | Discover entities and business relationships |
| `entity_resolver` | Create/merge/link identity decisions |
| `stakeholder_mapper` | Map buying and influence roles |
| `contact_path_finder` | Find public primary/backup contact paths |
| `opportunity_qualifier` | Score value, evidence and resource cost |
| `action_card_builder` | Produce user-executable first-contact package |
| `interaction_interpreter` | Convert real interactions into facts and next state |

Every Skill declares a Zod output schema, permitted Connectors, query plan, research-loop cap and prompt version. The runner stores Agent/Tool runs, model usage, source IDs and failures. The evidence validator rejects unknown citations, missing evidence and insufficient independent route sources.

## Connectors

- Web Search: Tavily live provider plus deterministic Mock.
- Browser: direct fetch, Playwright render fallback, extraction, object storage and content hash.
- Company Website: sitemap/product/case/certification/contact discovery and selected crawl.
- Document: PDF/DOCX/XLSX/PPTX extraction, chunking and OpenAI embeddings.
- Tender Search: localized query construction and tender/procurement field extraction.
- Social Public Search: search-indexed public professional/company/community fields only.
- Contact Verification: normalize, format, MX, URL, independent-source, employment and manual scoring.
- Object Storage: content-addressed S3/MinIO raw objects.

Mock Connector results use `.example` domains and `fixture: true`; they never represent real companies or reachable people.
