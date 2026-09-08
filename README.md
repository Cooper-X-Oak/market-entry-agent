# Industrial Market Entry Agent

Industrial Market Entry Agent is a multi-tenant, evidence-backed market-entry workbench for industrial companies. It turns a company brief and public sources into approved market routes, an entity ecosystem, ranked targets, verified public contact paths, qualified opportunities, executable action cards and auditable refresh proposals.

The application implements the V1 PRD in [`docs/PRD/industrial-market-entry-agent-v1-prd.md`](docs/PRD/industrial-market-entry-agent-v1-prd.md). All demo organizations, people, websites and contact details are deterministic fictional fixtures.

## 当前工作入口：BM1 / Vultr

当前状态、已记录证据和验收口径统一维护在 [当前状态与 BM1 验收入口](docs/testing/README.md)。BM1 的业务范围与退出条件见 [BM1 业务纵向闭环计划](docs/ChatGptPlan/BM1-业务纵向闭环计划.md)：`Mission → Evidence → Route → Target → Contact → Opportunity → Action Card`。

项目开发环境使用临时 Vultr 4 GB 服务器，本机通过 SSH Tunnel 访问。在项目根目录运行以下命令并保持窗口运行，再打开 `http://localhost:3000/login`：

```powershell
.\scripts\devserver-tunnel.ps1
```

部署与服务器操作见 [AGENTS.md](AGENTS.md)。下方 Local Mock 和 Docker Compose 是独立的本机演示场景；历史 UP01–UP10 交付记录见 [implementation-status.md](docs/implementation-status.md)。测试与验证按用户明确授权执行。

## System layout

```text
Next.js workbench
       │ REST + SSE
       ▼
NestJS API ───────────────► PostgreSQL + pgvector
       │                         │ domain events + outbox
       │ Temporal commands       ▼
       ▼                    Read-model projector
Temporal Server ◄────────── Temporal worker
                                  │
                    OpenAI Agents / Mock model
                    OpenAI Web Search / Browser / Documents
                    Contact verification / S3
```

The repository is a pnpm/Turbo monorepo:

- `apps/web`: desktop-first Next.js 15 workbench.
- `apps/api`: NestJS/Fastify REST API, auth, permissions, SSE and exports.
- `apps/worker`: Temporal activities, Agent runtime and Connector orchestration.
- `apps/projector`: outbox projector for dashboard, timeline and run read models.
- `packages/contracts`: shared Zod contracts and enums.
- `packages/domain`: state machines, gates and opportunity scoring.
- `packages/database`: Drizzle schema, migrations, RLS, repositories and seed.
- `packages/workflows`: durable Mission, Opportunity and Refresh workflows.
- `packages/agents`: Agent Skills, prompts, evidence validation and eval harness.
- `packages/connectors`: live and deterministic public-research connectors.
- `packages/policies`: tenant roles, permissions and budget controls.
- `packages/evidence`: evidence coverage, freshness and entity resolution.
- `packages/observability`: redacted structured logging and OpenTelemetry bootstrap.

## Versioned prerequisites

- Node.js 22.x
- pnpm 10.15.0 through Corepack (`packageManager` is pinned)
- TypeScript 5.9.x and Turbo 2.5.x are installed from `pnpm-lock.yaml`
- Next.js 15.5.x / React 19.1.x, NestJS 11.1.x, Temporal SDK 1.13.x
- PostgreSQL 16 with pgvector and Docker Desktop with Compose v2

Use `pnpm install --frozen-lockfile`; CI rejects dependency drift.

## Environment variables

Copy `.env.example` to `.env`. The four database URLs are intentionally role-specific: migrator owns DDL, API and Worker are tenant-scoped writers, and Projector can claim Outbox rows and write projections. `JWT_SECRET`, `COOKIE_SECRET` and `ENCRYPTION_KEY` must be replaced outside local fixtures. Temporal settings select the namespace/task-queue prefix; S3 settings target MinIO or an S3-compatible store. Live mode uses `OPENAI_API_KEY`, optional `OPENAI_BASE_URL`, and the three `OPENAI_MODEL_*` settings; `TAVILY_API_KEY` is an optional alternative search configuration. `OTEL_EXPORTER_OTLP_ENDPOINT` is optional.

## 开发账号初始化与显式演示

`pnpm db:bootstrap` 只创建默认开发账号、工作区和成员关系；重复执行保留已有密码、角色和状态，不创建或重写业务 Mission。首次初始化需使用具备身份初始化权限的 `DATABASE_URL`，不能使用受租户上下文约束的运行角色代替。

当前 Vultr 开发启动链自动执行 `postgres-bootstrap`。`postgres-seed` 属于 `demo` profile，仅在明确需要完整演示数据时手动调用。已存在的 Demo 数据会保留，本次拆分不删除数据库记录。

```bash
# 在已授权的远端操作中，显式加载或重写固定 Demo 数据
docker compose --env-file /etc/market-entry-agent/devserver.env -f docker-compose.devserver.yml --profile demo run --rm postgres-seed
```

`pnpm db:seed` 仍保留为本机完整演示入口。它会更新部分固定演示对象的状态，不能作为普通启动、恢复或真实业务验收的默认步骤。

## Local Mock-mode setup

这是显式演示场景。复制配置后，先在 `.env` 中将 `MOCK_CONNECTORS` 和 `MOCK_MODEL_PROVIDER` 都设为 `true`；示例配置的默认值用于 Live 模式。

PowerShell:

```powershell
Copy-Item .env.example .env
corepack enable
pnpm install --frozen-lockfile
docker compose up -d postgres temporal temporal-ui minio minio-init
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open:

- Workbench: `http://localhost:3000`
- API: `http://localhost:4000`
- API health/readiness: `http://localhost:4000/health`, `http://localhost:4000/ready`
- Temporal UI: `http://localhost:8080`
- MinIO console: `http://localhost:9001`

Seed login:

```text
Email: owner@demo.local
Password: Demo123!
```

Set `DEMO_PASSWORD` before the first `pnpm db:bootstrap` or `pnpm db:seed` to choose the initial password; subsequent initialization does not reset an existing account. Mock mode uses `MOCK_CONNECTORS=true` and `MOCK_MODEL_PROVIDER=true`; it requires no OpenAI or Tavily key and still provides the complete seeded demonstration.

## Full Docker Compose

After creating `.env` and replacing the local secrets, provide the initialization-owner `DATABASE_URL` in the calling shell for the explicit bootstrap command:

```powershell
docker compose up --build
docker compose run --rm postgres-migrate
docker compose run --rm -e DATABASE_URL api pnpm --filter @imea/database db:bootstrap
```

Compose starts PostgreSQL/pgvector, the migration job, Temporal, Temporal UI, MinIO, bucket initialization, API, Worker, Projector and Web.

## Live-provider mode

Change the following in `.env`:

```text
MOCK_CONNECTORS=false
MOCK_MODEL_PROVIDER=false
OPENAI_API_KEY=...
```

The live connector boundary only uses public web pages, user-provided documents and authorized APIs. It does not guess private contact data or send outreach automatically. V1 users copy/export approved content, perform the external action, and record the interaction result.

## Database lifecycle

```powershell
pnpm db:generate
pnpm db:migrate
pnpm db:bootstrap
```

Migrations enable `pgcrypto`, `citext`, `pg_trgm` and `vector`, create all core/write/read-model tables, and add tenant RLS policies. Application writes that change business state write the domain event and outbox record in the same transaction. Bootstrap preserves existing identity records; the separate demo seed can rewrite fixed demonstration states.

## Tests

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @imea/database test:integration
pnpm --filter @imea/workflows test:workflow
pnpm --filter @imea/web test:e2e
```

Test sources cover contracts, state machines, scoring/resource efficiency, permissions, budgets, evidence/freshness, entity resolution, connector contracts, three fixed Agent Eval cases, PostgreSQL migrations/RLS/outbox/artifact switching, Temporal signal-driven workflow behavior, and the three PRD Playwright journeys.

Coverage gates run with unit tests: Contracts 95%, Domain 90% and Policies 90% for statements and lines.

Production build:

```powershell
pnpm build
```

## Deterministic demo walkthrough

1. Sign in with the seeded Owner account and open `Germany Industrial Valve Entry`.
2. Review the three approved routes and their accepted evidence-backed artifact versions.
3. Open Targets and Opportunities: the fixed fixture contains at least 20 target organizations and 10 opportunities with public contact paths.
4. Open a contact to inspect Source, Snapshot, excerpt, locator, verification facts and history.
5. Open Action Queue: five complete cards have primary and backup contacts. Request changes on one version, then approve the generated revision.
6. Mark the card executed, record the response body, and inspect the resulting Claim, Evidence, Opportunity transition, Action Card revision and correlated Timeline events.
7. Trigger a manual refresh and compare its proposal with the seeded scheduled-refresh proposal before acceptance.

All names and `.example` addresses are fictional fixed fixtures.

## Troubleshooting entry points

- Dependency/build drift: `pnpm install --frozen-lockfile`, then `pnpm typecheck`.
- Database/RLS: inspect `postgres-migrate` logs and confirm the runtime uses the correct role URL and sets `app.tenant_id` inside each transaction.
- Workflow stalls: use Temporal UI at `http://localhost:8080`, query `/workflow-progress`, and inspect pending approvals/signals.
- Projection/SSE lag: inspect `outbox_events`, `projection_failures`, `projection_checkpoints` and Projector logs; SSE is emitted only after projection commit.
- Provider failures: inspect Runs and Tool Runs for retryability, raw object key, source/snapshot/evidence IDs and redacted error details.
- Readiness: call API `/ready`; it checks PostgreSQL, Temporal and object storage.

## Exports

- Each approved Action Card can be downloaded as Markdown or CSV. Export writes an audit event.
- Full Mission export generates a ZIP containing `mission.json`, capability ledger, route report, entities, relationships, contacts, opportunities, one folder of Action Cards, evidence index and timeline.

## Production deployment

The root `Dockerfile` builds each app with its workspace dependency closure. [`deploy/kubernetes/app.yaml`](deploy/kubernetes/app.yaml) supplies a migration Job plus API, Worker, Projector and Web workloads intended to connect to managed PostgreSQL, Temporal, object storage and an OTLP collector. Replace image names, public origins and every Secret value before applying it.

See:

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/data-model.md`](docs/data-model.md)
- [`docs/api.md`](docs/api.md)
- [`docs/workflows.md`](docs/workflows.md)
- [`docs/security-and-operations.md`](docs/security-and-operations.md)
- [`docs/implementation-status.md`](docs/implementation-status.md)

当前状态、BM1 验收口径与证据入口统一维护在 [当前状态与 BM1 验收入口](docs/testing/README.md)；[UP01–UP10 历史交付记录](docs/implementation-status.md) 保留当时的 PASS / BLOCKED，不代表当前版本的验收结果。
