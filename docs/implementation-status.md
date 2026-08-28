# V1 upgrade implementation status

This is the delivery record for upgrade packages UP01–UP10. Source paths are permanent project infrastructure; `coverage/`, `.next/`, `dist/`, Playwright output, container volumes and runtime objects are generated evidence and are not source-managed.

| UP | Status | Permanent implementation | Migration / API / Workflow / UI | Test and acceptance evidence |
|---|---|---|---|---|
| UP01 Build and dependency baseline | Implemented | root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, root/package/app `tsconfig.json`, CI | Exact pnpm 10.15.0, frozen install, project references and upstream build/typecheck graph | `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build` |
| UP02 Contracts and domain state machines | Implemented | `packages/contracts/src/{common,enums,events,execution,agent-context,workflows}.ts`, `packages/domain/src/{state-machines,gates,scoring}.ts` | Versioned event catalog, typed commands/signals, Contact Verification Facts, legal trigger/evidence gates and immutable Action Card revisions | `packages/contracts/src/__tests__/contracts.test.ts`, `packages/domain/src/__tests__/domain.test.ts`, coverage output |
| UP03 Database migration and RLS | Implemented | `packages/database/src/schema`, `packages/database/migrations/0002`–`0005`, `deploy/postgres/init-roles.sql`, role URL config | `imea_migrator/api/worker/projector`, forced RLS, parent policies, Contact chain, event/projection/interaction/refresh schema | `packages/database/src/__tests__/database.integration.test.ts` |
| UP04 Domain Event and Projection | Implemented | `packages/database/src/events.ts`, `apps/projector/src`, API event stream | Atomic Event/Outbox, lease/checkpoint/failure recovery, idempotent read models, post-commit `.v1` SSE with read-model version | database integration tests plus Projector source; Timeline event ID and checkpoint uniqueness |
| UP05 Agent Context and trust chain | Implemented | `packages/contracts/src/agent-context.ts`, `packages/agents/src/context-builder.ts`, `apps/worker/src/agent-context-repository.ts`, Connector evidence enrichment/run persistence | Context hash/version, prompt/evidence/tool identity, exact Source/Snapshot/Evidence locator, Contact and Interaction context | Contracts, Connector Contract and Agent Eval tests |
| UP06 Temporal Workflow | Implemented | `packages/workflows/src/mission-workflow.ts`, `opportunity-workflow.ts`, `refresh-workflow.ts`, typed scope/types/client | Tenant-qualified Workflow IDs, Child workflows/milestones, revision loop, interaction queue, manual/scheduled refresh, retry/idempotency/Continue As New state | three tests under `packages/workflows/src/__tests__`, `pnpm test:workflow` |
| UP07 Worker Activities and transactional writes | Implemented | `apps/worker/src/activities.ts`, runtime/factory/main | Small scoped activities, Tenant transaction context, idempotency, business write + Event + Outbox, interpretation application and refresh proposals | Type/unit/integration/workflow gates |
| UP08 API and workbench linkage | Implemented | `apps/api/src/market`, `apps/web/app/missions`, `apps/web/components`, `apps/web/lib` | Command receipts, route review, unified Action decision, raw Interaction, Contact/Opportunity trust detail, Workflow Progress, Timeline causality, Run provenance and committed SSE refresh | API/unit source and Playwright scenarios under `apps/web/e2e` |
| UP09 Tests and deterministic Demo | Implemented | all listed test files, `packages/agents/evals/cases.json`, `mock-fixtures.ts`, `packages/database/src/seed.ts` | Fixed UUID and `.example` fixture: 3 approved routes, 20 targets, 10 contactable opportunities, 5 opportunity-level complete cards plus an interaction-driven revision, primary/backup contacts, 3 competitors, 5 opinions, interaction-created Claim/Evidence links and manual/scheduled refresh evidence | `pnpm test`, `pnpm test:integration`, `pnpm test:workflow`, `pnpm test:e2e` |
| UP10 Documentation and final gate | Implemented | `README.md`, `docs/{architecture,api,data-model,workflows,security-and-operations,implementation-status}.md`, `.env.example`, Compose/Docker/Kubernetes | Runbook, API command/receipt semantics, data/evidence/feedback/event chains, Workflow recovery, four database roles and deployment order | commands in Final gate record below |

## Database changes

- `0002_service_roles_and_rls.sql`: runtime roles, grants and direct/parent Tenant policies.
- `0003_contact_evidence_chain.sql`: Contact Facts/history plus evidence relationship tables.
- `0004_domain_event_projection.sql`: event versions, tenant Outbox leasing, Context/Tool provenance, read-model identity, checkpoints/failures and controlled claim function.
- `0005_interaction_feedback.sql`: raw Interaction interpretation, Action/Artifact feedback links and Refresh proposal state.

## API, Workflow, Activity and page summary

- Commands return durable acceptance receipts; final state is observed through Workflow Progress, REST read models and post-projection SSE.
- Mission orchestrates route approval, discovery/ranking and long-lived Opportunity children. Opportunity orchestrates research, card review/revision, ordered interactions and closure. Refresh is separately identified for manual or weekly execution.
- Worker Activities are tenant-scoped and transactional. Agent output is parsed/validated before write; idempotency covers retries.
- The workbench exposes child progress/pending actions, route review, Contact trust chain, Opportunity transition evidence, card feedback/versioning, full Interaction entry, correlated Timeline and Agent/Tool provenance.

## Final gate record

The following commands are the sole delivery gates. Record the current run outcome here when completed; do not infer a pass from source presence.

| Gate | Current run |
|---|---|
| `pnpm install --frozen-lockfile` | **PASS** — lockfile current, pnpm 10.15.0, 15 workspace projects |
| `pnpm lint` | **PASS** — 14/14 Turbo tasks |
| `pnpm typecheck` | **PASS** — 24/24 Turbo tasks including dependency builds |
| `pnpm test` | **PASS** — 24/24 Turbo tasks; Contracts 99.05%, Domain 99.2%, Policies 100% statement/line coverage |
| `pnpm test:integration` | **ENVIRONMENT BLOCKED** — Testcontainers reported `Could not find a working container runtime strategy`; all 6 database/RLS/outbox cases were discovered but not started |
| `pnpm test:workflow` | **PASS** — 2/2 Turbo tasks and 3/3 Temporal suites (Mission, Opportunity, Refresh) |
| `pnpm test:e2e` | **ENVIRONMENT BLOCKED** — Chromium installed and all 3 scenarios discovered; full stack is unavailable at `localhost:3000` because no container runtime is installed |
| `pnpm build` | **PASS** — 14/14 Turbo tasks; Next production build emitted all workbench routes |
| `docker compose up --build` and health inspection | **ENVIRONMENT BLOCKED** — `docker` is not installed or not present on PATH on this host |

Acceptance evidence is reproducible from the command output, coverage reports under package `coverage/`, Playwright output, Temporal test histories and Compose service health/logs. The two blocked gates require a Docker-compatible container runtime, then `docker compose up --build` and the documented seed command. No credentials or runtime business data are included in this document.
