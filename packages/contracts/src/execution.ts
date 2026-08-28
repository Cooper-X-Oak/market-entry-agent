import { z } from 'zod';
import { actorRefSchema, confidenceSchema, timestampSchema, uuidSchema } from './common.js';
import { contactVerificationStatusSchema, opportunityStatusSchema } from './enums.js';

export const opportunityTransitionTriggerSchema = z.enum([
  'entity_resolved',
  'stakeholder_mapping_completed',
  'contact_discovered',
  'contact_verified',
  'action_card_generated',
  'action_card_approved',
  'action_executed',
  'response_recorded',
  'qualification_confirmed',
  'meeting_recorded',
  'supplier_registration_recorded',
  'sample_recorded',
  'quotation_recorded',
  'win_recorded',
  'pause_requested',
  'resume_requested',
  'archive_requested',
  'loss_recorded',
]);

export const transitionOpportunityCommandSchema = z.object({
  tenantId: uuidSchema,
  missionId: uuidSchema,
  opportunityId: uuidSchema,
  expectedFrom: opportunityStatusSchema,
  to: opportunityStatusSchema,
  trigger: opportunityTransitionTriggerSchema,
  evidenceRefs: z.array(uuidSchema),
  interactionId: uuidSchema.optional(),
  actor: actorRefSchema,
  correlationId: uuidSchema,
  causationId: uuidSchema.optional(),
  note: z.string().optional(),
});

export const contactVerificationFactsSchema = z.object({
  formatCheckPassed: z.boolean(),
  mxCheckPassed: z.boolean().optional(),
  urlReachabilityPassed: z.boolean().optional(),
  exactValueListedByOfficialOrganization: z.boolean(),
  exactValueLocatorEvidenceId: uuidSchema.optional(),
  independentConfirmationGroups: z.array(z.string().min(1)),
  employmentConfirmationEvidenceIds: z.array(uuidSchema),
  manualConfirmation: z.object({
    userId: uuidSchema,
    confirmedAt: timestampSchema,
    comment: z.string().optional(),
  }).optional(),
});

export const interactionInterpretationSchema = z.object({
  interactionId: uuidSchema,
  interactionEvidenceRef: uuidSchema,
  extractedFacts: z.array(z.object({
    claimType: z.string().min(1),
    statement: z.string().min(1),
    valueJson: z.unknown(),
    status: z.enum(['observed', 'inferred', 'unknown']),
    confidence: confidenceSchema,
    evidenceRefs: z.array(uuidSchema).min(1),
  })),
  contactUpdates: z.array(z.object({
    contactPointId: uuidSchema,
    proposedStatus: contactVerificationStatusSchema.optional(),
    employmentState: z.string().optional(),
    evidenceRefs: z.array(uuidSchema),
    reason: z.string().min(1),
  })),
  routeUpdates: z.array(z.object({
    routeId: uuidSchema,
    confidenceDelta: z.number().min(-100).max(100),
    evidenceRefs: z.array(uuidSchema),
    reason: z.string().min(1),
  })),
  opportunityTransition: z.object({
    expectedFrom: opportunityStatusSchema,
    to: opportunityStatusSchema,
    trigger: opportunityTransitionTriggerSchema,
    evidenceRefs: z.array(uuidSchema),
    reason: z.string().min(1),
  }).optional(),
  scoreUpdate: z.object({
    dimensions: z.record(z.string(), confidenceSchema),
    rationale: z.record(z.string(), z.string()),
    evidenceRefs: z.array(uuidSchema),
  }).optional(),
  nextAction: z.object({
    regenerateActionCard: z.boolean(),
    objective: z.string().min(1),
    dueAt: timestampSchema.optional(),
  }),
  unresolvedQuestions: z.array(z.string()),
});

export const actionCardDecisionCommandSchema = z.object({
  decision: z.enum(['approve', 'request_changes']),
  expectedVersionNo: z.number().int().positive(),
  comment: z.string().trim().optional(),
}).superRefine((value, context) => {
  if (value.decision === 'request_changes' && !value.comment) context.addIssue({ code: 'custom', message: 'comment is required when requesting changes', path: ['comment'] });
});

export const recordInteractionCommandSchema = z.object({
  actionCardId: uuidSchema.optional(),
  interactionType: z.string().min(1),
  occurredAt: timestampSchema,
  targetContactPointId: uuidSchema.optional(),
  channel: z.string().optional(),
  summary: z.string().min(1),
  rawContent: z.string().min(1),
  outcome: z.string().min(1),
  submittedFacts: z.array(z.record(z.string(), z.unknown())).default([]),
  nextAction: z.string().optional(),
  followUpAt: timestampSchema.optional(),
});

export type OpportunityTransitionTrigger = z.infer<typeof opportunityTransitionTriggerSchema>;
export type TransitionOpportunityCommand = z.infer<typeof transitionOpportunityCommandSchema>;
export type ContactVerificationFacts = z.infer<typeof contactVerificationFactsSchema>;
export type InteractionInterpretation = z.infer<typeof interactionInterpretationSchema>;
export type ActionCardDecisionCommand = z.infer<typeof actionCardDecisionCommandSchema>;
export type RecordInteractionCommand = z.infer<typeof recordInteractionCommandSchema>;
