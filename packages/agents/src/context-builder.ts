import { createHash } from 'node:crypto';
import type { AgentExecutionContext, AgentTaskInput } from '@imea/contracts';
import { agentExecutionContextSchema } from '@imea/contracts';
import type { ConnectorResult } from '@imea/connectors';

export interface BuiltContext {
  text: string;
  contextVersion: number;
  inputContextHash: string;
  evidenceIds: string[];
  structured?: AgentExecutionContext;
}

export interface ContextQueryRepository {
  load(input: { tenantId: string; missionId: string; opportunityId?: string; skillKey: string; objective: string; outputLanguage: string; toolPermissions: string[] }): Promise<AgentExecutionContext>;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(',')}}`;
  return JSON.stringify(value);
}

export class ContextBuilder {
  constructor(private readonly repository?: ContextQueryRepository) {}

  async build(input: AgentTaskInput, toolResults: readonly ConnectorResult[]): Promise<BuiltContext> {
    if (this.repository) {
      const loaded = await this.repository.load({
        tenantId: input.tenantId,
        missionId: input.missionId,
        ...(input.opportunityId ? { opportunityId: input.opportunityId } : {}),
        skillKey: input.skillKey,
        objective: input.objective,
        outputLanguage: input.outputLanguage,
        toolPermissions: input.toolPermissions,
      });
      const toolEvidenceIds = toolResults.flatMap((result) => result.evidence?.map((evidence) => evidence.evidenceId) ?? []);
      const evidenceIds = [...new Set([...loaded.evidence.map((evidence) => evidence.evidenceId), ...toolEvidenceIds])];
      const structured = agentExecutionContextSchema.parse({
        ...loaded,
        execution: { ...loaded.execution, skillKey: input.skillKey, objective: input.objective, outputLanguage: input.outputLanguage, toolPermissions: input.toolPermissions },
      });
      const text = stable(structured);
      return { text, structured, contextVersion: structured.contextVersion, inputContextHash: createHash('sha256').update(text).digest('hex'), evidenceIds };
    }
    const evidenceIds = [...new Set([
      ...input.knownClaims.flatMap((claim) => claim.evidenceRefs),
      ...toolResults.flatMap((result) => result.evidence?.map((evidence) => evidence.evidenceId) ?? result.items.map((item) => item.metadata.evidenceId).filter((value): value is string => typeof value === 'string')),
    ])];
    const legacyContext = {
      objective: input.objective,
      skillKey: input.skillKey,
      outputLanguage: input.outputLanguage,
      facts: input.knownClaims,
      openQuestions: input.openQuestions,
      evidenceIds,
      toolResults,
      artifacts: input.artifactRefs,
      toolPermissions: input.toolPermissions,
      budget: input.budget,
    };
    const text = stable(legacyContext);
    return { text, contextVersion: 1, inputContextHash: createHash('sha256').update(text).digest('hex'), evidenceIds };
  }
}
