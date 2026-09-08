import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenants } from './auth.js';
import { missions } from './missions.js';
import { opportunities } from './execution.js';
import { outboxStatusEnum, runStatusEnum, workflowStatusEnum } from './enums.js';

export const domainEvents = pgTable('domain_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  aggregateType: varchar('aggregate_type', { length: 80 }).notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  eventType: varchar('event_type', { length: 160 }).notNull(),
  schemaVersion: integer('schema_version').notNull().default(1),
  aggregateVersion: integer('aggregate_version').notNull(),
  payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
  actorType: varchar('actor_type', { length: 40 }).notNull(),
  actorId: varchar('actor_id', { length: 240 }),
  correlationId: uuid('correlation_id').notNull(),
  causationId: uuid('causation_id'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('domain_events_aggregate_version_uidx').on(table.tenantId, table.aggregateType, table.aggregateId, table.aggregateVersion),
  index('domain_events_tenant_time_idx').on(table.tenantId, table.occurredAt, table.id),
  index('domain_events_aggregate_idx').on(table.aggregateType, table.aggregateId),
  index('domain_events_type_idx').on(table.eventType),
]);

export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  domainEventId: uuid('domain_event_id').notNull().references(() => domainEvents.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  status: outboxStatusEnum('status').notNull().default('pending'),
  consumerName: varchar('consumer_name', { length: 120 }),
  leaseOwner: varchar('lease_owner', { length: 160 }),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('outbox_domain_event_uidx').on(table.domainEventId), index('outbox_tenant_status_next_idx').on(table.tenantId, table.status, table.nextAttemptAt)]);

export const promptVersions = pgTable('prompt_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  skillKey: varchar('skill_key', { length: 120 }).notNull(),
  version: integer('version').notNull(),
  systemTemplate: text('system_template').notNull(),
  inputSchemaVersion: integer('input_schema_version').notNull(),
  outputSchemaVersion: integer('output_schema_version').notNull(),
  modelConfig: jsonb('model_config').notNull().$type<Record<string, unknown>>(),
  active: integer('active').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('prompt_versions_skill_version_uidx').on(table.skillKey, table.version)]);

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'cascade' }),
  activityType: varchar('activity_type', { length: 120 }).notNull(),
  skillKey: varchar('skill_key', { length: 120 }).notNull(),
  status: runStatusEnum('status').notNull().default('queued'),
  modelProvider: varchar('model_provider', { length: 80 }).notNull(),
  modelName: varchar('model_name', { length: 120 }).notNull(),
  promptVersionId: uuid('prompt_version_id').notNull().references(() => promptVersions.id),
  contextVersion: integer('context_version').notNull().default(1),
  inputContextHash: varchar('input_context_hash', { length: 128 }).notNull(),
  evidenceItemIds: uuid('evidence_item_ids').array().notNull().default([]),
  inputArtifactIds: uuid('input_artifact_ids').array().notNull(),
  outputArtifactVersionIds: uuid('output_artifact_version_ids').array().notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costAmount: numeric('cost_amount'),
  executionAudit: jsonb('execution_audit').$type<Record<string, unknown>>(),
  traceId: varchar('trace_id', { length: 160 }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorCode: varchar('error_code', { length: 120 }),
  errorMessage: text('error_message'),
});

export const toolRuns = pgTable('tool_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  agentRunId: uuid('agent_run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  connectorType: varchar('connector_type', { length: 120 }).notNull(),
  operation: varchar('operation', { length: 120 }).notNull(),
  status: runStatusEnum('status').notNull().default('queued'),
  requestSummary: jsonb('request_summary').notNull().$type<Record<string, unknown>>(),
  responseSummary: jsonb('response_summary').notNull().$type<Record<string, unknown>>(),
  sourceIds: uuid('source_ids').array().notNull(),
  snapshotIds: uuid('snapshot_ids').array().notNull().default([]),
  evidenceIds: uuid('evidence_ids').array().notNull().default([]),
  durationMs: integer('duration_ms').notNull().default(0),
  costAmount: numeric('cost_amount').notNull().default('0'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
});

export const workflowInstances = pgTable('workflow_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id),
  workflowType: varchar('workflow_type', { length: 120 }).notNull(),
  workflowId: varchar('workflow_id', { length: 240 }).notNull(),
  runId: varchar('run_id', { length: 240 }).notNull(),
  status: workflowStatusEnum('status').notNull().default('running'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (table) => [uniqueIndex('workflow_instances_workflow_uidx').on(table.workflowId)]);

export const idempotencyRecords = pgTable('idempotency_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
  endpoint: varchar('endpoint', { length: 300 }).notNull(),
  requestHash: varchar('request_hash', { length: 128 }).notNull(),
  responseStatus: integer('response_status').notNull(),
  responseBody: jsonb('response_body').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('idempotency_tenant_endpoint_key_uidx').on(table.tenantId, table.endpoint, table.idempotencyKey)]);
