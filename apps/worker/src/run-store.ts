import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ExecutionError } from '@imea/agents';
import { executionControl } from '@imea/agents';
import { createHash, randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { AgentRunRecord, BuiltContext, ModelUsage, ProviderAttempt, RunStore } from '@imea/agents';
import type { AgentTaskInput } from '@imea/contracts';
import type { ConnectorRequest, ConnectorResult, ObjectStorageConnector } from '@imea/connectors';
import { type Database, agentRuns, evidenceItems, promptVersions, sources, sourceSnapshots, toolRuns, TransactionManager } from '@imea/database';

interface RunScope { tenantId: string; missionId: string; correlationId: string }

function errorFields(error: unknown): { code: string; message: string } {
  if (error instanceof Error) return { code: error.name, message: error.message };
  return { code: 'UNKNOWN_ERROR', message: String(error) };
}

function sourceType(value: string): typeof sources.$inferInsert.sourceType {
  const allowed = new Set<typeof sources.$inferInsert.sourceType>(['company_website','product_page','case_study','certification_page','contact_page','search_result','tender_notice','award_notice','registry_record','association_page','exhibition_page','social_public_page','industry_article','expert_content','interaction_record','uploaded_document']);
  return allowed.has(value as typeof sources.$inferInsert.sourceType) ? value as typeof sources.$inferInsert.sourceType : 'search_result';
}

export class DatabaseRunStore implements RunStore {
  private readonly transactions: TransactionManager;
  private readonly runScopes = new Map<string, RunScope>();
  private readonly toolScopes = new Map<string, RunScope>();

  constructor(private readonly db: Database, private readonly providerName: string, private readonly storage?: ObjectStorageConnector) {
    this.transactions = new TransactionManager(db);
  }

  async start(input: AgentTaskInput, skillKey: string, modelName: string, promptVersion: number): Promise<AgentRunRecord> {
    const correlationId = randomUUID();
    const scope = { tenantId: input.tenantId, missionId: input.missionId, correlationId };
    const id = randomUUID();
    await this.transactions.independent({ tenantId: input.tenantId, actor: { type: 'agent', id: skillKey }, correlationId }, async (tx) => {
      const [prompt] = await tx.insert(promptVersions).values({ skillKey, version: promptVersion, systemTemplate: `Built-in ${skillKey} prompt`, inputSchemaVersion: 1, outputSchemaVersion: 1, modelConfig: { modelName }, active: 1 }).onConflictDoUpdate({ target: [promptVersions.skillKey, promptVersions.version], set: { active: 1 } }).returning();
      if (!prompt) throw new Error('Prompt version insert returned no row');
      const initialHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      await tx.insert(agentRuns).values({ id, tenantId: input.tenantId, missionId: input.missionId, opportunityId: input.opportunityId, activityType: input.skillKey, skillKey, status: 'running', modelProvider: this.providerName, modelName, promptVersionId: prompt.id, contextVersion: 1, inputContextHash: initialHash, evidenceItemIds: [...new Set(input.knownClaims.flatMap((claim) => claim.evidenceRefs))], inputArtifactIds: input.artifactRefs.map((item) => item.artifactId), outputArtifactVersionIds: [], executionAudit: { contractVersion: 'module-correction-v1', ...executionControl.getStore(), signal: undefined, usageState: 'unknown', cost: null, costSource: 'unknown', attempts: [] } });
    });
    this.runScopes.set(id, scope);
    return { id, input, skillKey, modelName, promptVersion };
  }

  async toolStarted(runId: string, connectorType: string, request: ConnectorRequest): Promise<string> {
    const scope = this.runScopes.get(runId) ?? { tenantId: request.tenantId, missionId: request.missionId, correlationId: randomUUID() };
    const id = randomUUID();
    await this.transactions.independent({ tenantId: scope.tenantId, actor: { type: 'agent', id: connectorType }, correlationId: scope.correlationId }, async (tx) => {
      await tx.insert(toolRuns).values({ id, tenantId: scope.tenantId, missionId: scope.missionId, agentRunId: runId, connectorType, operation: request.operation, status: 'running', requestSummary: { query: request.query, url: request.url, options: request.options }, responseSummary: {}, sourceIds: [], snapshotIds: [], evidenceIds: [] });
    });
    this.toolScopes.set(id, scope);
    return id;
  }

  async toolCompleted(toolRunId: string, result: ConnectorResult): Promise<void> {
    const scope = this.toolScopes.get(toolRunId);
    if (!scope) throw new Error(`Missing Tool Run scope for ${toolRunId}`);
    const collected = result.evidence ?? [];
    const prepared = await Promise.all(collected.map(async (item) => {
      if (!this.storage || !item.snapshot.objectKey.startsWith('connector-inline/')) return item;
      const stored = await this.storage.put(scope.tenantId, scope.missionId, 'connector-results', JSON.stringify(item), 'application/json');
      return { ...item, snapshot: { ...item.snapshot, objectKey: stored.objectKey, contentHash: stored.contentHash } };
    }));
    await this.transactions.independent({ tenantId: scope.tenantId, actor: { type: 'agent', id: 'connector' }, correlationId: scope.correlationId }, async (tx) => {
      const sourceIds: string[] = [];
      const snapshotIds: string[] = [];
      const persistedEvidenceIds: string[] = [];
      for (const item of prepared) {
        const normalizedUrl = item.source.normalizedUrl ?? item.source.url ?? `urn:imea:evidence:${item.snapshot.contentHash}`;
        const [source] = await tx.insert(sources).values({
          tenantId: scope.tenantId,
          missionId: scope.missionId,
          sourceType: sourceType(item.source.sourceType),
          url: item.source.url,
          normalizedUrl,
          title: item.source.title,
          publisher: item.source.publisher,
          publishedAt: item.source.publishedAt ? new Date(item.source.publishedAt) : undefined,
          metadata: { authority: item.source.authority, independentGroupKey: item.source.independentGroupKey, toolRunId },
        }).onConflictDoUpdate({ target: [sources.tenantId, sources.missionId, sources.normalizedUrl], set: { title: item.source.title, publisher: item.source.publisher, lastFetchedAt: new Date(), status: 'active', metadata: { authority: item.source.authority, independentGroupKey: item.source.independentGroupKey, toolRunId } } }).returning();
        if (!source) continue;
        sourceIds.push(source.id);
        const [insertedSnapshot] = await tx.insert(sourceSnapshots).values({ sourceId: source.id, fetchedAt: new Date(item.snapshot.fetchedAt), httpStatus: item.snapshot.httpStatus, contentHash: item.snapshot.contentHash, objectKey: item.snapshot.objectKey, extractedText: item.snapshot.extractedText, extractionMetadata: { toolRunId } }).onConflictDoNothing().returning();
        const snapshot = insertedSnapshot ?? (await tx.select().from(sourceSnapshots).where(and(eq(sourceSnapshots.sourceId, source.id), eq(sourceSnapshots.contentHash, item.snapshot.contentHash))).limit(1))[0];
        if (!snapshot) continue;
        snapshotIds.push(snapshot.id);
        await tx.update(sources).set({ latestSnapshotId: snapshot.id }).where(eq(sources.id, source.id));
        await tx.insert(evidenceItems).values({ id: item.evidenceId, tenantId: scope.tenantId, missionId: scope.missionId, sourceSnapshotId: snapshot.id, excerpt: item.evidence.excerpt, locator: item.evidence.locator, stance: item.evidence.stance as typeof evidenceItems.$inferInsert.stance, relevance: item.evidence.relevance, freshness: item.evidence.freshness }).onConflictDoNothing();
        persistedEvidenceIds.push(item.evidenceId);
      }
      await tx.update(toolRuns).set({ status: 'succeeded', responseSummary: { success: result.success, itemCount: result.items.length, rawObjectKey: result.rawObjectKey }, sourceIds: [...new Set(sourceIds)], snapshotIds: [...new Set(snapshotIds)], evidenceIds: [...new Set(persistedEvidenceIds)], durationMs: result.durationMs, costAmount: String(result.costAmount), completedAt: new Date() }).where(eq(toolRuns.id, toolRunId));
    });
  }

  async toolFailed(toolRunId: string, error: unknown): Promise<void> {
    const scope = this.toolScopes.get(toolRunId);
    if (!scope) return;
    await this.transactions.independent({ tenantId: scope.tenantId, actor: { type: 'agent', id: 'connector' }, correlationId: scope.correlationId }, async (tx) => {
      await tx.update(toolRuns).set({ status: 'failed', errorMessage: errorFields(error).message, completedAt: new Date() }).where(eq(toolRuns.id, toolRunId));
    });
  }

  async contextReady(runId: string, context: BuiltContext): Promise<void> {
    const scope = this.runScopes.get(runId);
    if (!scope) throw new Error(`Missing Agent Run scope for ${runId}`);
    await this.transactions.independent({ tenantId: scope.tenantId, actor: { type: 'agent', id: 'context-builder' }, correlationId: scope.correlationId }, async (tx) => {
      await tx.update(agentRuns).set({ contextVersion: context.contextVersion, inputContextHash: context.inputContextHash, evidenceItemIds: context.evidenceIds }).where(eq(agentRuns.id, runId));
    });
  }

  async providerAttempt(runId: string, event: ProviderAttempt): Promise<void> {
    const scope = this.runScopes.get(runId);
    if (!scope) throw new Error('Missing audit scope');
    try { await this.transactions.independent({ tenantId: scope.tenantId, actor: { type: 'agent', id: 'provider-audit' }, correlationId: scope.correlationId }, async tx => {
      await tx.update(agentRuns).set({ executionAudit: sql`jsonb_set(coalesce(${agentRuns.executionAudit}, '{}'::jsonb), '{attempts}', coalesce(${agentRuns.executionAudit}->'attempts', '[]'::jsonb) || ${JSON.stringify([event])}::jsonb)`,
        ...(event.usage ? { inputTokens: event.usage.inputTokens, outputTokens: event.usage.outputTokens } : {})
      }).where(and(eq(agentRuns.id, runId), eq(agentRuns.tenantId, scope.tenantId)));
    }); } catch {
      const directory = process.env.IMEA_AUDIT_RECOVERY_DIR ?? join(process.cwd(), '.grok', 'verify-artifacts', 'provider-recovery');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, `${runId}-${event.attempt}-${event.state}.json`), JSON.stringify({ runId, ...scope, event }), { flag: 'wx', mode: 0o600 });
      throw new ExecutionError('AUDIT_UNAVAILABLE', 'Audit write failed; scoped recovery record retained, no further request permitted');
    }
  }

  async complete(runId: string, output: unknown, usage: ModelUsage): Promise<void> {
    const scope = this.runScopes.get(runId);
    if (!scope) return;
    await this.transactions.independent({ tenantId: scope.tenantId, actor: { type: 'agent', id: 'runner' }, correlationId: scope.correlationId }, async (tx) => {
      await tx.update(agentRuns).set({ status: 'succeeded', inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, ...(usage.costAmount === null ? {} : { costAmount: String(usage.costAmount) }), executionAudit: sql`jsonb_set(coalesce(${agentRuns.executionAudit}, '{}'::jsonb), '{validatedOutput}', ${JSON.stringify(output)}::jsonb)`, completedAt: new Date() }).where(eq(agentRuns.id, runId));
    });
  }

  async fail(runId: string, error: unknown): Promise<void> {
    const scope = this.runScopes.get(runId);
    if (!scope) return;
    const fields = errorFields(error);
    await this.transactions.independent({ tenantId: scope.tenantId, actor: { type: 'agent', id: 'runner' }, correlationId: scope.correlationId }, async (tx) => {
      await tx.update(agentRuns).set({ status: 'failed', errorCode: fields.code, errorMessage: fields.message, completedAt: new Date() }).where(eq(agentRuns.id, runId));
    });
  }
}
