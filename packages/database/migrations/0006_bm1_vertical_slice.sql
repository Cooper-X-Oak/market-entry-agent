ALTER TYPE mission_stage ADD VALUE IF NOT EXISTS 'researching_capabilities';
ALTER TYPE mission_stage ADD VALUE IF NOT EXISTS 'awaiting_capability_review';
ALTER TYPE mission_stage ADD VALUE IF NOT EXISTS 'awaiting_target_review';
ALTER TYPE mission_stage ADD VALUE IF NOT EXISTS 'awaiting_action_review';
ALTER TYPE approval_type ADD VALUE IF NOT EXISTS 'capability_review';
ALTER TYPE approval_type ADD VALUE IF NOT EXISTS 'target_review';

DO $$ BEGIN
  CREATE TYPE action_card_type AS ENUM ('outreach', 'research');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE missions ADD COLUMN IF NOT EXISTS execution_mode varchar(20) NOT NULL DEFAULT 'live';

CREATE TABLE IF NOT EXISTS route_evidence_links (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES market_routes(id) ON DELETE CASCADE,
  evidence_item_id uuid NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  stance evidence_stance NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (route_id, evidence_item_id, stance)
);
CREATE INDEX IF NOT EXISTS route_evidence_mission_idx ON route_evidence_links(mission_id, route_id);

CREATE TABLE IF NOT EXISTS target_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES market_routes(id) ON DELETE CASCADE,
  rank integer NOT NULL,
  market_role varchar(120) NOT NULL,
  product_fit integer NOT NULL,
  route_fit integer NOT NULL,
  demand_signal integer NOT NULL,
  contactability integer NOT NULL,
  evidence_quality integer NOT NULL,
  final_score integer NOT NULL,
  rationale text NOT NULL,
  gate_passed boolean NOT NULL DEFAULT false,
  artifact_version_id uuid NOT NULL REFERENCES artifact_versions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, entity_id, route_id)
);
CREATE INDEX IF NOT EXISTS target_assessments_mission_rank_idx ON target_assessments(mission_id, rank);

CREATE TABLE IF NOT EXISTS target_assessment_evidence_links (
  target_assessment_id uuid NOT NULL REFERENCES target_assessments(id) ON DELETE CASCADE,
  evidence_item_id uuid NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  PRIMARY KEY (target_assessment_id, evidence_item_id)
);

ALTER TABLE action_cards ADD COLUMN IF NOT EXISTS card_type action_card_type NOT NULL DEFAULT 'outreach';
ALTER TABLE action_cards ADD COLUMN IF NOT EXISTS target_role_label text;
UPDATE action_cards SET target_role_label = 'Existing stakeholder' WHERE target_role_label IS NULL;
ALTER TABLE action_cards ALTER COLUMN target_role_label SET NOT NULL;
ALTER TABLE action_cards ALTER COLUMN target_stakeholder_role_id DROP NOT NULL;
ALTER TABLE action_cards ALTER COLUMN primary_contact_point_id DROP NOT NULL;
ALTER TABLE action_cards ALTER COLUMN channel DROP NOT NULL;
ALTER TABLE action_cards ADD COLUMN IF NOT EXISTS research_plan jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE action_cards ADD COLUMN IF NOT EXISTS unknowns jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS action_card_evidence_links (
  action_card_id uuid NOT NULL REFERENCES action_cards(id) ON DELETE CASCADE,
  evidence_item_id uuid NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  PRIMARY KEY (action_card_id, evidence_item_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS opportunities_mission_organization_route_uidx ON opportunities(mission_id, organization_id, route_id);

ALTER TABLE mission_progress_read_model ADD COLUMN IF NOT EXISTS execution_mode varchar(20) NOT NULL DEFAULT 'live';
ALTER TABLE mission_progress_read_model ADD COLUMN IF NOT EXISTS current_decision varchar(80);
ALTER TABLE mission_progress_read_model ADD COLUMN IF NOT EXISTS next_action text;
ALTER TABLE mission_progress_read_model ADD COLUMN IF NOT EXISTS candidate_target_count integer NOT NULL DEFAULT 0;
ALTER TABLE mission_progress_read_model ADD COLUMN IF NOT EXISTS selected_target_count integer NOT NULL DEFAULT 0;
ALTER TABLE mission_progress_read_model ADD COLUMN IF NOT EXISTS approved_action_card_count integer NOT NULL DEFAULT 0;
ALTER TABLE action_queue_read_model ALTER COLUMN primary_contact_summary DROP NOT NULL;
ALTER TABLE action_queue_read_model ALTER COLUMN channel DROP NOT NULL;

ALTER TABLE route_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_evidence_links FORCE ROW LEVEL SECURITY;
CREATE POLICY route_evidence_links_tenant_isolation ON route_evidence_links USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE target_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE target_assessments FORCE ROW LEVEL SECURITY;
CREATE POLICY target_assessments_tenant_isolation ON target_assessments USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE target_assessment_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE target_assessment_evidence_links FORCE ROW LEVEL SECURITY;
CREATE POLICY target_assessment_evidence_links_parent_tenant ON target_assessment_evidence_links
USING (EXISTS (SELECT 1 FROM target_assessments ta WHERE ta.id = target_assessment_evidence_links.target_assessment_id AND ta.tenant_id = current_tenant_id()))
WITH CHECK (EXISTS (SELECT 1 FROM target_assessments ta WHERE ta.id = target_assessment_evidence_links.target_assessment_id AND ta.tenant_id = current_tenant_id()));

ALTER TABLE action_card_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_card_evidence_links FORCE ROW LEVEL SECURITY;
CREATE POLICY action_card_evidence_links_parent_tenant ON action_card_evidence_links
USING (EXISTS (SELECT 1 FROM action_cards ac WHERE ac.id = action_card_evidence_links.action_card_id AND ac.tenant_id = current_tenant_id()))
WITH CHECK (EXISTS (SELECT 1 FROM action_cards ac WHERE ac.id = action_card_evidence_links.action_card_id AND ac.tenant_id = current_tenant_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON route_evidence_links, target_assessments, target_assessment_evidence_links, action_card_evidence_links TO imea_api, imea_worker;
GRANT SELECT ON route_evidence_links, target_assessments, target_assessment_evidence_links, action_card_evidence_links TO imea_projector;
