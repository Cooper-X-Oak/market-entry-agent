import type { ResearchDefinition } from '@imea/contracts';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar, vector } from 'drizzle-orm/pg-core';
import { tenants, users } from './auth.js';
import { artifactTypeEnum, artifactVersionStatusEnum, missionStageEnum, missionStatusEnum, sourceKindEnum, sourceStatusEnum, sourceTypeEnum } from './enums.js';

export const missions = pgTable('missions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  companyName: varchar('company_name', { length: 200 }).notNull(),
  companyWebsite: text('company_website').notNull(),
  productScope: text('product_scope').notNull(),
  researchDefinition: jsonb('research_definition').$type<ResearchDefinition>(),
  targetCountries: text('target_countries').array().notNull(),
  targetIndustries: text('target_industries').array().notNull(),
  targetProfiles: jsonb('target_profiles').notNull().$type<Array<{ type: string; description: string }>>(),
  objective: text('objective').notNull(),
  successDefinition: text('success_definition').notNull(),
  outputLanguages: text('output_languages').array().notNull(),
  budgetConfig: jsonb('budget_config').notNull().$type<Record<string, number>>(),
  executionMode: varchar('execution_mode', { length: 20 }).notNull().default('live'),
  status: missionStatusEnum('status').notNull().default('draft'),
  currentStage: missionStageEnum('current_stage').notNull().default('draft'),
  workflowId: varchar('workflow_id', { length: 240 }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [index('missions_tenant_status_idx').on(table.tenantId, table.status), index('missions_tenant_updated_idx').on(table.tenantId, table.updatedAt), uniqueIndex('missions_workflow_uidx').on(table.workflowId)]);

export const missionSources = pgTable('mission_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  sourceKind: sourceKindEnum('source_kind').notNull(),
  originalName: varchar('original_name', { length: 300 }),
  url: text('url'),
  objectKey: text('object_key'),
  mimeType: varchar('mime_type', { length: 120 }),
  contentHash: varchar('content_hash', { length: 128 }),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  sourceType: sourceTypeEnum('source_type').notNull(),
  url: text('url'),
  normalizedUrl: text('normalized_url'),
  title: text('title'),
  publisher: text('publisher'),
  language: varchar('language', { length: 20 }),
  countryCode: varchar('country_code', { length: 2 }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }).notNull().defaultNow(),
  latestSnapshotId: uuid('latest_snapshot_id'),
  metadata: jsonb('metadata').notNull().$type<Record<string, unknown>>().default({}),
  status: sourceStatusEnum('status').notNull().default('active'),
}, (table) => [uniqueIndex('sources_mission_url_uidx').on(table.tenantId, table.missionId, table.normalizedUrl)]);

export const sourceSnapshots = pgTable('source_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => sources.id, { onDelete: 'cascade' }),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  httpStatus: integer('http_status'),
  contentHash: varchar('content_hash', { length: 128 }).notNull(),
  objectKey: text('object_key').notNull(),
  extractedText: text('extracted_text'),
  extractionMetadata: jsonb('extraction_metadata').notNull().$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('source_snapshots_hash_uidx').on(table.sourceId, table.contentHash)]);

export const documentChunks = pgTable('document_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceSnapshotId: uuid('source_snapshot_id').notNull().references(() => sourceSnapshots.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  tokenCount: integer('token_count').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  metadata: jsonb('metadata').notNull().$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('document_chunks_snapshot_index_uidx').on(table.sourceSnapshotId, table.chunkIndex)]);

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id'),
  artifactType: artifactTypeEnum('artifact_type').notNull(),
  title: varchar('title', { length: 240 }).notNull(),
  currentVersionId: uuid('current_version_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const artifactVersions = pgTable('artifact_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  artifactId: uuid('artifact_id').notNull().references(() => artifacts.id, { onDelete: 'cascade' }),
  versionNo: integer('version_no').notNull(),
  status: artifactVersionStatusEnum('status').notNull().default('proposed'),
  payload: jsonb('payload').notNull(),
  evidenceRefs: uuid('evidence_refs').array().notNull().default([]),
  summary: text('summary').notNull(),
  agentRunId: uuid('agent_run_id'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
}, (table) => [uniqueIndex('artifact_versions_number_uidx').on(table.artifactId, table.versionNo)]);
