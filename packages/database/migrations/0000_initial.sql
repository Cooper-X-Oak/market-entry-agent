CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE tenant_role AS ENUM ('owner','editor','viewer');
CREATE TYPE member_status AS ENUM ('active','invited','suspended');
CREATE TYPE mission_status AS ENUM ('draft','running','paused','completed','failed','archived');
CREATE TYPE mission_stage AS ENUM ('draft','compiling','ingesting_company_data','researching_routes','awaiting_route_review','researching_ecosystem','researching_targets','researching_contacts','generating_actions','active','awaiting_budget_review','completed','failed');
CREATE TYPE source_kind AS ENUM ('website','uploaded_file','manual_url','interaction_attachment');
CREATE TYPE source_type AS ENUM ('company_website','product_page','case_study','certification_page','contact_page','search_result','tender_notice','award_notice','registry_record','association_page','exhibition_page','social_public_page','industry_article','expert_content','interaction_record','uploaded_document');
CREATE TYPE source_status AS ENUM ('active','stale','unavailable','superseded');
CREATE TYPE claim_status AS ENUM ('observed','inferred','user_confirmed','contradicted','unknown','superseded');
CREATE TYPE claim_origin AS ENUM ('agent','user','rule','import','interaction');
CREATE TYPE evidence_stance AS ENUM ('support','oppose','context');
CREATE TYPE artifact_type AS ENUM ('mission_brief','capability_ledger','market_route_set','competitor_set','expert_signal_set','ecosystem_map','target_ranking','stakeholder_map','contact_path_set','opportunity_qualification','action_card','refresh_proposal','interaction_interpretation');
CREATE TYPE artifact_version_status AS ENUM ('proposed','accepted','changes_requested','rejected','superseded');
CREATE TYPE entity_type AS ENUM ('organization','person','project','exhibition','association','government_body','industry_event');
CREATE TYPE entity_status AS ENUM ('active','merged','archived');
CREATE TYPE relationship_type AS ENUM ('distributes','imports','purchases_from','supplies_to','designs_for','builds_for','owns','operates','employs','participates_in','member_of','certified_by','awarded_contract','competes_with','refers_to','partners_with','represents');
CREATE TYPE relationship_status AS ENUM ('proposed','confirmed','superseded');
CREATE TYPE stakeholder_role_type AS ENUM ('end_user','technical_influencer','procurement','budget_owner','executive_approver','channel_partner','importer','distributor','epc_engineer','tender_agent','supplier_onboarding','association_contact','industry_expert','exhibition_contact','local_service_partner');
CREATE TYPE stakeholder_status AS ENUM ('proposed','confirmed','stale','archived');
CREATE TYPE target_status AS ENUM ('observed','target','high_priority','archived');
CREATE TYPE contact_type AS ENUM ('direct_email','role_email','phone','contact_form','social_profile','procurement_portal','supplier_registration','exhibition_booking','association_intro','referral_path','office_address');
CREATE TYPE contact_verification_status AS ENUM ('discovered','format_valid','source_confirmed','cross_confirmed','manually_confirmed','stale','invalid');
CREATE TYPE contact_verification_method AS ENUM ('format','mx','url_access','official_source','source_cross_check','employment_check','manual','interaction');
CREATE TYPE verification_result AS ENUM ('passed','partial','failed');
CREATE TYPE market_route_type AS ENUM ('channel','direct_purchase','epc','tender','exhibition','association','expert_network','referral','hybrid');
CREATE TYPE route_status AS ENUM ('proposed','approved','deprioritized','superseded');
CREATE TYPE opportunity_status AS ENUM ('observed','target_identified','stakeholder_mapped','contact_path_found','contact_path_verified','action_ready','approved','contacted','responded','qualified','meeting','supplier_registration','sample','quotation','won','paused','archived','lost');
CREATE TYPE priority AS ENUM ('low','medium','high','critical');
CREATE TYPE action_card_status AS ENUM ('draft','review','approved','changes_requested','exported','executed','completed','cancelled');
CREATE TYPE interaction_type AS ENUM ('email_sent','message_sent','call','meeting','form_submitted','supplier_registration','exhibition_meeting','referral','response','qualification_update','sample_sent','quotation_sent');
CREATE TYPE approval_type AS ENUM ('mission_brief','market_route','action_card','refresh_proposal','budget_review');
CREATE TYPE approval_status AS ENUM ('pending','approved','changes_requested','rejected');
CREATE TYPE run_status AS ENUM ('queued','running','succeeded','failed','cancelled');
CREATE TYPE workflow_status AS ENUM ('running','paused','completed','failed','terminated');
CREATE TYPE outbox_status AS ENUM ('pending','processing','published','failed');
CREATE TYPE confidence_level AS ENUM ('low','medium','high');
CREATE TYPE commercial_value_band AS ENUM ('very_low','low','medium','high','strategic');

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  slug varchar(80) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  display_name varchar(120) NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE tenant_members (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role tenant_role NOT NULL,
  status member_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,user_id)
);

CREATE TABLE missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL, company_name varchar(200) NOT NULL, company_website text NOT NULL, product_scope text NOT NULL,
  target_countries text[] NOT NULL, target_industries text[] NOT NULL, target_profiles jsonb NOT NULL,
  objective text NOT NULL, success_definition text NOT NULL, output_languages text[] NOT NULL, budget_config jsonb NOT NULL,
  status mission_status NOT NULL DEFAULT 'draft', current_stage mission_stage NOT NULL DEFAULT 'draft', workflow_id varchar(240) UNIQUE,
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX missions_tenant_status_idx ON missions(tenant_id,status);
CREATE INDEX missions_tenant_updated_idx ON missions(tenant_id,updated_at DESC);
CREATE INDEX missions_target_countries_idx ON missions USING gin(target_countries);
CREATE INDEX missions_target_industries_idx ON missions USING gin(target_industries);

CREATE TABLE mission_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, source_kind source_kind NOT NULL,
  original_name varchar(300), url text, object_key text, mime_type varchar(120), content_hash varchar(128), uploaded_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, source_type source_type NOT NULL, url text, normalized_url text,
  title text, publisher text, language varchar(20), country_code varchar(2), published_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(), last_fetched_at timestamptz NOT NULL DEFAULT now(), latest_snapshot_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}', status source_status NOT NULL DEFAULT 'active', UNIQUE(tenant_id,mission_id,normalized_url)
);

CREATE TABLE source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  fetched_at timestamptz NOT NULL DEFAULT now(), http_status integer, content_hash varchar(128) NOT NULL, object_key text NOT NULL,
  extracted_text text, extraction_metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_id,content_hash)
);
ALTER TABLE sources ADD CONSTRAINT sources_latest_snapshot_fk FOREIGN KEY(latest_snapshot_id) REFERENCES source_snapshots(id);

CREATE TABLE document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_snapshot_id uuid NOT NULL REFERENCES source_snapshots(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL, content text NOT NULL, token_count integer NOT NULL, embedding vector(1536), metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_snapshot_id,chunk_index)
);

CREATE TABLE artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, opportunity_id uuid, artifact_type artifact_type NOT NULL,
  title varchar(240) NOT NULL, current_version_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), skill_key varchar(120) NOT NULL, version integer NOT NULL,
  system_template text NOT NULL, input_schema_version integer NOT NULL, output_schema_version integer NOT NULL,
  model_config jsonb NOT NULL, active integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(skill_key,version)
);

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, opportunity_id uuid,
  activity_type varchar(120) NOT NULL, skill_key varchar(120) NOT NULL, status run_status NOT NULL DEFAULT 'queued',
  model_provider varchar(80) NOT NULL, model_name varchar(120) NOT NULL, prompt_version_id uuid NOT NULL REFERENCES prompt_versions(id),
  input_artifact_ids uuid[] NOT NULL DEFAULT '{}', output_artifact_version_ids uuid[] NOT NULL DEFAULT '{}', input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0, cost_amount numeric NOT NULL DEFAULT 0, trace_id varchar(160),
  started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, error_code varchar(120), error_message text
);

CREATE TABLE artifact_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  version_no integer NOT NULL, status artifact_version_status NOT NULL DEFAULT 'proposed', payload jsonb NOT NULL, summary text NOT NULL,
  agent_run_id uuid REFERENCES agent_runs(id), created_by_user_id uuid REFERENCES users(id), accepted_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), accepted_at timestamptz, UNIQUE(artifact_id,version_no)
);
ALTER TABLE artifacts ADD CONSTRAINT artifacts_current_version_fk FOREIGN KEY(current_version_id) REFERENCES artifact_versions(id);

CREATE TABLE entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  canonical_name varchar(300) NOT NULL, entity_type entity_type NOT NULL, website text, country_code varchar(2), region varchar(120), city varchar(120),
  description text, external_ids jsonb NOT NULL DEFAULT '{}', status entity_status NOT NULL DEFAULT 'active', merged_into_id uuid REFERENCES entities(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entities_tenant_name_idx ON entities(tenant_id,canonical_name);
CREATE INDEX entities_website_idx ON entities(website);
CREATE INDEX entities_country_type_idx ON entities(country_code,entity_type);

CREATE TABLE entity_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias varchar(300) NOT NULL, language varchar(20), source_id uuid REFERENCES sources(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(entity_id,alias)
);

CREATE TABLE claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, subject_entity_id uuid REFERENCES entities(id), claim_type varchar(80) NOT NULL,
  statement text NOT NULL, value_json jsonb NOT NULL, status claim_status NOT NULL, confidence integer NOT NULL CHECK(confidence BETWEEN 0 AND 100),
  origin claim_origin NOT NULL, impact_level varchar(20) NOT NULL, artifact_version_id uuid REFERENCES artifact_versions(id),
  valid_from timestamptz, valid_until timestamptz, created_by_user_id uuid REFERENCES users(id), created_by_agent_run_id uuid REFERENCES agent_runs(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX claims_mission_type_idx ON claims(mission_id,claim_type);
CREATE INDEX claims_subject_idx ON claims(subject_entity_id);
CREATE INDEX claims_status_idx ON claims(status);

CREATE TABLE evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, source_snapshot_id uuid NOT NULL REFERENCES source_snapshots(id) ON DELETE CASCADE,
  excerpt text NOT NULL, locator jsonb NOT NULL, stance evidence_stance NOT NULL, relevance integer NOT NULL CHECK(relevance BETWEEN 0 AND 100),
  freshness integer NOT NULL CHECK(freshness BETWEEN 0 AND 100), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE claim_evidence_links (
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE, evidence_item_id uuid NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  weight integer NOT NULL CHECK(weight BETWEEN 0 AND 100), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(claim_id,evidence_item_id)
);

CREATE TABLE market_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, route_type market_route_type NOT NULL, title varchar(240) NOT NULL,
  hypothesis text NOT NULL, applicable_scenarios jsonb NOT NULL, key_entity_types text[] NOT NULL, key_stakeholder_roles text[] NOT NULL,
  primary_channels text[] NOT NULL, capability_requirements jsonb NOT NULL, evidence_summary text NOT NULL, counter_evidence_summary text NOT NULL,
  confidence integer NOT NULL CHECK(confidence BETWEEN 0 AND 100), entry_difficulty integer NOT NULL CHECK(entry_difficulty BETWEEN 0 AND 100),
  time_to_first_contact_days integer NOT NULL, resource_intensity integer NOT NULL CHECK(resource_intensity BETWEEN 0 AND 100), rank integer NOT NULL,
  status route_status NOT NULL DEFAULT 'proposed', artifact_version_id uuid NOT NULL REFERENCES artifact_versions(id), decided_by_user_id uuid REFERENCES users(id),
  decided_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mission_entities (
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  market_roles text[] NOT NULL, relevance_score integer NOT NULL CHECK(relevance_score BETWEEN 0 AND 100), discovery_reason text NOT NULL,
  target_status target_status NOT NULL DEFAULT 'observed', primary_route_id uuid REFERENCES market_routes(id), created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(mission_id,entity_id)
);

CREATE TABLE entity_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, source_entity_id uuid NOT NULL REFERENCES entities(id), target_entity_id uuid NOT NULL REFERENCES entities(id),
  relationship_type relationship_type NOT NULL, directionality varchar(20) NOT NULL, confidence integer NOT NULL CHECK(confidence BETWEEN 0 AND 100),
  claim_id uuid REFERENCES claims(id), attributes jsonb NOT NULL DEFAULT '{}', valid_from timestamptz, valid_until timestamptz,
  status relationship_status NOT NULL DEFAULT 'proposed', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stakeholder_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, organization_id uuid NOT NULL REFERENCES entities(id), person_id uuid REFERENCES entities(id),
  role_type stakeholder_role_type NOT NULL, title varchar(240), decision_influence integer NOT NULL CHECK(decision_influence BETWEEN 0 AND 100),
  contact_priority integer NOT NULL CHECK(contact_priority BETWEEN 1 AND 10), relevance_reason text NOT NULL, confidence integer NOT NULL CHECK(confidence BETWEEN 0 AND 100),
  claim_id uuid REFERENCES claims(id), status stakeholder_status NOT NULL DEFAULT 'proposed', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE competitor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, entity_id uuid NOT NULL REFERENCES entities(id), market_presence_summary text NOT NULL,
  route_patterns jsonb NOT NULL, local_channels jsonb NOT NULL, exhibitions jsonb NOT NULL, public_customers jsonb NOT NULL, certifications jsonb NOT NULL,
  service_network jsonb NOT NULL, market_minimums jsonb NOT NULL, opportunity_gaps jsonb NOT NULL, confidence integer NOT NULL CHECK(confidence BETWEEN 0 AND 100),
  artifact_version_id uuid NOT NULL REFERENCES artifact_versions(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE industry_opinions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, person_entity_id uuid REFERENCES entities(id), organization_entity_id uuid REFERENCES entities(id),
  source_id uuid NOT NULL REFERENCES sources(id), topic varchar(240) NOT NULL, position_summary text NOT NULL, market_implication text NOT NULL,
  credibility_score integer NOT NULL CHECK(credibility_score BETWEEN 0 AND 100), commercial_interest varchar(120), contactable boolean NOT NULL,
  artifact_version_id uuid NOT NULL REFERENCES artifact_versions(id), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contact_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, organization_id uuid NOT NULL REFERENCES entities(id), person_id uuid REFERENCES entities(id),
  stakeholder_role_id uuid REFERENCES stakeholder_roles(id), contact_type contact_type NOT NULL, value text NOT NULL, normalized_value text NOT NULL,
  label varchar(240), is_public boolean NOT NULL, source_id uuid NOT NULL REFERENCES sources(id), source_locator jsonb NOT NULL,
  verification_status contact_verification_status NOT NULL DEFAULT 'discovered', confidence integer NOT NULL CHECK(confidence BETWEEN 0 AND 100),
  first_seen_at timestamptz NOT NULL DEFAULT now(), last_verified_at timestamptz, preferred_rank integer, language varchar(20), timezone varchar(80),
  metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mission_id,contact_type,normalized_value)
);

CREATE TABLE contact_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_point_id uuid NOT NULL REFERENCES contact_points(id) ON DELETE CASCADE,
  method contact_verification_method NOT NULL, result verification_result NOT NULL, score integer NOT NULL CHECK(score BETWEEN 0 AND 100),
  details jsonb NOT NULL DEFAULT '{}', agent_run_id uuid REFERENCES agent_runs(id), verified_by_user_id uuid REFERENCES users(id), verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, organization_id uuid NOT NULL REFERENCES entities(id), route_id uuid NOT NULL REFERENCES market_routes(id),
  title varchar(240) NOT NULL, hypothesis text NOT NULL, status opportunity_status NOT NULL DEFAULT 'observed', priority priority NOT NULL DEFAULT 'medium',
  score integer NOT NULL DEFAULT 0 CHECK(score BETWEEN 0 AND 100), evidence_confidence confidence_level NOT NULL DEFAULT 'low',
  commercial_value_band commercial_value_band NOT NULL DEFAULT 'medium', estimated_sales_hours numeric NOT NULL DEFAULT 0,
  estimated_technical_hours numeric NOT NULL DEFAULT 0, estimated_market_cost_points numeric NOT NULL DEFAULT 0, resource_efficiency numeric NOT NULL DEFAULT 0,
  next_action text NOT NULL, owner_id uuid REFERENCES users(id), workflow_id varchar(240) UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE artifacts ADD CONSTRAINT artifacts_opportunity_fk FOREIGN KEY(opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_opportunity_fk FOREIGN KEY(opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE;

CREATE TABLE opportunity_stakeholders (
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE, stakeholder_role_id uuid NOT NULL REFERENCES stakeholder_roles(id) ON DELETE CASCADE,
  role_in_opportunity varchar(120) NOT NULL, rank integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(opportunity_id,stakeholder_role_id)
);

CREATE TABLE opportunity_contacts (
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE, contact_point_id uuid NOT NULL REFERENCES contact_points(id) ON DELETE CASCADE,
  usage_type varchar(40) NOT NULL, rank integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(opportunity_id,contact_point_id)
);

CREATE TABLE opportunity_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE, version_no integer NOT NULL,
  product_fit integer NOT NULL CHECK(product_fit BETWEEN 0 AND 100), route_fit integer NOT NULL CHECK(route_fit BETWEEN 0 AND 100),
  demand_signal integer NOT NULL CHECK(demand_signal BETWEEN 0 AND 100), timing_signal integer NOT NULL CHECK(timing_signal BETWEEN 0 AND 100),
  stakeholder_relevance integer NOT NULL CHECK(stakeholder_relevance BETWEEN 0 AND 100), contactability integer NOT NULL CHECK(contactability BETWEEN 0 AND 100),
  evidence_quality integer NOT NULL CHECK(evidence_quality BETWEEN 0 AND 100), strategic_value integer NOT NULL CHECK(strategic_value BETWEEN 0 AND 100),
  base_score numeric NOT NULL, final_score integer NOT NULL CHECK(final_score BETWEEN 0 AND 100), rationale jsonb NOT NULL,
  generated_by varchar(40) NOT NULL, agent_run_id uuid REFERENCES agent_runs(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(opportunity_id,version_no)
);

CREATE TABLE action_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE, version_no integer NOT NULL, status action_card_status NOT NULL DEFAULT 'draft',
  target_stakeholder_role_id uuid NOT NULL REFERENCES stakeholder_roles(id), primary_contact_point_id uuid NOT NULL REFERENCES contact_points(id),
  backup_contact_point_id uuid REFERENCES contact_points(id), channel contact_type NOT NULL, objective text NOT NULL, contact_reason text NOT NULL,
  timing_reason text NOT NULL, stakeholder_interest text NOT NULL, value_hypothesis text NOT NULL, email_subject text, email_body text,
  social_message text, call_opening text, contact_form_message text, attachments_required jsonb NOT NULL, follow_up_plan jsonb NOT NULL,
  success_signals jsonb NOT NULL, completion_signals jsonb NOT NULL, owner_id uuid REFERENCES users(id), due_at timestamptz,
  approved_by uuid REFERENCES users(id), approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(opportunity_id,version_no)
);

CREATE TABLE interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  action_card_id uuid REFERENCES action_cards(id), interaction_type interaction_type NOT NULL, occurred_at timestamptz NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id), target_contact_point_id uuid REFERENCES contact_points(id), channel varchar(80), summary text NOT NULL,
  raw_content_object_key text, outcome varchar(120) NOT NULL, new_facts jsonb NOT NULL DEFAULT '[]', next_action text, follow_up_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, opportunity_id uuid REFERENCES opportunities(id), artifact_version_id uuid REFERENCES artifact_versions(id),
  action_card_id uuid REFERENCES action_cards(id), approval_type approval_type NOT NULL, status approval_status NOT NULL DEFAULT 'pending',
  requested_by uuid REFERENCES users(id), requested_at timestamptz NOT NULL DEFAULT now(), decided_by uuid REFERENCES users(id), decided_at timestamptz, comment text
);

CREATE TABLE domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  aggregate_type varchar(80) NOT NULL, aggregate_id uuid NOT NULL, event_type varchar(160) NOT NULL, event_version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL, actor_type varchar(40) NOT NULL, actor_id varchar(240), correlation_id uuid NOT NULL, causation_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX domain_events_tenant_time_idx ON domain_events(tenant_id,occurred_at DESC);
CREATE INDEX domain_events_aggregate_idx ON domain_events(aggregate_type,aggregate_id);
CREATE INDEX domain_events_type_idx ON domain_events(event_type);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), domain_event_id uuid NOT NULL UNIQUE REFERENCES domain_events(id) ON DELETE CASCADE,
  status outbox_status NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tool_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  connector_type varchar(120) NOT NULL, operation varchar(120) NOT NULL, status run_status NOT NULL DEFAULT 'queued', request_summary jsonb NOT NULL,
  response_summary jsonb NOT NULL, source_ids uuid[] NOT NULL DEFAULT '{}', duration_ms integer NOT NULL DEFAULT 0, cost_amount numeric NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, error_message text
);

CREATE TABLE workflow_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, opportunity_id uuid REFERENCES opportunities(id), workflow_type varchar(120) NOT NULL,
  workflow_id varchar(240) NOT NULL UNIQUE, run_id varchar(240) NOT NULL, status workflow_status NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz
);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  idempotency_key varchar(200) NOT NULL, endpoint varchar(300) NOT NULL, request_hash varchar(128) NOT NULL,
  response_status integer NOT NULL, response_body jsonb NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,endpoint,idempotency_key)
);

CREATE TABLE mission_dashboard_read_model (
  mission_id uuid PRIMARY KEY REFERENCES missions(id) ON DELETE CASCADE, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_name varchar(200) NOT NULL, company_name varchar(200) NOT NULL, target_countries text[] NOT NULL, status varchar(40) NOT NULL,
  current_stage varchar(80) NOT NULL, approved_route_count integer NOT NULL DEFAULT 0, target_count integer NOT NULL DEFAULT 0,
  verified_contact_count integer NOT NULL DEFAULT 0, action_card_count integer NOT NULL DEFAULT 0, pending_approval_count integer NOT NULL DEFAULT 0,
  high_priority_opportunity_count integer NOT NULL DEFAULT 0, weekly_interaction_count integer NOT NULL DEFAULT 0,
  total_cost_amount numeric NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mission_progress_read_model (
  mission_id uuid PRIMARY KEY REFERENCES missions(id) ON DELETE CASCADE, stage varchar(80) NOT NULL, stage_progress integer NOT NULL,
  completed_steps jsonb NOT NULL DEFAULT '[]', running_steps jsonb NOT NULL DEFAULT '[]', pending_steps jsonb NOT NULL DEFAULT '[]', failed_steps jsonb NOT NULL DEFAULT '[]',
  active_child_workflows integer NOT NULL DEFAULT 0, budget_usage jsonb NOT NULL DEFAULT '{}', pending_user_actions jsonb NOT NULL DEFAULT '[]', updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE target_list_read_model (
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, entity_id uuid NOT NULL, organization_name varchar(300) NOT NULL,
  website text, country_code varchar(2), market_roles text[] NOT NULL, primary_route_title varchar(240), product_fit integer NOT NULL,
  demand_signal integer NOT NULL, contactability integer NOT NULL, evidence_quality integer NOT NULL, final_score integer NOT NULL,
  target_status varchar(40) NOT NULL, opportunity_id uuid, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(mission_id,entity_id)
);

CREATE TABLE contact_path_read_model (
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, contact_point_id uuid NOT NULL, organization_id uuid NOT NULL,
  organization_name varchar(300) NOT NULL, stakeholder_role_id uuid, stakeholder_role_type varchar(80), person_name varchar(300), person_title varchar(240),
  contact_type varchar(80) NOT NULL, value text NOT NULL, source_title text, source_url text, verification_status varchar(80) NOT NULL,
  verification_score integer NOT NULL, last_verified_at timestamptz, preferred_rank integer, usage_status varchar(40), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mission_id,contact_point_id)
);

CREATE TABLE opportunity_board_read_model (
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, opportunity_id uuid NOT NULL, organization_name varchar(300) NOT NULL,
  route_title varchar(240) NOT NULL, status varchar(60) NOT NULL, priority varchar(20) NOT NULL, score integer NOT NULL,
  commercial_value_band varchar(40) NOT NULL, resource_efficiency numeric NOT NULL, primary_contact_summary text, next_action text NOT NULL,
  owner_name varchar(120), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(mission_id,opportunity_id)
);

CREATE TABLE action_queue_read_model (
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, action_card_id uuid NOT NULL, opportunity_id uuid NOT NULL,
  organization_name varchar(300) NOT NULL, stakeholder_summary text NOT NULL, primary_contact_summary text NOT NULL, status varchar(40) NOT NULL,
  channel varchar(80) NOT NULL, objective text NOT NULL, owner_name varchar(120), due_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mission_id,action_card_id)
);

CREATE TABLE timeline_read_model (
  event_id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  event_type varchar(160) NOT NULL, actor_type varchar(40) NOT NULL, actor_display_name varchar(120), aggregate_type varchar(80) NOT NULL,
  aggregate_id uuid NOT NULL, title varchar(240) NOT NULL, summary text NOT NULL, evidence_refs uuid[] NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL
);

CREATE TABLE run_read_model (
  run_id uuid PRIMARY KEY, mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE, run_type varchar(80) NOT NULL,
  skill_key varchar(120) NOT NULL, status varchar(40) NOT NULL, model_name varchar(120) NOT NULL, input_tokens integer NOT NULL,
  output_tokens integer NOT NULL, cost_amount numeric NOT NULL, duration_ms integer, trace_id varchar(160), started_at timestamptz NOT NULL,
  completed_at timestamptz, error_message text
);
