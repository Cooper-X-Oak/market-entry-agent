-- Execution metadata only; legacy histories retain their original scope shape.
ALTER TABLE workflow_instances ADD COLUMN mission_execution_id uuid;
ALTER TABLE workflow_instances ADD COLUMN scope_version smallint NOT NULL DEFAULT 1 CHECK (scope_version IN (1, 2));
-- No idempotency rows are deleted or broadly rewritten. Legacy payload hashes
-- may be normalized only against their matching recorded Activity input.
