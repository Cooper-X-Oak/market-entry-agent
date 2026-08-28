ALTER TABLE domain_events ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1;
ALTER TABLE domain_events ADD COLUMN IF NOT EXISTS aggregate_version integer;

WITH versions AS (
  SELECT id, row_number() OVER (PARTITION BY tenant_id, aggregate_type, aggregate_id ORDER BY occurred_at, id)::integer AS version
  FROM domain_events
)
UPDATE domain_events de SET aggregate_version = versions.version
FROM versions WHERE versions.id = de.id AND de.aggregate_version IS NULL;

ALTER TABLE domain_events ALTER COLUMN aggregate_version SET NOT NULL;

ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS consumer_name varchar(120);
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS lease_owner varchar(160);
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
UPDATE outbox_events o SET tenant_id = de.tenant_id FROM domain_events de WHERE de.id = o.domain_event_id AND o.tenant_id IS NULL;
ALTER TABLE outbox_events ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS context_version integer NOT NULL DEFAULT 1;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS input_context_hash varchar(128);
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS evidence_item_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
UPDATE agent_runs SET input_context_hash = md5(id::text) WHERE input_context_hash IS NULL;
ALTER TABLE agent_runs ALTER COLUMN input_context_hash SET NOT NULL;

ALTER TABLE tool_runs ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE tool_runs ADD COLUMN IF NOT EXISTS mission_id uuid REFERENCES missions(id) ON DELETE CASCADE;
ALTER TABLE tool_runs ADD COLUMN IF NOT EXISTS snapshot_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
ALTER TABLE tool_runs ADD COLUMN IF NOT EXISTS evidence_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
UPDATE tool_runs tr SET tenant_id = ar.tenant_id, mission_id = ar.mission_id FROM agent_runs ar WHERE ar.id = tr.agent_run_id AND tr.tenant_id IS NULL;
ALTER TABLE tool_runs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE tool_runs ALTER COLUMN mission_id SET NOT NULL;

ALTER TABLE mission_progress_read_model ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE mission_progress_read_model ADD COLUMN IF NOT EXISTS workflow_run_id varchar(240);
ALTER TABLE mission_progress_read_model ADD COLUMN IF NOT EXISTS read_model_version integer NOT NULL DEFAULT 0;
ALTER TABLE mission_progress_read_model ADD COLUMN IF NOT EXISTS child_opportunity_total integer NOT NULL DEFAULT 0;
ALTER TABLE mission_progress_read_model ADD COLUMN IF NOT EXISTS child_opportunity_action_ready integer NOT NULL DEFAULT 0;
ALTER TABLE mission_progress_read_model ADD COLUMN IF NOT EXISTS child_opportunity_active integer NOT NULL DEFAULT 0;
ALTER TABLE mission_progress_read_model ADD COLUMN IF NOT EXISTS child_opportunity_closed integer NOT NULL DEFAULT 0;
ALTER TABLE mission_progress_read_model ADD COLUMN IF NOT EXISTS last_event_id uuid;
UPDATE mission_progress_read_model rm SET tenant_id = m.tenant_id FROM missions m WHERE m.id = rm.mission_id AND rm.tenant_id IS NULL;
ALTER TABLE mission_progress_read_model ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE timeline_read_model ADD COLUMN IF NOT EXISTS correlation_id uuid;
ALTER TABLE timeline_read_model ADD COLUMN IF NOT EXISTS causation_id uuid;
ALTER TABLE timeline_read_model ADD COLUMN IF NOT EXISTS aggregate_version integer;
ALTER TABLE timeline_read_model ADD COLUMN IF NOT EXISTS schema_version integer;
UPDATE timeline_read_model tr
SET correlation_id = COALESCE(de.correlation_id, tr.event_id),
    causation_id = de.causation_id,
    aggregate_version = COALESCE(de.aggregate_version, 1),
    schema_version = COALESCE(de.schema_version, 1)
FROM domain_events de
WHERE de.id = tr.event_id AND tr.correlation_id IS NULL;
UPDATE timeline_read_model
SET correlation_id = event_id, aggregate_version = 1, schema_version = 1
WHERE correlation_id IS NULL;
ALTER TABLE timeline_read_model ALTER COLUMN correlation_id SET NOT NULL;
ALTER TABLE timeline_read_model ALTER COLUMN aggregate_version SET NOT NULL;
ALTER TABLE timeline_read_model ALTER COLUMN schema_version SET NOT NULL;

ALTER TABLE run_read_model ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE run_read_model ADD COLUMN IF NOT EXISTS context_version integer NOT NULL DEFAULT 1;
ALTER TABLE run_read_model ADD COLUMN IF NOT EXISTS input_context_hash varchar(128);
ALTER TABLE run_read_model ADD COLUMN IF NOT EXISTS prompt_version integer;
ALTER TABLE run_read_model ADD COLUMN IF NOT EXISTS evidence_item_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
ALTER TABLE run_read_model ADD COLUMN IF NOT EXISTS tool_runs jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE run_read_model rm
SET tenant_id = ar.tenant_id,
    context_version = ar.context_version,
    input_context_hash = ar.input_context_hash,
    evidence_item_ids = ar.evidence_item_ids
FROM agent_runs ar WHERE ar.id = rm.run_id AND rm.tenant_id IS NULL;
UPDATE run_read_model rm SET tenant_id = m.tenant_id FROM missions m WHERE m.id = rm.mission_id AND rm.tenant_id IS NULL;
UPDATE run_read_model SET input_context_hash = md5(run_id::text) WHERE input_context_hash IS NULL;
ALTER TABLE run_read_model ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE run_read_model ALTER COLUMN input_context_hash SET NOT NULL;

CREATE TABLE IF NOT EXISTS projection_checkpoints (
  consumer_name varchar(120) PRIMARY KEY,
  last_event_id uuid,
  last_occurred_at timestamptz,
  processed_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projection_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_name varchar(120) NOT NULL,
  event_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 1,
  error_code varchar(120) NOT NULL,
  error_message text NOT NULL,
  next_retry_at timestamptz NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consumer_name, event_id)
);

DROP INDEX IF EXISTS domain_events_aggregate_version_uidx;
CREATE UNIQUE INDEX domain_events_aggregate_version_uidx ON domain_events(tenant_id, aggregate_type, aggregate_id, aggregate_version);
CREATE INDEX IF NOT EXISTS domain_events_tenant_time_id_idx ON domain_events(tenant_id, occurred_at, id);
CREATE INDEX IF NOT EXISTS outbox_tenant_status_next_idx ON outbox_events(tenant_id, status, next_attempt_at);
CREATE UNIQUE INDEX IF NOT EXISTS projection_checkpoints_consumer_uidx ON projection_checkpoints(consumer_name);

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outbox_events_tenant_isolation ON outbox_events;
CREATE POLICY outbox_events_tenant_isolation ON outbox_events
USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE tool_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tool_runs_tenant_isolation ON tool_runs;
CREATE POLICY tool_runs_tenant_isolation ON tool_runs
USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE mission_progress_read_model ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_progress_read_model FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mission_progress_read_model_tenant_isolation ON mission_progress_read_model;
CREATE POLICY mission_progress_read_model_tenant_isolation ON mission_progress_read_model
USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE run_read_model ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_read_model FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS run_read_model_tenant_isolation ON run_read_model;
CREATE POLICY run_read_model_tenant_isolation ON run_read_model
USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE projection_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE projection_failures FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS projection_failures_tenant_isolation ON projection_failures;
CREATE POLICY projection_failures_tenant_isolation ON projection_failures
USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE projection_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE projection_checkpoints FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS projection_checkpoints_projector_access ON projection_checkpoints;
CREATE POLICY projection_checkpoints_projector_access ON projection_checkpoints TO imea_projector USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION claim_outbox_batch(
  p_consumer_name text,
  p_batch_size integer,
  p_lease_seconds integer
) RETURNS TABLE (
  outbox_id uuid,
  domain_event_id uuid,
  tenant_id uuid,
  event_type varchar,
  aggregate_type varchar,
  aggregate_id uuid,
  payload jsonb,
  occurred_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT o.id
    FROM outbox_events o
    WHERE o.next_attempt_at <= now()
      AND (o.status = 'pending' OR (o.status = 'processing' AND o.lease_expires_at < now()))
    ORDER BY o.created_at, o.id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_batch_size, 1)
  ), leased AS (
    UPDATE outbox_events o
    SET status = 'processing',
        consumer_name = p_consumer_name,
        lease_owner = p_consumer_name,
        lease_expires_at = now() + make_interval(secs => GREATEST(p_lease_seconds, 1)),
        attempts = o.attempts + 1
    FROM candidates c
    WHERE o.id = c.id
    RETURNING o.id, o.domain_event_id, o.tenant_id
  )
  SELECT l.id, de.id, l.tenant_id, de.event_type, de.aggregate_type, de.aggregate_id, de.payload, de.occurred_at
  FROM leased l JOIN domain_events de ON de.id = l.domain_event_id
  ORDER BY de.occurred_at, de.id;
END $$;

REVOKE ALL ON FUNCTION claim_outbox_batch(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_outbox_batch(text, integer, integer) TO imea_projector;
GRANT SELECT, INSERT, UPDATE, DELETE ON projection_checkpoints, projection_failures TO imea_projector;
