import { z } from 'zod';
import { researchDefinitionSchema } from './research-definition.js';
import { artifactVersionStatusSchema, missionStageSchema, missionStatusSchema } from './enums.js';
import { uuidSchema } from './common.js';

export const budgetConfigSchema = z.object({
  maxTargets: z.number().int().min(10).max(20).default(20),
  maxContactPaths: z.number().int().min(1).max(1000).default(160),
  maxSearchCalls: z.number().int().min(20).max(80).default(80),
  maxBrowserPages: z.number().int().min(30).max(120).default(120),
  maxAgentRuns: z.number().int().min(50).max(800).default(200),
  maxModelTokens: z.number().int().min(10_000).max(1_000_000).default(1_000_000),
  weeklyRefreshTargets: z.number().int().min(5).max(100).default(20),
});

export const createMissionRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  companyName: z.string().trim().min(1).max(200).default('主体角色未确认'),
  companyWebsite: z.union([z.url(), z.literal('')]).default(''),
  researchDefinition: researchDefinitionSchema.nullish(),
  productScope: z.string().trim().min(1),
  targetCountries: z.array(z.string().length(2)).min(1).max(3),
  targetIndustries: z.array(z.string().trim().min(1)).min(1),
  targetProfiles: z.array(z.object({ type: z.string().min(1), description: z.string().min(1) })).min(1),
  objective: z.string().trim().min(1),
  successDefinition: z.string().trim().min(1),
  outputLanguages: z.array(z.string().trim().min(2)).min(1),
  budgetConfig: budgetConfigSchema,
});

export const updateMissionRequestSchema = createMissionRequestSchema.partial();

export const missionSchema = createMissionRequestSchema.extend({
  id: uuidSchema,
  tenantId: uuidSchema,
  status: missionStatusSchema,
  currentStage: missionStageSchema,
  executionMode: z.enum(['live', 'fixture']),
  workflowId: z.string().nullable(),
  createdBy: uuidSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const missionBriefSchema = z.object({
  company: z.object({ name: z.string(), website: z.union([z.url(), z.literal('')]), productSummary: z.string() }),
  researchDefinition: researchDefinitionSchema.optional(),
  markets: z.array(z.object({ countryCode: z.string().length(2), countryName: z.string(), targetIndustries: z.array(z.string()), outputLanguages: z.array(z.string()) })).min(1),
  targetProfiles: z.array(z.object({ type: z.string(), description: z.string() })),
  objectives: z.array(z.string()).min(1),
  successCriteria: z.array(z.string()).min(1),
  knownFacts: z.array(z.string()),
  initialAssumptions: z.array(z.object({ statement: z.string(), confidence: z.number().int().min(0).max(100) })),
  openQuestions: z.array(z.string()),
  budget: budgetConfigSchema,
});

export const artifactVersionSchema = z.object({
  id: uuidSchema,
  artifactId: uuidSchema,
  versionNo: z.number().int().positive(),
  status: artifactVersionStatusSchema,
  payload: z.unknown(),
  summary: z.string(),
  createdAt: z.string(),
});

export type BudgetConfig = z.infer<typeof budgetConfigSchema>;
export type CreateMissionRequest = z.infer<typeof createMissionRequestSchema>;
export type UpdateMissionRequest = z.infer<typeof updateMissionRequestSchema>;
export type Mission = z.infer<typeof missionSchema>;
export type MissionBrief = z.infer<typeof missionBriefSchema>;
