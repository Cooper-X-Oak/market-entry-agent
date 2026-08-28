import { z } from 'zod';

export const tenantRoleSchema = z.enum(['owner', 'editor', 'viewer']);
export const memberStatusSchema = z.enum(['active', 'invited', 'suspended']);
export const missionStatusSchema = z.enum(['draft', 'running', 'paused', 'completed', 'failed', 'archived']);
export const missionStageSchema = z.enum([
  'draft',
  'compiling',
  'ingesting_company_data',
  'researching_routes',
  'awaiting_route_review',
  'researching_ecosystem',
  'researching_targets',
  'researching_contacts',
  'generating_actions',
  'active',
  'awaiting_budget_review',
  'completed',
  'failed',
]);
export const claimStatusSchema = z.enum(['observed', 'inferred', 'user_confirmed', 'contradicted', 'unknown', 'superseded']);
export const claimOriginSchema = z.enum(['agent', 'user', 'rule', 'import', 'interaction']);
export const artifactVersionStatusSchema = z.enum(['proposed', 'accepted', 'changes_requested', 'rejected', 'superseded']);
export const entityTypeSchema = z.enum(['organization', 'person', 'project', 'exhibition', 'association', 'government_body', 'industry_event']);
export const routeTypeSchema = z.enum(['channel', 'direct_purchase', 'epc', 'tender', 'exhibition', 'association', 'expert_network', 'referral', 'hybrid']);
export const routeStatusSchema = z.enum(['proposed', 'approved', 'deprioritized', 'superseded']);
export const stakeholderRoleTypeSchema = z.enum([
  'end_user',
  'technical_influencer',
  'procurement',
  'budget_owner',
  'executive_approver',
  'channel_partner',
  'importer',
  'distributor',
  'epc_engineer',
  'tender_agent',
  'supplier_onboarding',
  'association_contact',
  'industry_expert',
  'exhibition_contact',
  'local_service_partner',
]);
export const contactTypeSchema = z.enum([
  'direct_email',
  'role_email',
  'phone',
  'contact_form',
  'social_profile',
  'procurement_portal',
  'supplier_registration',
  'exhibition_booking',
  'association_intro',
  'referral_path',
  'office_address',
]);
export const contactVerificationStatusSchema = z.enum(['discovered', 'format_valid', 'source_confirmed', 'cross_confirmed', 'manually_confirmed', 'stale', 'invalid']);
export const opportunityStatusSchema = z.enum([
  'observed',
  'target_identified',
  'stakeholder_mapped',
  'contact_path_found',
  'contact_path_verified',
  'action_ready',
  'approved',
  'contacted',
  'responded',
  'qualified',
  'meeting',
  'supplier_registration',
  'sample',
  'quotation',
  'won',
  'paused',
  'archived',
  'lost',
]);
export const actionCardStatusSchema = z.enum(['draft', 'review', 'approved', 'changes_requested', 'exported', 'executed', 'completed', 'cancelled']);
export const interactionTypeSchema = z.enum(['email_sent', 'message_sent', 'call', 'meeting', 'form_submitted', 'supplier_registration', 'exhibition_meeting', 'referral', 'response', 'qualification_update', 'sample_sent', 'quotation_sent']);
export const prioritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export const confidenceLevelSchema = z.enum(['low', 'medium', 'high']);
export const commercialValueBandSchema = z.enum(['very_low', 'low', 'medium', 'high', 'strategic']);
export const runStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);

export type TenantRole = z.infer<typeof tenantRoleSchema>;
export type MissionStatus = z.infer<typeof missionStatusSchema>;
export type MissionStage = z.infer<typeof missionStageSchema>;
export type ClaimStatus = z.infer<typeof claimStatusSchema>;
export type OpportunityStatus = z.infer<typeof opportunityStatusSchema>;
export type ContactVerificationStatus = z.infer<typeof contactVerificationStatusSchema>;
export type ActionCardStatus = z.infer<typeof actionCardStatusSchema>;
