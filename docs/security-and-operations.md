# Security and Operations

## Security controls

- JWT authentication is accepted from an HTTP-only cookie or bearer token.
- Role permissions are checked in application services, not inferred from UI visibility.
- Tenant filters exist in repositories and PostgreSQL RLS provides a second boundary.
- Runtime database identities are separated: `imea_migrator`, `imea_api`, `imea_worker` and `imea_projector`; only the Projector can execute the controlled Outbox claim function.
- `Idempotency-Key` protects mutation retries.
- Uploaded files are capped at 50 MB and stored under tenant/mission content-addressed keys.
- Logs redact passwords, hashes, authorization/cookie headers, API keys, tokens and secrets.
- Runtime secrets are environment/Secret values; no real credential belongs in Git or an export.
- Only public business contact paths and user-supplied sources are in scope. Private contact guessing and automatic outreach are out of scope.
- Claims preserve fact/inference/unknown/contradiction state and immutable evidence locators.
- Action content requires approval before export; exports are audited.

`ENCRYPTION_KEY` is reserved for AES-GCM encryption of durable provider configuration. V1 deployments in this repository inject provider credentials directly from the runtime Secret rather than persisting them in application tables.

## Health and readiness

- `/health`: process plus PostgreSQL query.
- `/ready`: PostgreSQL, Temporal system info and S3 bucket head request.
- API has liveness/readiness probes in Kubernetes.
- Worker handles `SIGINT`/`SIGTERM`, shuts down Temporal polling, database connections and telemetry.
- Projector stops polling, closes the database and flushes telemetry.

## Observability

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to an OTLP/HTTP collector base URL. API, Worker and Projector emit auto-instrumented traces with stable service names. Structured logs use these correlation dimensions where available:

```text
request_id tenant_id mission_id opportunity_id workflow_id
agent_run_id tool_run_id duration_ms error_code
```

Operational dashboards should track API latency/error rate, Connector success/rate limits, workflow/activity failures, approval wait time, outbox backlog, verified contact freshness, Agent token/cost and mission budget ratio.

## Backup and retention

- Enable PostgreSQL PITR and verify restore drills.
- Enable S3 object versioning and lifecycle rules appropriate to uploaded evidence.
- Retain Domain Events and accepted Artifact Versions as audit history.
- Define tenant-specific deletion/export policy before production onboarding.
- Store database, provider and encryption secrets in the platform secret manager; rotate them independently from images.

## Deployment order

1. Provision PostgreSQL with pgvector, Temporal, object storage and OTLP collector.
2. Create runtime secrets and replace public origins/image references.
3. Run the migration Job exactly once per release.
4. Deploy API, Worker and Projector.
5. Check `/ready`, Temporal pollers and outbox backlog.
6. Deploy Web and run an authorized smoke/E2E pass.
7. Promote traffic only after the delivery gates pass.

## Projection recovery

Monitor pending/expired Outbox leases, `projection_failures`, checkpoint age and read-model version lag. Restarting the Projector is safe: expired leases are reclaimable, Timeline inserts are event-ID idempotent, and the consumer advances its checkpoint only with successful projection. Investigate failures under the event Tenant context before replaying them.

The checked-in Kubernetes Secret is a placeholder manifest, not a production secret source.
