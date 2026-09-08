import { z } from 'zod';
import { confidenceSchema, timestampSchema, uuidSchema } from './common.js';
import { commercialValueBandSchema, confidenceLevelSchema, missionStageSchema, opportunityStatusSchema, prioritySchema } from './enums.js';
import { budgetConfigSchema } from './mission.js';
import { researchDefinitionSchema } from './research-definition.js';

export const marketRouteContextSchema = z.object({
  id: uuidSchema,
  routeType: z.string(),
  title: z.string(),
  hypothesis: z.string(),
  status: z.string(),
  confidence: confidenceSchema,
  evidenceRefs: z.array(uuidSchema),
  acceptedArtifactVersionId: uuidSchema.optional(),
});

export const organizationContextSchema = z.object({
  id: uuidSchema,
  canonicalName: z.string(),
  website: z.url().optional(),
  countryCode: z.string().length(2).optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  description: z.string().optional(),
  marketRoles: z.array(z.string()),
  primaryRouteId: uuidSchema.optional(),
  relevanceScore: confidenceSchema,
  discoveryReason: z.string(),
  relationships: z.array(z.object({
    relationshipType: z.string(),
    counterpartEntityId: uuidSchema,
    directionality: z.string(),
    confidence: confidenceSchema,
    claimId: uuidSchema.optional(),
    evidenceRefs: z.array(uuidSchema),
  })),
});

export const opportunityContextSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  routeId: uuidSchema,
  title: z.string(),
  hypothesis: z.string(),
  status: opportunityStatusSchema,
  priority: prioritySchema,
  score: confidenceSchema,
  scoreDimensions: z.record(z.string(), confidenceSchema),
  evidenceConfidence: confidenceLevelSchema,
  commercialValueBand: commercialValueBandSchema,
  resourceEfficiency: z.string(),
  nextAction: z.string(),
  unknowns: z.array(z.string()),
  latestActionCardVersion: z.number().int().positive().optional(),
});

export const stakeholderContextSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  personId: uuidSchema.optional(),
  roleType: z.string(),
  title: z.string().optional(),
  decisionInfluence: confidenceSchema,
  contactPriority: z.number().int().min(1).max(10),
  evidenceRefs: z.array(uuidSchema),
});

export const contactPointContextSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  personId: uuidSchema.optional(),
  stakeholderRoleId: uuidSchema.optional(),
  contactType: z.string(),
  value: z.string(),
  normalizedValue: z.string(),
  verificationStatus: z.string(),
  confidence: confidenceSchema,
  contactEvidenceRefs: z.array(uuidSchema),
  employmentEvidenceRefs: z.array(uuidSchema),
  verificationFacts: z.record(z.string(), z.unknown()).optional(),
});

export const interactionContextSchema = z.object({
  id: uuidSchema,
  opportunityId: uuidSchema,
  actionCardId: uuidSchema.optional(),
  interactionType: z.string(),
  occurredAt: timestampSchema,
  targetContactPointId: uuidSchema.optional(),
  channel: z.string().optional(),
  summary: z.string(),
  rawContent: z.string().optional(),
  rawContentObjectKey: z.string().optional(),
  outcome: z.string(),
  submittedFacts: z.array(z.record(z.string(), z.unknown())),
  nextAction: z.string().optional(),
  followUpAt: timestampSchema.optional(),
});

export const claimContextSchema = z.object({
  id: uuidSchema,
  claimType: z.string(),
  statement: z.string(),
  valueJson: z.unknown(),
  status: z.string(),
  confidence: confidenceSchema,
  evidenceRefs: z.array(uuidSchema),
});

export const evidenceContextSchema = z.object({
  evidenceId: uuidSchema,
  sourceId: uuidSchema,
  sourceSnapshotId: uuidSchema,
  sourceType: z.string(),
  url: z.url().optional(),
  normalizedUrl: z.url().optional(),
  publisher: z.string().optional(),
  publishedAt: timestampSchema.optional(),
  fetchedAt: timestampSchema,
  contentHash: z.string().min(1),
  excerpt: z.string().min(1),
  locator: z.object({
    page: z.number().int().positive().optional(),
    section: z.string().optional(),
    selector: z.string().optional(),
    startOffset: z.number().int().nonnegative().optional(),
    endOffset: z.number().int().nonnegative().optional(),
    jsonPointer: z.string().optional(),
  }).passthrough(),
  stance: z.string(),
  authority: z.string(),
  independentGroupKey: z.string(),
  subjectEntityId: uuidSchema.optional(),
  freshness: confidenceSchema,
  relevance: confidenceSchema,
});

export const artifactContextSchema = z.object({
  artifactId: uuidSchema,
  artifactType: z.string(),
  versionId: uuidSchema,
  versionNo: z.number().int().positive(),
  status: z.string(),
  payload: z.unknown(),
  evidenceRefs: z.array(uuidSchema),
});

export const userFeedbackContextSchema = z.object({
  feedbackType: z.enum(['route_edit', 'claim_edit', 'action_card_changes_requested', 'manual_contact_confirmation']),
  aggregateId: uuidSchema,
  artifactVersionId: uuidSchema.optional(),
  comment: z.string().optional(),
  patch: z.record(z.string(), z.unknown()).optional(),
  userId: uuidSchema,
  createdAt: timestampSchema,
});

export const openQuestionContextSchema = z.object({
  question: z.string(),
  impact: z.string(),
  aggregateId: uuidSchema.optional(),
});

export const agentExecutionContextSchema = z.object({
  contextVersion: z.literal(1),
  scope: z.object({
    tenantId: uuidSchema,
    missionId: uuidSchema,
    routeId: uuidSchema.optional(),
    organizationId: uuidSchema.optional(),
    opportunityId: uuidSchema.optional(),
    interactionId: uuidSchema.optional(),
    actionCardId: uuidSchema.optional(),
  }),
  mission: z.object({
    id: uuidSchema,
    companyName: z.string(),
    companyWebsite: z.union([z.url(), z.literal('')]),
    researchDefinition: researchDefinitionSchema.optional(),
    productScope: z.string(),
    targetCountries: z.array(z.string()),
    targetIndustries: z.array(z.string()),
    targetProfiles: z.array(z.object({ type: z.string(), description: z.string() })),
    objective: z.string(),
    successDefinition: z.string(),
    outputLanguages: z.array(z.string()),
    budget: budgetConfigSchema,
    stage: missionStageSchema,
  }),
  routes: z.array(marketRouteContextSchema),
  organization: organizationContextSchema.optional(),
  opportunity: opportunityContextSchema.optional(),
  stakeholders: z.array(stakeholderContextSchema),
  contacts: z.array(contactPointContextSchema),
  interactions: z.array(interactionContextSchema),
  claims: z.array(claimContextSchema),
  evidence: z.array(evidenceContextSchema),
  artifacts: z.array(artifactContextSchema),
  feedback: z.array(userFeedbackContextSchema),
  openQuestions: z.array(openQuestionContextSchema),
  execution: z.object({
    skillKey: z.string(),
    objective: z.string(),
    outputLanguage: z.string(),
    toolPermissions: z.array(z.string()),
    budgetRemaining: z.record(z.string(), z.number()),
    correlationId: uuidSchema,
  }),
});

export type AgentExecutionContext = z.infer<typeof agentExecutionContextSchema>;
export type OrganizationContext = z.infer<typeof organizationContextSchema>;
export type OpportunityContext = z.infer<typeof opportunityContextSchema>;
export type EvidenceContext = z.infer<typeof evidenceContextSchema>;
export type InteractionContext = z.infer<typeof interactionContextSchema>;
export type UserFeedbackContext = z.infer<typeof userFeedbackContextSchema>;
