CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'missions','mission_sources','sources','claims','evidence_items','artifacts','entities','entity_relationships','stakeholder_roles',
    'market_routes','competitor_profiles','industry_opinions','contact_points','opportunities','action_cards','interactions','approvals',
    'domain_events','agent_runs','workflow_instances','idempotency_records','mission_dashboard_read_model','timeline_read_model'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())', table_name, table_name);
  END LOOP;
END $$;

ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_members_tenant_isolation ON tenant_members
USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX outbox_status_next_idx ON outbox_events(status,next_attempt_at);
CREATE INDEX contact_points_org_idx ON contact_points(organization_id);
CREATE INDEX opportunities_mission_status_idx ON opportunities(mission_id,status);
CREATE INDEX opportunities_mission_score_idx ON opportunities(mission_id,score DESC);
CREATE INDEX market_routes_mission_status_idx ON market_routes(mission_id,status);
CREATE INDEX entity_relationships_source_idx ON entity_relationships(mission_id,source_entity_id);
CREATE INDEX entity_relationships_target_idx ON entity_relationships(mission_id,target_entity_id);
