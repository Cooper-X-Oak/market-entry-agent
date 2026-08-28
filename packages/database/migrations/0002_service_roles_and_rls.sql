DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'imea_owner') THEN CREATE ROLE imea_owner NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'imea_migrator') THEN CREATE ROLE imea_migrator NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'imea_api') THEN CREATE ROLE imea_api NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'imea_worker') THEN CREATE ROLE imea_worker NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'imea_projector') THEN CREATE ROLE imea_projector NOLOGIN; END IF;
END $$;

GRANT USAGE ON SCHEMA public TO imea_migrator, imea_api, imea_worker, imea_projector;
GRANT CREATE ON SCHEMA public TO imea_migrator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO imea_api, imea_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO imea_projector;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO imea_api, imea_worker, imea_projector;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO imea_api, imea_worker, imea_projector;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO imea_api, imea_worker, imea_projector;

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

DO $$
DECLARE
  table_name text;
  direct_tables text[] := ARRAY[
    'tenant_members','missions','mission_sources','sources','artifacts','claims','evidence_items','entities',
    'market_routes','entity_relationships','stakeholder_roles','competitor_profiles','industry_opinions',
    'contact_points','opportunities','action_cards','interactions','approvals','domain_events','agent_runs',
    'workflow_instances','idempotency_records','mission_dashboard_read_model','timeline_read_model'
  ];
BEGIN
  FOREACH table_name IN ARRAY direct_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_tenant_isolation', table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())',
        table_name || '_tenant_isolation', table_name
      );
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS tenant_members_auth_lookup ON tenant_members;
CREATE POLICY tenant_members_auth_lookup ON tenant_members FOR SELECT TO imea_api
USING (user_id::text = nullif(current_setting('app.auth_user_id', true), ''));

ALTER TABLE source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS source_snapshots_parent_tenant ON source_snapshots;
CREATE POLICY source_snapshots_parent_tenant ON source_snapshots
USING (EXISTS (SELECT 1 FROM sources s WHERE s.id = source_snapshots.source_id AND s.tenant_id = current_tenant_id()))
WITH CHECK (EXISTS (SELECT 1 FROM sources s WHERE s.id = source_snapshots.source_id AND s.tenant_id = current_tenant_id()));

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_chunks_parent_tenant ON document_chunks;
CREATE POLICY document_chunks_parent_tenant ON document_chunks
USING (EXISTS (
  SELECT 1 FROM source_snapshots ss JOIN sources s ON s.id = ss.source_id
  WHERE ss.id = document_chunks.source_snapshot_id AND s.tenant_id = current_tenant_id()
)) WITH CHECK (EXISTS (
  SELECT 1 FROM source_snapshots ss JOIN sources s ON s.id = ss.source_id
  WHERE ss.id = document_chunks.source_snapshot_id AND s.tenant_id = current_tenant_id()
));

ALTER TABLE artifact_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS artifact_versions_parent_tenant ON artifact_versions;
CREATE POLICY artifact_versions_parent_tenant ON artifact_versions
USING (EXISTS (SELECT 1 FROM artifacts a WHERE a.id = artifact_versions.artifact_id AND a.tenant_id = current_tenant_id()))
WITH CHECK (EXISTS (SELECT 1 FROM artifacts a WHERE a.id = artifact_versions.artifact_id AND a.tenant_id = current_tenant_id()));

ALTER TABLE claim_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_evidence_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS claim_evidence_links_parent_tenant ON claim_evidence_links;
CREATE POLICY claim_evidence_links_parent_tenant ON claim_evidence_links
USING (EXISTS (SELECT 1 FROM claims c WHERE c.id = claim_evidence_links.claim_id AND c.tenant_id = current_tenant_id()))
WITH CHECK (EXISTS (SELECT 1 FROM claims c WHERE c.id = claim_evidence_links.claim_id AND c.tenant_id = current_tenant_id()));

ALTER TABLE entity_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_aliases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entity_aliases_parent_tenant ON entity_aliases;
CREATE POLICY entity_aliases_parent_tenant ON entity_aliases
USING (EXISTS (SELECT 1 FROM entities e WHERE e.id = entity_aliases.entity_id AND e.tenant_id = current_tenant_id()))
WITH CHECK (EXISTS (SELECT 1 FROM entities e WHERE e.id = entity_aliases.entity_id AND e.tenant_id = current_tenant_id()));

ALTER TABLE mission_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_entities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mission_entities_parent_tenant ON mission_entities;
CREATE POLICY mission_entities_parent_tenant ON mission_entities
USING (EXISTS (SELECT 1 FROM missions m WHERE m.id = mission_entities.mission_id AND m.tenant_id = current_tenant_id()))
WITH CHECK (EXISTS (SELECT 1 FROM missions m WHERE m.id = mission_entities.mission_id AND m.tenant_id = current_tenant_id()));

ALTER TABLE opportunity_stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_stakeholders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunity_stakeholders_parent_tenant ON opportunity_stakeholders;
CREATE POLICY opportunity_stakeholders_parent_tenant ON opportunity_stakeholders
USING (EXISTS (SELECT 1 FROM opportunities o WHERE o.id = opportunity_stakeholders.opportunity_id AND o.tenant_id = current_tenant_id()))
WITH CHECK (EXISTS (SELECT 1 FROM opportunities o WHERE o.id = opportunity_stakeholders.opportunity_id AND o.tenant_id = current_tenant_id()));

ALTER TABLE opportunity_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_contacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunity_contacts_parent_tenant ON opportunity_contacts;
CREATE POLICY opportunity_contacts_parent_tenant ON opportunity_contacts
USING (EXISTS (SELECT 1 FROM opportunities o WHERE o.id = opportunity_contacts.opportunity_id AND o.tenant_id = current_tenant_id()))
WITH CHECK (EXISTS (SELECT 1 FROM opportunities o WHERE o.id = opportunity_contacts.opportunity_id AND o.tenant_id = current_tenant_id()));

ALTER TABLE opportunity_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_scores FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunity_scores_parent_tenant ON opportunity_scores;
CREATE POLICY opportunity_scores_parent_tenant ON opportunity_scores
USING (EXISTS (SELECT 1 FROM opportunities o WHERE o.id = opportunity_scores.opportunity_id AND o.tenant_id = current_tenant_id()))
WITH CHECK (EXISTS (SELECT 1 FROM opportunities o WHERE o.id = opportunity_scores.opportunity_id AND o.tenant_id = current_tenant_id()));
