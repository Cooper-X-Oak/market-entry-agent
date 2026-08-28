import type {
  ActionCardStatus,
  ContactVerificationFacts,
  ContactVerificationStatus,
  MissionStage,
  OpportunityStatus,
  OpportunityTransitionTrigger,
  TransitionOpportunityCommand,
} from '@imea/contracts';
import { StateTransitionError } from './errors.js';

type TransitionMap<T extends string> = Readonly<Record<T, readonly T[]>>;

export const missionStageTransitions: TransitionMap<MissionStage> = {
  draft: ['compiling', 'failed'],
  compiling: ['ingesting_company_data', 'failed'],
  ingesting_company_data: ['researching_routes', 'failed'],
  researching_routes: ['awaiting_route_review', 'failed'],
  awaiting_route_review: ['researching_ecosystem', 'awaiting_budget_review', 'failed'],
  researching_ecosystem: ['researching_targets', 'awaiting_budget_review', 'failed'],
  researching_targets: ['researching_contacts', 'awaiting_budget_review', 'failed'],
  researching_contacts: ['generating_actions', 'awaiting_budget_review', 'failed'],
  generating_actions: ['active', 'awaiting_budget_review', 'failed'],
  active: ['awaiting_budget_review', 'completed', 'failed'],
  awaiting_budget_review: ['compiling', 'ingesting_company_data', 'researching_routes', 'awaiting_route_review', 'researching_ecosystem', 'researching_targets', 'researching_contacts', 'generating_actions', 'active', 'failed'],
  completed: [],
  failed: ['compiling', 'ingesting_company_data', 'researching_routes', 'researching_ecosystem', 'researching_targets', 'researching_contacts', 'generating_actions', 'active'],
};

export const contactTransitions: TransitionMap<ContactVerificationStatus> = {
  discovered: ['format_valid', 'source_confirmed', 'stale', 'invalid'],
  format_valid: ['source_confirmed', 'cross_confirmed', 'stale', 'invalid'],
  source_confirmed: ['cross_confirmed', 'manually_confirmed', 'stale', 'invalid'],
  cross_confirmed: ['manually_confirmed', 'stale', 'invalid'],
  manually_confirmed: ['stale', 'invalid'],
  stale: ['format_valid', 'source_confirmed', 'cross_confirmed', 'manually_confirmed', 'invalid'],
  invalid: ['discovered'],
};

export const opportunityTransitions: TransitionMap<OpportunityStatus> = {
  observed: ['target_identified', 'archived'],
  target_identified: ['stakeholder_mapped', 'paused', 'archived', 'lost'],
  stakeholder_mapped: ['contact_path_found', 'paused', 'archived', 'lost'],
  contact_path_found: ['contact_path_verified', 'paused', 'archived', 'lost'],
  contact_path_verified: ['action_ready', 'paused', 'archived', 'lost'],
  action_ready: ['approved', 'paused', 'archived', 'lost'],
  approved: ['contacted', 'paused', 'archived', 'lost'],
  contacted: ['responded', 'paused', 'lost'],
  responded: ['qualified', 'paused', 'lost'],
  qualified: ['meeting', 'supplier_registration', 'sample', 'quotation', 'paused', 'lost'],
  meeting: ['supplier_registration', 'sample', 'quotation', 'qualified', 'paused', 'lost'],
  supplier_registration: ['sample', 'quotation', 'qualified', 'paused', 'lost'],
  sample: ['quotation', 'qualified', 'paused', 'lost'],
  quotation: ['won', 'qualified', 'paused', 'lost'],
  won: [],
  paused: ['target_identified', 'stakeholder_mapped', 'contact_path_found', 'contact_path_verified', 'action_ready', 'approved', 'contacted', 'responded', 'qualified', 'meeting', 'supplier_registration', 'sample', 'quotation', 'archived', 'lost'],
  archived: [],
  lost: [],
};

export const actionCardTransitions: TransitionMap<ActionCardStatus> = {
  draft: ['review', 'cancelled'],
  review: ['approved', 'changes_requested', 'cancelled'],
  approved: ['exported', 'executed', 'changes_requested', 'cancelled'],
  changes_requested: ['draft', 'review', 'cancelled'],
  exported: ['executed', 'cancelled'],
  executed: ['completed'],
  completed: [],
  cancelled: [],
};

const opportunityTriggerByDestination: Readonly<Partial<Record<OpportunityStatus, readonly OpportunityTransitionTrigger[]>>> = {
  target_identified: ['entity_resolved', 'resume_requested'],
  stakeholder_mapped: ['stakeholder_mapping_completed', 'resume_requested'],
  contact_path_found: ['contact_discovered', 'resume_requested'],
  contact_path_verified: ['contact_verified', 'resume_requested'],
  action_ready: ['action_card_generated', 'resume_requested'],
  approved: ['action_card_approved', 'resume_requested'],
  contacted: ['action_executed', 'resume_requested'],
  responded: ['response_recorded', 'resume_requested'],
  qualified: ['qualification_confirmed', 'resume_requested'],
  meeting: ['meeting_recorded', 'resume_requested'],
  supplier_registration: ['supplier_registration_recorded', 'resume_requested'],
  sample: ['sample_recorded', 'resume_requested'],
  quotation: ['quotation_recorded', 'resume_requested'],
  won: ['win_recorded'],
  paused: ['pause_requested'],
  archived: ['archive_requested'],
  lost: ['loss_recorded'],
};

export function assertTransition<T extends string>(aggregate: string, transitions: TransitionMap<T>, from: T, to: T): void {
  if (!transitions[from].includes(to)) {
    throw new StateTransitionError(aggregate, from, to);
  }
}

export function transitionOpportunity(command: TransitionOpportunityCommand): { from: OpportunityStatus; to: OpportunityStatus; trigger: OpportunityTransitionTrigger; evidenceRefs: string[] } {
  assertTransition('opportunity', opportunityTransitions, command.expectedFrom, command.to);
  const permittedTriggers = opportunityTriggerByDestination[command.to] ?? [];
  if (!permittedTriggers.includes(command.trigger)) {
    throw new StateTransitionError('opportunity_trigger', command.trigger, command.to);
  }
  if (!['pause_requested', 'resume_requested', 'archive_requested'].includes(command.trigger) && command.evidenceRefs.length === 0) {
    throw new StateTransitionError('opportunity_evidence', command.expectedFrom, command.to);
  }
  return { from: command.expectedFrom, to: command.to, trigger: command.trigger, evidenceRefs: command.evidenceRefs };
}

export function deriveContactVerificationStatus(
  facts: ContactVerificationFacts,
  terminalOverride?: 'stale' | 'invalid',
): ContactVerificationStatus {
  if (terminalOverride) return terminalOverride;
  if (facts.manualConfirmation) return 'manually_confirmed';
  const officialDirect = facts.exactValueListedByOfficialOrganization && Boolean(facts.exactValueLocatorEvidenceId);
  if ((officialDirect && facts.independentConfirmationGroups.length >= 1) || facts.independentConfirmationGroups.length >= 2) return 'cross_confirmed';
  if (officialDirect) return 'source_confirmed';
  if (facts.formatCheckPassed || facts.urlReachabilityPassed) return 'format_valid';
  return 'discovered';
}

export function nextActionCardVersion(input: { currentVersionNo: number; currentStatus: ActionCardStatus; feedbackRefs: string[] }): { versionNo: number; basedOnVersionNo: number; status: 'draft'; feedbackRefs: string[] } {
  if (!['review', 'changes_requested', 'approved'].includes(input.currentStatus)) {
    throw new StateTransitionError('action_card_revision', input.currentStatus, 'draft');
  }
  return { versionNo: input.currentVersionNo + 1, basedOnVersionNo: input.currentVersionNo, status: 'draft', feedbackRefs: input.feedbackRefs };
}
