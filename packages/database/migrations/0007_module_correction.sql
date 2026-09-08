-- Additive compatibility migration. Apply ONLY to isolated acceptance DB until deployment approval.
ALTER TABLE missions ADD COLUMN research_definition jsonb;
ALTER TABLE agent_runs ADD COLUMN execution_audit jsonb;
-- NULL means unavailable, including a started request without a terminal audit record.
ALTER TABLE agent_runs ALTER COLUMN input_tokens DROP NOT NULL, ALTER COLUMN input_tokens DROP DEFAULT,
  ALTER COLUMN output_tokens DROP NOT NULL, ALTER COLUMN output_tokens DROP DEFAULT,
  ALTER COLUMN cost_amount DROP NOT NULL, ALTER COLUMN cost_amount DROP DEFAULT;
ALTER TABLE run_read_model ALTER COLUMN input_tokens DROP NOT NULL,
  ALTER COLUMN output_tokens DROP NOT NULL, ALTER COLUMN cost_amount DROP NOT NULL;
ALTER TABLE mission_dashboard_read_model ALTER COLUMN total_cost_amount DROP NOT NULL, ALTER COLUMN total_cost_amount DROP DEFAULT;
