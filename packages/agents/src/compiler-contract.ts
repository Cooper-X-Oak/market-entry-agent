import type { MissionBrief } from '@imea/contracts';
import { agentTaskOutputSchema, missionBriefSchema, normalizeResearchDefinition } from '@imea/contracts';
import type { BuiltContext } from './context-builder.js';
import { ExecutionError } from './execution-error.js';

export function validateCompilerOutput(value: unknown, context: BuiltContext): void {
  const output = agentTaskOutputSchema(missionBriefSchema).parse(value);
  // proposedClaims is not consumed by compileMission. Reject unsupported
  // assertions rather than manufacturing evidence IDs or deleting references.
  if (context.evidenceIds.length === 0 && (output.proposedClaims.length || output.result.knownFacts.length)) {
    throw new ExecutionError('EVIDENCE_INVALID', 'Compiler without public evidence must return empty proposedClaims and knownFacts; use initialAssumptions/openQuestions');
  }
  for (const fact of output.result.knownFacts) {
    if (!output.proposedClaims.some(claim => claim.statement === fact && claim.evidenceRefs.length > 0)) {
      throw new ExecutionError('EVIDENCE_INVALID', 'Compiler knownFact is not supported by the supplied evidence');
    }
  }
  const mission = context.structured?.mission;
  if (!mission) return;
  const definition = normalizeResearchDefinition(mission);
  if (output.result.researchDefinition && JSON.stringify(output.result.researchDefinition) !== JSON.stringify(definition)) {
    throw new ExecutionError('OUTPUT_INVALID', 'Compiler changed the authoritative research definition');
  }
}

export function bindCompiledScope(brief: MissionBrief, mission: {
  companyName: string; companyWebsite: string; productScope: string; targetCountries: string[];
  targetProfiles: Array<{ type: string; description: string }>; targetIndustries: string[];
  outputLanguages: string[]; objective: string; successDefinition: string;
  budgetConfig: unknown; researchDefinition?: unknown;
}): MissionBrief {
  const definition = normalizeResearchDefinition(mission);
  return missionBriefSchema.parse({ ...brief, researchDefinition: definition,
    company: { name: mission.companyName, website: mission.companyWebsite, productSummary: '主体角色及供应方能力未评估；研究产品仅见 researchDefinition.products' },
    markets: [...new Set(definition.regions.map(region => region.countryCode))].map(countryCode => ({ countryCode,
      countryName: countryCode, targetIndustries: mission.targetIndustries, outputLanguages: mission.outputLanguages })),
    targetProfiles: mission.targetProfiles, objectives: [mission.objective], successCriteria: [mission.successDefinition], budget: mission.budgetConfig,
  });
}
