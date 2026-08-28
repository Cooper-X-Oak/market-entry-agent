ALTER TABLE interactions ADD COLUMN IF NOT EXISTS raw_content text;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS raw_content_hash varchar(128);
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS interpretation_status text NOT NULL DEFAULT 'pending';
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS interpreted_at timestamptz;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS interpreter_agent_run_id uuid;

UPDATE interactions
SET raw_content_hash = encode(digest(COALESCE(raw_content, summary), 'sha256'), 'hex')
WHERE raw_content_hash IS NULL;

ALTER TABLE action_cards ADD COLUMN IF NOT EXISTS based_on_version_no integer;
ALTER TABLE action_cards ADD COLUMN IF NOT EXISTS feedback_refs uuid[] NOT NULL DEFAULT '{}'::uuid[];
ALTER TABLE artifact_versions ADD COLUMN IF NOT EXISTS evidence_refs uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE TABLE IF NOT EXISTS interaction_claim_links (
  interaction_id uuid NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  change_type text NOT NULL,
  PRIMARY KEY (interaction_id, claim_id)
);

CREATE TABLE IF NOT EXISTS interaction_evidence_links (
  interaction_id uuid NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
  evidence_item_id uuid NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  PRIMARY KEY (interaction_id, evidence_item_id)
);

CREATE TABLE IF NOT EXISTS refresh_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  artifact_version_id uuid NOT NULL REFERENCES artifact_versions(id) ON DELETE CASCADE,
  trigger_type varchar(40) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'proposed',
  changed_source_count integer NOT NULL DEFAULT 0,
  reverified_contact_count integer NOT NULL DEFAULT 0,
  changed_competitor_count integer NOT NULL DEFAULT 0,
  affected_opportunity_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  requested_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS interactions_tenant_mission_opportunity_time_idx ON interactions(tenant_id, mission_id, opportunity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS refresh_proposals_tenant_mission_status_idx ON refresh_proposals(tenant_id, mission_id, status);

ALTER TABLE interaction_claim_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_claim_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS interaction_claim_links_parent_tenant ON interaction_claim_links;
CREATE POLICY interaction_claim_links_parent_tenant ON interaction_claim_links
USING (EXISTS (SELECT 1 FROM interactions i WHERE i.id = interaction_claim_links.interaction_id AND i.tenant_id = current_tenant_id()))
WITH CHECK (EXISTS (SELECT 1 FROM interactions i WHERE i.id = interaction_claim_links.interaction_id AND i.tenant_id = current_tenant_id()));

ALTER TABLE interaction_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_evidence_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS interaction_evidence_links_parent_tenant ON interaction_evidence_links;
CREATE POLICY interaction_evidence_links_parent_tenant ON interaction_evidence_links
USING (EXISTS (SELECT 1 FROM interactions i WHERE i.id = interaction_evidence_links.interaction_id AND i.tenant_id = current_tenant_id()))
WITH CHECK (EXISTS (SELECT 1 FROM interactions i WHERE i.id = interaction_evidence_links.interaction_id AND i.tenant_id = current_tenant_id()));

ALTER TABLE refresh_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_proposals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refresh_proposals_tenant_isolation ON refresh_proposals;
CREATE POLICY refresh_proposals_tenant_isolation ON refresh_proposals
USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON interaction_claim_links, interaction_evidence_links, refresh_proposals TO imea_api, imea_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_proposals TO imea_projector;
