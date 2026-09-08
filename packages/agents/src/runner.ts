import { contentReviewSchema, contentReviewInstructions } from './content-review.js';
import { validateCompilerOutput } from './compiler-contract.js';
import { executionControl } from './execution-control.js';
import { ExecutionError } from './execution-error.js';
import type { AgentTaskInput } from '@imea/contracts';
import { enrichConnectorEvidence, type ConnectorResult } from '@imea/connectors';
import type { ContextBuilder } from './context-builder.js';
import type { PromptRegistry } from './prompt-registry.js';
import type { ToolRegistry } from './tool-registry.js';
import type { AgentSkill, ModelProvider, RunStore } from './types.js';
import { EvidenceValidator, type EvidenceValidationInput } from './evidence-validator.js';

const fixtureEvidencePlaceholders = [
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
] as const;

function resolveFixtureEvidenceRefs(value: unknown, evidenceIds: readonly string[]): unknown {
  if (typeof value === 'string') {
    const index = fixtureEvidencePlaceholders.indexOf(value as typeof fixtureEvidencePlaceholders[number]);
    return index >= 0 ? evidenceIds[index] ?? evidenceIds[0] ?? value : value;
  }
  if (Array.isArray(value)) return value.map((item) => resolveFixtureEvidenceRefs(item, evidenceIds));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, resolveFixtureEvidenceRefs(nested, evidenceIds)]));
}

function evidenceConclusions(value: unknown, path = 'result'): EvidenceValidationInput['requiredConclusions'] {
  if (Array.isArray(value)) return value.flatMap((item, index) => evidenceConclusions(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  const reasoning = ['rationale', 'hypothesis', 'relevanceReason', 'marketImplication', 'contactReason'].map(key => object[key]).find((text): text is string => typeof text === 'string');
  const factual = ['description', 'marketPresenceSummary', 'positionSummary'].map(key => object[key]).find((text): text is string => typeof text === 'string');
  const direct: EvidenceValidationInput['requiredConclusions'] = [];
  for (const [key, nested] of Object.entries(object)) {
    if (['evidenceRefs', 'supportingEvidenceRefs', 'contactEvidenceRefs', 'employmentEvidenceRefs', 'counterEvidenceRefs'].includes(key) && Array.isArray(nested)) {
      const evidenceRefs = nested.filter((item): item is string => typeof item === 'string');
      if (!['employmentEvidenceRefs', 'counterEvidenceRefs'].includes(key) || evidenceRefs.length > 0) direct.push({ key: `${path}.${key}`, evidenceRefs, mode: key === 'counterEvidenceRefs' ? 'counter' : object.status === 'inferred' || reasoning ? 'inferred' : 'observed', ...(reasoning || factual ? { statement: reasoning ?? factual } : {}), ...(typeof object.statement === 'string' && object.status !== 'unknown' ? { statement: object.statement } : {}), ...(key === 'contactEvidenceRefs' && typeof object.value === 'string' ? { statement: object.value } : {}) });
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
    if (contacts.some((contact) => !contact || typeof contact !== 'object' || !Array.isArray((contact as Record<string, unknown>).contactEvidenceRefs))) throw new Error('AGENT_EVIDENCE_INSUFFICIENT: every contact path requires public evidence');
  }
  if (skillKey === 'action_card_builder') {
    for (const field of ['cardType','targetRoleLabel','objective','contactReason','stakeholderInterest','valueHypothesis','followUpPlan','successSignals','researchPlan','unknowns']) if (result[field] === undefined || result[field] === '') throw new Error(`AGENT_OUTPUT_INVALID: Action Card is missing ${field}`);
  }
}

export class AgentRunner {
  private readonly skills = new Map<string, AgentSkill>();

  constructor(
    private readonly modelProvider: ModelProvider,
    private readonly modelNames: string | { research: string; extraction: string; writing: string },
    private readonly tools: ToolRegistry,
    private readonly prompts: PromptRegistry,
    private readonly contextBuilder: ContextBuilder,
    private readonly runStore: RunStore,
    skills: readonly AgentSkill[],
  ) {
    for (const skill of skills) this.skills.set(skill.key, skill);
  }

  private modelName(skillKey: string): string {
    if (typeof this.modelNames === 'string') return this.modelNames;
    if (skillKey === 'action_card_builder') return this.modelNames.writing;
    if (['mission_compiler', 'capability_evidence_extractor', 'entity_resolver', 'interaction_interpreter'].includes(skillKey)) return this.modelNames.extraction;
    return this.modelNames.research;
  }

  async execute<T>(input: AgentTaskInput): Promise<T> {
    const skill = this.skills.get(input.skillKey) as AgentSkill<T> | undefined;
    if (!skill) throw new Error(`Unknown Agent Skill: ${input.skillKey}`);
    const promptVersion = this.prompts.active(skill.key);
    const modelName = this.modelName(skill.key);
    const runRecord = await this.runStore.start(input, skill.key, modelName, promptVersion.version);
    try {
      const results: ConnectorResult[] = [];
      const collectedEvidenceIds = new Set<string>();
      const queries = skill.planQueries(input).slice(0, Math.min(input.budget.maxSearchCalls + input.budget.maxBrowserPages, skill.maxResearchLoops * 10));
      for (const request of queries) {
        const connectorType = typeof request.options?.connectorType === 'string' ? request.options.connectorType : skill.permittedConnectors[0];
        if (!connectorType || !input.toolPermissions.includes(connectorType)) continue;
        const toolRunId = await this.runStore.toolStarted(runRecord.id, connectorType, request);
        try {
          const result = enrichConnectorEvidence(await this.tools.execute(connectorType, request), input.missionId);
          results.push(result);
          for (const evidence of result.evidence) collectedEvidenceIds.add(evidence.evidenceId);
          await this.runStore.toolCompleted(toolRunId, result);
          if (skill.evidenceStopThreshold && collectedEvidenceIds.size >= skill.evidenceStopThreshold) break;
        } catch (error) {
          await this.runStore.toolFailed(toolRunId, error);
        }
      }
      const context = await this.contextBuilder.build(input, results);
      await this.runStore.contextReady(runRecord.id, context);
      const modelResult = await this.modelProvider.generate({
        model: modelName,
        name: skill.key,
        instructions: `${promptVersion.systemTemplate}\n\n${skill.instructions}\n输出必须满足给定结构化 Schema。`,
        prompt: context.text,
        outputSchema: skill.outputSchema,
        maxTurns: skill.maxResearchLoops,
        signal: executionControl.getStore()?.signal,
        onAttempt: event => this.runStore.providerAttempt(runRecord.id, event),
      });
      const output = skill.outputSchema.parse(this.modelProvider.name === 'mock' ? resolveFixtureEvidenceRefs(modelResult.output, context.evidenceIds) : modelResult.output);
      if (skill.key === 'mission_compiler') validateCompilerOutput(output, context);
      assertSkillQuality(skill.key, output);
      const conclusions = evidenceConclusions(output);
      if (conclusions.length > 0) {
        const validationInput: EvidenceValidationInput = { requiredConclusions: conclusions, allowedEvidenceIds: new Set(context.evidenceIds), evidenceContentById: context.structured ? new Map(context.structured.evidence.map(evidence => [evidence.evidenceId, { excerpt: evidence.excerpt, stance: evidence.stance, url: evidence.url }])) : undefined, evidenceGroupsById: new Map(context.structured?.evidence.map((evidence) => [evidence.evidenceId, evidence.independentGroupKey]) ?? []), requireIndependentRouteSources: skill.key === 'market_route_researcher' };
        let validation = new EvidenceValidator().validate(validationInput);
        if (!validation.valid && validation.errors.every(error => error.startsWith('content_support_unverified:')) && !validation.errors.some(error => error.endsWith('.contactEvidenceRefs'))) {
          const reviewRun = await this.runStore.start({ ...input, skillKey: 'evidence_content_review', objective: 'Review cited content for parent Agent Run ' + runRecord.id }, 'evidence_content_review', modelName, 1);
          try {
            await this.runStore.contextReady(reviewRun.id, context);
            const review = await this.modelProvider.generate({ model: modelName, name: 'evidence_content_review', instructions: contentReviewInstructions, prompt: JSON.stringify({ conclusions, evidence: [...(validationInput.evidenceContentById ?? [])] }), outputSchema: contentReviewSchema, maxTurns: 1, signal: executionControl.getStore()?.signal, onAttempt: event => this.runStore.providerAttempt(reviewRun.id, event) });
            const checked = contentReviewSchema.parse(review.output);
            if (new Set(checked.reviews.map(item => item.key)).size !== checked.reviews.length) throw new ExecutionError('EVIDENCE_INVALID', 'Duplicate content review keys');
            await this.runStore.complete(reviewRun.id, checked, review.usage);
            validation = new EvidenceValidator().validate({ ...validationInput, contentReviews: new Map(checked.reviews.map(item => [item.key, item])) });
          } catch (error) { await this.runStore.fail(reviewRun.id, error); throw error; }
        }
        if (!validation.valid) throw new ExecutionError('EVIDENCE_INVALID', validation.errors.join(', '));
      }
      await this.runStore.complete(runRecord.id, output, modelResult.usage);
      return output;
    } catch (error) {
      await this.runStore.fail(runRecord.id, error);
      throw error;
    }
  }
}
