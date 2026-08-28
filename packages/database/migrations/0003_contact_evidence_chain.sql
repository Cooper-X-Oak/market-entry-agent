ALTER TABLE contact_verifications ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE contact_verifications ADD COLUMN IF NOT EXISTS mission_id uuid REFERENCES missions(id) ON DELETE CASCADE;
ALTER TABLE contact_verifications ADD COLUMN IF NOT EXISTS verification_status_before contact_verification_status;
ALTER TABLE contact_verifications ADD COLUMN IF NOT EXISTS verification_status_after contact_verification_status;
ALTER TABLE contact_verifications ADD COLUMN IF NOT EXISTS facts jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE contact_verifications cv
SET tenant_id = cp.tenant_id,
    mission_id = cp.mission_id,
    verification_status_before = cp.verification_status,
    verification_status_after = cp.verification_status
FROM contact_points cp
WHERE cp.id = cv.contact_point_id
  AND (cv.tenant_id IS NULL OR cv.mission_id IS NULL OR cv.verification_status_before IS NULL OR cv.verification_status_after IS NULL);

ALTER TABLE contact_verifications ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE contact_verifications ALTER COLUMN mission_id SET NOT NULL;
ALTER TABLE contact_verifications ALTER COLUMN verification_status_before SET NOT NULL;
ALTER TABLE contact_verifications ALTER COLUMN verification_status_after SET NOT NULL;

CREATE TABLE IF NOT EXISTS contact_point_evidence_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  contact_point_id uuid NOT NULL REFERENCES contact_points(id) ON DELETE CASCADE,
  evidence_item_id uuid NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  relation_type text NOT NULL CHECK (relation_type IN ('direct_listing','corroboration','employment_confirmation','ownership_confirmation','manual_confirmation')),
  source_authority text NOT NULL CHECK (source_authority IN ('official_organization','official_registry','industry_body','event_organizer','public_professional_profile','user_record','general_public_web')),
  independent_group_key text NOT NULL,
  supports_value boolean NOT NULL DEFAULT false,
  supports_role boolean NOT NULL DEFAULT false,
  supports_employment boolean NOT NULL DEFAULT false,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_point_id, evidence_item_id, relation_type)
);

CREATE TABLE IF NOT EXISTS contact_verification_evidence_links (
  contact_verification_id uuid NOT NULL REFERENCES contact_verifications(id) ON DELETE CASCADE,
  evidence_item_id uuid NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  PRIMARY KEY (contact_verification_id, evidence_item_id, purpose)
);

CREATE INDEX IF NOT EXISTS contact_point_evidence_contact_relation_idx ON contact_point_evidence_links(contact_point_id, relation_type);
CREATE INDEX IF NOT EXISTS contact_point_evidence_evidence_idx ON contact_point_evidence_links(evidence_item_id);
CREATE INDEX IF NOT EXISTS contact_verifications_tenant_mission_contact_time_idx ON contact_verifications(tenant_id, mission_id, contact_point_id, verified_at DESC);

ALTER TABLE contact_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_verifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_verifications_tenant_isolation ON contact_verifications;
CREATE POLICY contact_verifications_tenant_isolation ON contact_verifications
USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE contact_point_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_point_evidence_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_point_evidence_links_tenant_isolation ON contact_point_evidence_links;
CREATE POLICY contact_point_evidence_links_tenant_isolation ON contact_point_evidence_links
USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE contact_verification_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_verification_evidence_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_verification_evidence_links_parent_tenant ON contact_verification_evidence_links;
CREATE POLICY contact_verification_evidence_links_parent_tenant ON contact_verification_evidence_links
USING (EXISTS (
  SELECT 1 FROM contact_verifications cv
  WHERE cv.id = contact_verification_evidence_links.contact_verification_id
    AND cv.tenant_id = current_tenant_id()
)) WITH CHECK (EXISTS (
  SELECT 1 FROM contact_verifications cv
  WHERE cv.id = contact_verification_evidence_links.contact_verification_id
    AND cv.tenant_id = current_tenant_id()
));

GRANT SELECT, INSERT, UPDATE, DELETE ON contact_verifications, contact_point_evidence_links, contact_verification_evidence_links TO imea_api, imea_worker;
GRANT SELECT ON contact_verifications, contact_point_evidence_links, contact_verification_evidence_links TO imea_projector;
