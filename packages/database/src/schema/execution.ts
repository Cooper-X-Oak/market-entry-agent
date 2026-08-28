import { boolean, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenants, users } from './auth.js';
import { actionCardStatusEnum, approvalStatusEnum, approvalTypeEnum, commercialValueBandEnum, confidenceLevelEnum, contactTypeEnum, contactVerificationMethodEnum, contactVerificationStatusEnum, interactionTypeEnum, opportunityStatusEnum, priorityEnum, verificationResultEnum } from './enums.js';
import { artifactVersions, missions, sources } from './missions.js';
import { claims, entities, evidenceItems, marketRoutes, stakeholderRoles } from './research.js';

export const contactPoints = pgTable('contact_points', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').notNull().references(() => entities.id),
  personId: uuid('person_id').references(() => entities.id),
  stakeholderRoleId: uuid('stakeholder_role_id').references(() => stakeholderRoles.id),
  contactType: contactTypeEnum('contact_type').notNull(),
  value: text('value').notNull(),
  normalizedValue: text('normalized_value').notNull(),
  label: varchar('label', { length: 240 }),
  isPublic: boolean('is_public').notNull(),
  sourceId: uuid('source_id').notNull().references(() => sources.id),
  sourceLocator: jsonb('source_locator').notNull().$type<Record<string, unknown>>(),
  verificationStatus: contactVerificationStatusEnum('verification_status').notNull().default('discovered'),
  confidence: integer('confidence').notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  preferredRank: integer('preferred_rank'),
  language: varchar('language', { length: 20 }),
  timezone: varchar('timezone', { length: 80 }),
  metadata: jsonb('metadata').notNull().$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('contact_points_normalized_uidx').on(table.missionId, table.contactType, table.normalizedValue), index('contact_points_org_idx').on(table.organizationId)]);

export const contactVerifications = pgTable('contact_verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  contactPointId: uuid('contact_point_id').notNull().references(() => contactPoints.id, { onDelete: 'cascade' }),
  method: contactVerificationMethodEnum('method').notNull(),
  result: verificationResultEnum('result').notNull(),
  score: integer('score').notNull(),
  details: jsonb('details').notNull().$type<Record<string, unknown>>().default({}),
  verificationStatusBefore: contactVerificationStatusEnum('verification_status_before').notNull(),
  verificationStatusAfter: contactVerificationStatusEnum('verification_status_after').notNull(),
  facts: jsonb('facts').notNull().$type<Record<string, unknown>>().default({}),
  agentRunId: uuid('agent_run_id'),
  verifiedByUserId: uuid('verified_by_user_id').references(() => users.id),
  verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('contact_verifications_tenant_mission_contact_time_idx').on(table.tenantId, table.missionId, table.contactPointId, table.verifiedAt)]);

export const contactPointEvidenceLinks = pgTable('contact_point_evidence_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  contactPointId: uuid('contact_point_id').notNull().references(() => contactPoints.id, { onDelete: 'cascade' }),
  evidenceItemId: uuid('evidence_item_id').notNull().references(() => evidenceItems.id, { onDelete: 'cascade' }),
  relationType: varchar('relation_type', { length: 80 }).notNull(),
  sourceAuthority: varchar('source_authority', { length: 80 }).notNull(),
  independentGroupKey: varchar('independent_group_key', { length: 240 }).notNull(),
  supportsValue: boolean('supports_value').notNull().default(false),
  supportsRole: boolean('supports_role').notNull().default(false),
  supportsEmployment: boolean('supports_employment').notNull().default(false),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('contact_point_evidence_relation_uidx').on(table.contactPointId, table.evidenceItemId, table.relationType),
  index('contact_point_evidence_contact_relation_idx').on(table.contactPointId, table.relationType),
  index('contact_point_evidence_evidence_idx').on(table.evidenceItemId),
]);

export const contactVerificationEvidenceLinks = pgTable('contact_verification_evidence_links', {
  contactVerificationId: uuid('contact_verification_id').notNull().references(() => contactVerifications.id, { onDelete: 'cascade' }),
  evidenceItemId: uuid('evidence_item_id').notNull().references(() => evidenceItems.id, { onDelete: 'cascade' }),
  purpose: varchar('purpose', { length: 80 }).notNull(),
}, (table) => [primaryKey({ columns: [table.contactVerificationId, table.evidenceItemId, table.purpose] })]);

export const opportunities = pgTable('opportunities', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').notNull().references(() => entities.id),
  routeId: uuid('route_id').notNull().references(() => marketRoutes.id),
  title: varchar('title', { length: 240 }).notNull(),
  hypothesis: text('hypothesis').notNull(),
  status: opportunityStatusEnum('status').notNull().default('observed'),
  priority: priorityEnum('priority').notNull().default('medium'),
  score: integer('score').notNull().default(0),
  evidenceConfidence: confidenceLevelEnum('evidence_confidence').notNull().default('low'),
  commercialValueBand: commercialValueBandEnum('commercial_value_band').notNull().default('medium'),
  estimatedSalesHours: numeric('estimated_sales_hours').notNull().default('0'),
  estimatedTechnicalHours: numeric('estimated_technical_hours').notNull().default('0'),
  estimatedMarketCostPoints: numeric('estimated_market_cost_points').notNull().default('0'),
  resourceEfficiency: numeric('resource_efficiency').notNull().default('0'),
  nextAction: text('next_action').notNull(),
  ownerId: uuid('owner_id').references(() => users.id),
  workflowId: varchar('workflow_id', { length: 240 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('opportunities_mission_status_idx').on(table.missionId, table.status), index('opportunities_mission_score_idx').on(table.missionId, table.score), index('opportunities_organization_idx').on(table.organizationId), uniqueIndex('opportunities_workflow_uidx').on(table.workflowId)]);

export const opportunityStakeholders = pgTable('opportunity_stakeholders', {
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
  stakeholderRoleId: uuid('stakeholder_role_id').notNull().references(() => stakeholderRoles.id, { onDelete: 'cascade' }),
  roleInOpportunity: varchar('role_in_opportunity', { length: 120 }).notNull(),
  rank: integer('rank').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.opportunityId, table.stakeholderRoleId] })]);

export const opportunityContacts = pgTable('opportunity_contacts', {
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
  contactPointId: uuid('contact_point_id').notNull().references(() => contactPoints.id, { onDelete: 'cascade' }),
  usageType: varchar('usage_type', { length: 40 }).notNull(),
  rank: integer('rank').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.opportunityId, table.contactPointId] })]);

export const opportunityScores = pgTable('opportunity_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
  versionNo: integer('version_no').notNull(),
  productFit: integer('product_fit').notNull(),
  routeFit: integer('route_fit').notNull(),
  demandSignal: integer('demand_signal').notNull(),
  timingSignal: integer('timing_signal').notNull(),
  stakeholderRelevance: integer('stakeholder_relevance').notNull(),
  contactability: integer('contactability').notNull(),
  evidenceQuality: integer('evidence_quality').notNull(),
  strategicValue: integer('strategic_value').notNull(),
  baseScore: numeric('base_score').notNull(),
  finalScore: integer('final_score').notNull(),
  rationale: jsonb('rationale').notNull().$type<Record<string, string>>(),
  generatedBy: varchar('generated_by', { length: 40 }).notNull(),
  agentRunId: uuid('agent_run_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('opportunity_scores_version_uidx').on(table.opportunityId, table.versionNo)]);

export const actionCards = pgTable('action_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
  versionNo: integer('version_no').notNull(),
  basedOnVersionNo: integer('based_on_version_no'),
  feedbackRefs: uuid('feedback_refs').array().notNull().default([]),
  status: actionCardStatusEnum('status').notNull().default('draft'),
  targetStakeholderRoleId: uuid('target_stakeholder_role_id').notNull().references(() => stakeholderRoles.id),
  primaryContactPointId: uuid('primary_contact_point_id').notNull().references(() => contactPoints.id),
  backupContactPointId: uuid('backup_contact_point_id').references(() => contactPoints.id),
  channel: contactTypeEnum('channel').notNull(),
  objective: text('objective').notNull(),
  contactReason: text('contact_reason').notNull(),
  timingReason: text('timing_reason').notNull(),
  stakeholderInterest: text('stakeholder_interest').notNull(),
  valueHypothesis: text('value_hypothesis').notNull(),
  emailSubject: text('email_subject'),
  emailBody: text('email_body'),
  socialMessage: text('social_message'),
  callOpening: text('call_opening'),
  contactFormMessage: text('contact_form_message'),
  attachmentsRequired: jsonb('attachments_required').notNull().$type<string[]>(),
  followUpPlan: jsonb('follow_up_plan').notNull().$type<Array<Record<string, unknown>>>(),
  successSignals: jsonb('success_signals').notNull().$type<string[]>(),
  completionSignals: jsonb('completion_signals').notNull().$type<string[]>(),
  ownerId: uuid('owner_id').references(() => users.id),
  dueAt: timestamp('due_at', { withTimezone: true }),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('action_cards_version_uidx').on(table.opportunityId, table.versionNo)]);

export const interactions = pgTable('interactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
  actionCardId: uuid('action_card_id').references(() => actionCards.id),
  interactionType: interactionTypeEnum('interaction_type').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  actorUserId: uuid('actor_user_id').notNull().references(() => users.id),
  targetContactPointId: uuid('target_contact_point_id').references(() => contactPoints.id),
  channel: varchar('channel', { length: 80 }),
  summary: text('summary').notNull(),
  rawContent: text('raw_content'),
  rawContentHash: varchar('raw_content_hash', { length: 128 }),
  rawContentObjectKey: text('raw_content_object_key'),
  outcome: varchar('outcome', { length: 120 }).notNull(),
  newFacts: jsonb('new_facts').notNull().$type<Array<Record<string, unknown>>>().default([]),
  nextAction: text('next_action'),
  followUpAt: timestamp('follow_up_at', { withTimezone: true }),
  interpretationStatus: varchar('interpretation_status', { length: 40 }).notNull().default('pending'),
  interpretedAt: timestamp('interpreted_at', { withTimezone: true }),
  interpreterAgentRunId: uuid('interpreter_agent_run_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('interactions_tenant_mission_opportunity_time_idx').on(table.tenantId, table.missionId, table.opportunityId, table.occurredAt)]);

export const interactionClaimLinks = pgTable('interaction_claim_links', {
  interactionId: uuid('interaction_id').notNull().references(() => interactions.id, { onDelete: 'cascade' }),
  claimId: uuid('claim_id').notNull().references(() => claims.id, { onDelete: 'cascade' }),
  changeType: varchar('change_type', { length: 80 }).notNull(),
}, (table) => [primaryKey({ columns: [table.interactionId, table.claimId] })]);

export const interactionEvidenceLinks = pgTable('interaction_evidence_links', {
  interactionId: uuid('interaction_id').notNull().references(() => interactions.id, { onDelete: 'cascade' }),
  evidenceItemId: uuid('evidence_item_id').notNull().references(() => evidenceItems.id, { onDelete: 'cascade' }),
}, (table) => [primaryKey({ columns: [table.interactionId, table.evidenceItemId] })]);

export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id),
  artifactVersionId: uuid('artifact_version_id').references(() => artifactVersions.id),
  actionCardId: uuid('action_card_id').references(() => actionCards.id),
  approvalType: approvalTypeEnum('approval_type').notNull(),
  status: approvalStatusEnum('status').notNull().default('pending'),
  requestedBy: uuid('requested_by').references(() => users.id),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  comment: text('comment'),
});

export const refreshProposals = pgTable('refresh_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  artifactVersionId: uuid('artifact_version_id').notNull().references(() => artifactVersions.id, { onDelete: 'cascade' }),
  triggerType: varchar('trigger_type', { length: 40 }).notNull(),
  status: varchar('status', { length: 40 }).notNull().default('proposed'),
  changedSourceCount: integer('changed_source_count').notNull().default(0),
  reverifiedContactCount: integer('reverified_contact_count').notNull().default(0),
  changedCompetitorCount: integer('changed_competitor_count').notNull().default(0),
  affectedOpportunityIds: uuid('affected_opportunity_ids').array().notNull().default([]),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  acceptedBy: uuid('accepted_by').references(() => users.id),
}, (table) => [index('refresh_proposals_tenant_mission_status_idx').on(table.tenantId, table.missionId, table.status)]);
