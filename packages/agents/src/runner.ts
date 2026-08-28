import type { AgentTaskInput } from '@imea/contracts';
import { enrichConnectorEvidence, type ConnectorResult } from '@imea/connectors';
import type { ContextBuilder } from './context-builder.js';
import type { PromptRegistry } from './prompt-registry.js';
import type { ToolRegistry } from './tool-registry.js';
import type { AgentSkill, ModelProvider, RunStore } from './types.js';
import { EvidenceValidator } from './evidence-validator.js';

function evidenceConclusions(value: unknown, path = 'result'): Array<{ key: string; evidenceRefs: string[] }> {
  if (Array.isArray(value)) return value.flatMap((item, index) => evidenceConclusions(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  const direct: Array<{ key: string; evidenceRefs: string[] }> = [];
  for (const [key, nested] of Object.entries(object)) {
    if (['evidenceRefs', 'supportingEvidenceRefs', 'contactEvidenceRefs', 'employmentEvidenceRefs'].includes(key) && Array.isArray(nested)) {
      const evidenceRefs = nested.filter((item): item is string => typeof item === 'string');
      if (key !== 'employmentEvidenceRefs' || evidenceRefs.length > 0) direct.push({ key: `${path}.${key}`, evidenceRefs });
    }
    else if (key === 'sourceRef' && typeof nested === 'string') direct.push({ key: `${path}.${key}`, evidenceRefs: [nested] });
    else direct.push(...evidenceConclusions(nested, `${path}.${key}`));
  }
  return direct;
}

function assertSkillQuality(skillKey: string, output: unknown): void {
  const envelope = output as { result?: Record<string, unknown> };
  const result = envelope.result;
  if (!result) return;
  if (skillKey === 'market_route_researcher') {
    const routes = Array.isArray(result.routes) ? result.routes as Array<Record<string, unknown>> : [];
    if (routes.length < 3) throw new Error('AGENT_EVIDENCE_INSUFFICIENT: market route output requires at least three routes');
    for (const route of routes) {
      if (!Array.isArray(route.supportingEvidenceRefs) || route.supportingEvidenceRefs.length < 2) throw new Error('AGENT_EVIDENCE_INSUFFICIENT: each route requires two supporting evidence references');
      if (!Array.isArray(route.keyEntityTypes) || route.keyEntityTypes.length === 0 || !Array.isArray(route.primaryChannels) || route.primaryChannels.length === 0 || !Array.isArray(route.capabilityRequirements) || route.capabilityRequirements.length === 0) throw new Error('AGENT_OUTPUT_INVALID: route is missing entity types, contact channels or capability requirements');
    }
  }
  if (skillKey === 'contact_path_finder') {
    const contacts = Array.isArray(result.contactPoints) ? result.contactPoints : [];
    if (contacts.length < 2) throw new Error('AGENT_EVIDENCE_INSUFFICIENT: contact path output requires primary and backup paths');
  }
  if (skillKey === 'action_card_builder') {
    for (const field of ['targetStakeholderRoleId','primaryContactPointId','channel','objective','contactReason','stakeholderInterest','valueHypothesis','followUpPlan','successSignals']) if (result[field] === undefined || result[field] === '') throw new Error(`AGENT_OUTPUT_INVALID: Action Card is missing ${field}`);
  }
}

export class AgentRunner {
  private readonly skills = new Map<string, AgentSkill>();

  constructor(
    private readonly modelProvider: ModelProvider,
    private readonly modelName: string,
    private readonly tools: ToolRegistry,
    private readonly prompts: PromptRegistry,
    private readonly contextBuilder: ContextBuilder,
    private readonly runStore: RunStore,
    skills: readonly AgentSkill[],
  ) {
    for (const skill of skills) this.skills.set(skill.key, skill);
  }

  async execute<T>(input: AgentTaskInput): Promise<T> {
    const skill = this.skills.get(input.skillKey) as AgentSkill<T> | undefined;
    if (!skill) throw new Error(`Unknown Agent Skill: ${input.skillKey}`);
    const promptVersion = this.prompts.active(skill.key);
    const runRecord = await this.runStore.start(input, skill.key, this.modelName, promptVersion.version);
    try {
      const results: ConnectorResult[] = [];
      const queries = skill.planQueries(input).slice(0, Math.min(input.budget.maxSearchCalls + input.budget.maxBrowserPages, skill.maxResearchLoops * 10));
      for (const request of queries) {
        const connectorType = typeof request.options?.connectorType === 'string' ? request.options.connectorType : skill.permittedConnectors[0];
        if (!connectorType || !input.toolPermissions.includes(connectorType)) continue;
        const toolRunId = await this.runStore.toolStarted(runRecord.id, connectorType, request);
        try {
          const result = enrichConnectorEvidence(await this.tools.execute(connectorType, request));
          results.push(result);
          await this.runStore.toolCompleted(toolRunId, result);
        } catch (error) {
          await this.runStore.toolFailed(toolRunId, error);
        }
      }
      const context = await this.contextBuilder.build(input, results);
      await this.runStore.contextReady(runRecord.id, context);
      const modelResult = await this.modelProvider.generate({
        model: this.modelName,
        name: skill.key,
        instructions: `${promptVersion.systemTemplate}\n\n${skill.instructions}\n输出必须满足给定结构化 Schema。`,
        prompt: context.text,
        outputSchema: skill.outputSchema,
        maxTurns: skill.maxResearchLoops,
      });
      assertSkillQuality(skill.key, modelResult.output);
      const conclusions = evidenceConclusions(modelResult.output);
      if (conclusions.length > 0) {
        const validation = new EvidenceValidator().validate({ requiredConclusions: conclusions, allowedEvidenceIds: new Set(context.evidenceIds), evidenceGroupsById: new Map(context.structured?.evidence.map((evidence) => [evidence.evidenceId, evidence.independentGroupKey]) ?? []), requireIndependentRouteSources: skill.key === 'market_route_researcher' });
        if (!validation.valid) throw new Error(`AGENT_EVIDENCE_INSUFFICIENT: ${validation.errors.join(', ')}`);
      }
      await this.runStore.complete(runRecord.id, modelResult.output, modelResult.usage);
      return modelResult.output;
    } catch (error) {
      await this.runStore.fail(runRecord.id, error);
      throw error;
    }
  }
}
