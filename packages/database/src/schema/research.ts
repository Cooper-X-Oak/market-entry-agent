import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenants, users } from './auth.js';
import { artifactVersions, missions, sourceSnapshots, sources } from './missions.js';
import { claimOriginEnum, claimStatusEnum, entityStatusEnum, entityTypeEnum, evidenceStanceEnum, marketRouteTypeEnum, relationshipStatusEnum, relationshipTypeEnum, routeStatusEnum, stakeholderRoleTypeEnum, stakeholderStatusEnum, targetStatusEnum } from './enums.js';

export const claims = pgTable('claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  subjectEntityId: uuid('subject_entity_id'),
  claimType: varchar('claim_type', { length: 80 }).notNull(),
  statement: text('statement').notNull(),
  valueJson: jsonb('value_json').notNull(),
  status: claimStatusEnum('status').notNull(),
  confidence: integer('confidence').notNull(),
  origin: claimOriginEnum('origin').notNull(),
  impactLevel: varchar('impact_level', { length: 20 }).notNull(),
  artifactVersionId: uuid('artifact_version_id').references(() => artifactVersions.id),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  createdByAgentRunId: uuid('created_by_agent_run_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('claims_mission_type_idx').on(table.missionId, table.claimType), index('claims_subject_idx').on(table.subjectEntityId), index('claims_status_idx').on(table.status)]);

export const evidenceItems = pgTable('evidence_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  sourceSnapshotId: uuid('source_snapshot_id').notNull().references(() => sourceSnapshots.id, { onDelete: 'cascade' }),
  excerpt: text('excerpt').notNull(),
  locator: jsonb('locator').notNull().$type<Record<string, unknown>>(),
  stance: evidenceStanceEnum('stance').notNull(),
  relevance: integer('relevance').notNull(),
  freshness: integer('freshness').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const claimEvidenceLinks = pgTable('claim_evidence_links', {
  claimId: uuid('claim_id').notNull().references(() => claims.id, { onDelete: 'cascade' }),
  evidenceItemId: uuid('evidence_item_id').notNull().references(() => evidenceItems.id, { onDelete: 'cascade' }),
  weight: integer('weight').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.claimId, table.evidenceItemId] })]);

export const entities = pgTable('entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  canonicalName: varchar('canonical_name', { length: 300 }).notNull(),
  entityType: entityTypeEnum('entity_type').notNull(),
  website: text('website'),
  countryCode: varchar('country_code', { length: 2 }),
  region: varchar('region', { length: 120 }),
  city: varchar('city', { length: 120 }),
  description: text('description'),
  externalIds: jsonb('external_ids').notNull().$type<Record<string, string>>().default({}),
  status: entityStatusEnum('status').notNull().default('active'),
  mergedIntoId: uuid('merged_into_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('entities_tenant_name_idx').on(table.tenantId, table.canonicalName), index('entities_website_idx').on(table.website), index('entities_country_type_idx').on(table.countryCode, table.entityType)]);

export const entityAliases = pgTable('entity_aliases', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').notNull().references(() => entities.id, { onDelete: 'cascade' }),
  alias: varchar('alias', { length: 300 }).notNull(),
  language: varchar('language', { length: 20 }),
  sourceId: uuid('source_id').references(() => sources.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('entity_aliases_entity_alias_uidx').on(table.entityId, table.alias)]);

export const marketRoutes = pgTable('market_routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  routeType: marketRouteTypeEnum('route_type').notNull(),
  title: varchar('title', { length: 240 }).notNull(),
  hypothesis: text('hypothesis').notNull(),
  applicableScenarios: jsonb('applicable_scenarios').notNull(),
  keyEntityTypes: text('key_entity_types').array().notNull(),
  keyStakeholderRoles: text('key_stakeholder_roles').array().notNull(),
  primaryChannels: text('primary_channels').array().notNull(),
  capabilityRequirements: jsonb('capability_requirements').notNull(),
  evidenceSummary: text('evidence_summary').notNull(),
  counterEvidenceSummary: text('counter_evidence_summary').notNull(),
  confidence: integer('confidence').notNull(),
  entryDifficulty: integer('entry_difficulty').notNull(),
  timeToFirstContactDays: integer('time_to_first_contact_days').notNull(),
  resourceIntensity: integer('resource_intensity').notNull(),
  rank: integer('rank').notNull(),
  status: routeStatusEnum('status').notNull().default('proposed'),
  artifactVersionId: uuid('artifact_version_id').notNull().references(() => artifactVersions.id),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('market_routes_mission_status_idx').on(table.missionId, table.status)]);

export const missionEntities = pgTable('mission_entities', {
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id').notNull().references(() => entities.id, { onDelete: 'cascade' }),
  marketRoles: text('market_roles').array().notNull(),
  relevanceScore: integer('relevance_score').notNull(),
  discoveryReason: text('discovery_reason').notNull(),
  targetStatus: targetStatusEnum('target_status').notNull().default('observed'),
  primaryRouteId: uuid('primary_route_id').references(() => marketRoutes.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.missionId, table.entityId] })]);

export const entityRelationships = pgTable('entity_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  sourceEntityId: uuid('source_entity_id').notNull().references(() => entities.id),
  targetEntityId: uuid('target_entity_id').notNull().references(() => entities.id),
  relationshipType: relationshipTypeEnum('relationship_type').notNull(),
  directionality: varchar('directionality', { length: 20 }).notNull(),
  confidence: integer('confidence').notNull(),
  claimId: uuid('claim_id').references(() => claims.id),
  attributes: jsonb('attributes').notNull().$type<Record<string, unknown>>().default({}),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  status: relationshipStatusEnum('status').notNull().default('proposed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('relationships_source_idx').on(table.missionId, table.sourceEntityId), index('relationships_target_idx').on(table.missionId, table.targetEntityId)]);

export const stakeholderRoles = pgTable('stakeholder_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').notNull().references(() => entities.id),
  personId: uuid('person_id').references(() => entities.id),
  roleType: stakeholderRoleTypeEnum('role_type').notNull(),
  title: varchar('title', { length: 240 }),
  decisionInfluence: integer('decision_influence').notNull(),
  contactPriority: integer('contact_priority').notNull(),
  relevanceReason: text('relevance_reason').notNull(),
  confidence: integer('confidence').notNull(),
  claimId: uuid('claim_id').references(() => claims.id),
  status: stakeholderStatusEnum('status').notNull().default('proposed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const competitorProfiles = pgTable('competitor_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id').notNull().references(() => entities.id),
  marketPresenceSummary: text('market_presence_summary').notNull(),
  routePatterns: jsonb('route_patterns').notNull(),
  localChannels: jsonb('local_channels').notNull(),
  exhibitions: jsonb('exhibitions').notNull(),
  publicCustomers: jsonb('public_customers').notNull(),
  certifications: jsonb('certifications').notNull(),
  serviceNetwork: jsonb('service_network').notNull(),
  marketMinimums: jsonb('market_minimums').notNull(),
  opportunityGaps: jsonb('opportunity_gaps').notNull(),
  confidence: integer('confidence').notNull(),
  artifactVersionId: uuid('artifact_version_id').notNull().references(() => artifactVersions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const industryOpinions = pgTable('industry_opinions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  personEntityId: uuid('person_entity_id').references(() => entities.id),
  organizationEntityId: uuid('organization_entity_id').references(() => entities.id),
  sourceId: uuid('source_id').notNull().references(() => sources.id),
  topic: varchar('topic', { length: 240 }).notNull(),
  positionSummary: text('position_summary').notNull(),
  marketImplication: text('market_implication').notNull(),
  credibilityScore: integer('credibility_score').notNull(),
  commercialInterest: varchar('commercial_interest', { length: 120 }),
  contactable: boolean('contactable').notNull(),
  artifactVersionId: uuid('artifact_version_id').notNull().references(() => artifactVersions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
