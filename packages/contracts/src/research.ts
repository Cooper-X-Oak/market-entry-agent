import { z } from 'zod';
import { confidenceSchema, uuidSchema } from './common.js';
import { actionCardTypeSchema, commercialValueBandSchema, contactTypeSchema, routeTypeSchema } from './enums.js';

export const agentTaskInputSchema = z.object({
  tenantId: uuidSchema,
  missionId: uuidSchema,
  opportunityId: uuidSchema.optional(),
  skillKey: z.string().min(1),
  objective: z.string().min(1),
  artifactRefs: z.array(z.object({ artifactId: uuidSchema, versionId: uuidSchema, type: z.string() })),
  knownClaims: z.array(z.object({ claimId: uuidSchema, statement: z.string(), status: z.string(), confidence: confidenceSchema, evidenceRefs: z.array(uuidSchema) })),
  openQuestions: z.array(z.string()),
  toolPermissions: z.array(z.string()),
  budget: z.object({ maxSearchCalls: z.number().int().nonnegative(), maxBrowserPages: z.number().int().nonnegative(), maxModelTokens: z.number().int().positive() }),
  outputLanguage: z.string().min(2),
});

export const agentTaskOutputSchema = <T extends z.ZodType>(resultSchema: T) => z.object({
  result: resultSchema,
  proposedClaims: z.array(z.object({ claimType: z.string(), statement: z.string(), value: z.unknown(), confidence: confidenceSchema, evidenceRefs: z.array(uuidSchema), impactLevel: z.string() })),
  unknowns: z.array(z.object({ question: z.string(), impact: z.string(), recommendedTask: z.string().optional() })),
  contradictions: z.array(z.object({ claimRef: uuidSchema.optional(), description: z.string(), evidenceRefs: z.array(uuidSchema) })),
  recommendedEvents: z.array(z.object({ eventType: z.string(), payload: z.record(z.string(), z.unknown()) })),
  quality: z.object({ schemaValid: z.boolean(), evidenceCoverage: confidenceSchema, confidence: confidenceSchema }),
});

export const capabilityExtractionResultSchema = z.object({
  claims: z.array(z.object({ category: z.string(), statement: z.string(), status: z.enum(['observed', 'inferred', 'unknown']), confidence: confidenceSchema, evidenceRefs: z.array(uuidSchema), currentMissionImpact: z.enum(['low', 'medium', 'high']) })),
  missingCapabilities: z.array(z.object({ capability: z.string(), routeDependency: z.string(), questionForUser: z.string() })),
});

export const marketRouteResearchResultSchema = z.object({
  routes: z.array(z.object({
    routeType: routeTypeSchema,
    title: z.string(),
    hypothesis: z.string(),
    applicableScenarios: z.array(z.string()),
    keyEntityTypes: z.array(z.string()).min(1),
    keyStakeholderRoles: z.array(z.string()).min(1),
    primaryChannels: z.array(z.string()).min(1),
    capabilityRequirements: z.array(z.string()).min(1),
    supportingEvidenceRefs: z.array(uuidSchema).min(2),
    counterEvidenceRefs: z.array(uuidSchema),
    confidence: confidenceSchema,
    entryDifficulty: confidenceSchema,
    timeToFirstContactDays: z.number().int().nonnegative(),
    resourceIntensity: confidenceSchema,
    rank: z.number().int().positive(),
  })).min(3).max(8),
});

export const entityCandidateSchema = z.object({
  candidateKey: z.string().min(1),
  canonicalName: z.string().min(1),
  entityType: z.string().min(1),
  website: z.url().optional(),
  countryCode: z.string().length(2).optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  aliases: z.array(z.string()),
  externalIds: z.record(z.string(), z.string()),
  description: z.string().optional(),
  evidenceRefs: z.array(uuidSchema),
  confidence: confidenceSchema,
});

export const ecosystemMapResultSchema = z.object({
  entities: z.array(entityCandidateSchema),
  relationships: z.array(z.object({ sourceCandidateKey: z.string(), targetCandidateKey: z.string(), relationshipType: z.string(), confidence: confidenceSchema, evidenceRefs: z.array(uuidSchema) })),
});

export const targetRankingResultSchema = z.object({
  targets: z.array(z.object({
    organizationName: z.string().min(1),
    website: z.url().optional(),
    marketRole: z.string().min(1),
    primaryRouteTitle: z.string().min(1),
    productFit: confidenceSchema,
    routeFit: confidenceSchema,
    demandSignal: confidenceSchema,
    contactability: confidenceSchema,
    evidenceQuality: confidenceSchema,
    finalScore: confidenceSchema,
    rationale: z.string().min(1),
    evidenceRefs: z.array(uuidSchema).min(1),
  })).min(3).max(20),
});

export const stakeholderMapResultSchema = z.object({
  stakeholders: z.array(z.object({ personCandidate: entityCandidateSchema.optional(), roleType: z.string(), title: z.string().optional(), decisionInfluence: confidenceSchema, contactPriority: z.number().int().min(1).max(10), relevanceReason: z.string(), evidenceRefs: z.array(uuidSchema), confidence: confidenceSchema })).min(1),
});

export const contactPathResultSchema = z.object({
  contactPoints: z.array(z.object({
    personName: z.string().optional(),
    stakeholderRoleType: z.string().optional(),
    contactType: contactTypeSchema,
    value: z.string().min(1),
    normalizedValue: z.string().min(1),
    label: z.string().optional(),
    isPublic: z.boolean(),
    contactEvidenceRefs: z.array(uuidSchema).min(1),
    employmentEvidenceRefs: z.array(uuidSchema),
    sourceAuthority: z.string().min(1),
    independentGroupKeys: z.array(z.string().min(1)).min(1),
    confidence: confidenceSchema,
    language: z.string().optional(),
    timezone: z.string().optional(),
    recommendedRank: z.number().int().positive(),
    backupPathDescription: z.string().optional(),
  })),
});

export const opportunityQualificationResultSchema = z.object({
  hypothesis: z.string(),
  recommendedStatus: z.string(),
  commercialValueBand: commercialValueBandSchema,
  estimatedSalesHours: z.number().nonnegative(),
  estimatedTechnicalHours: z.number().nonnegative(),
  estimatedMarketCostPoints: z.number().nonnegative(),
  scores: z.object({ productFit: confidenceSchema, routeFit: confidenceSchema, demandSignal: confidenceSchema, timingSignal: confidenceSchema, stakeholderRelevance: confidenceSchema, contactability: confidenceSchema, evidenceQuality: confidenceSchema, strategicValue: confidenceSchema }),
  rationale: z.record(z.string(), z.string()),
  nextAction: z.string(),
  evidenceRefs: z.array(uuidSchema),
  unknowns: z.array(z.string()),
});

export const actionCardResultSchema = z.object({
  cardType: actionCardTypeSchema,
  targetRoleLabel: z.string().min(1),
  channel: contactTypeSchema.optional(),
  objective: z.string(),
  contactReason: z.string(),
  timingReason: z.string(),
  stakeholderInterest: z.string(),
  valueHypothesis: z.string(),
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
  socialMessage: z.string().optional(),
  callOpening: z.string().optional(),
  contactFormMessage: z.string().optional(),
  attachmentsRequired: z.array(z.string()),
  followUpPlan: z.array(z.object({ offsetDays: z.number().int().nonnegative(), channel: z.string(), objective: z.string() })),
  successSignals: z.array(z.string()),
  completionSignals: z.array(z.string()),
  researchPlan: z.array(z.string()),
  unknowns: z.array(z.string()),
  criticalUnknowns: z.array(z.string()),
  evidenceRefs: z.array(uuidSchema),
});

export type AgentTaskInput = z.infer<typeof agentTaskInputSchema>;
export type MarketRouteResearchResult = z.infer<typeof marketRouteResearchResultSchema>;
export type EntityCandidate = z.infer<typeof entityCandidateSchema>;
export type TargetRankingResult = z.infer<typeof targetRankingResultSchema>;
export type ActionCardResult = z.infer<typeof actionCardResultSchema>;
