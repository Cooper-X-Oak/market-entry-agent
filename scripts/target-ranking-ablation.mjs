import { createRequire } from 'node:module';
import { readFile, open } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MODEL = 'gpt-6-astra';
const ARM_TIMEOUT_MS = 300_000;
const clone = (value) => structuredClone(value);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const scopes = new AsyncLocalStorage();
const nativeFetch = globalThis.fetch;
let schemaTransport = 'sdk-zod', makeOutputSchema = (schema) => schema, activeController, interrupted = false;
process.on('SIGTERM', () => { interrupted = true; activeController?.abort(new DOMException('Experiment interrupted', 'AbortError')); });
// Dependency diagnostics can include URLs or page contents; the CLI emits its own bounded progress.
for (const method of ['log', 'info', 'warn', 'error', 'debug']) console[method] = () => {};
const secrets = [process.env.OPENAI_API_KEY, process.env.OPENAI_BASE_URL].filter((value) => value?.length > 6);
const safeError = (error) => {
  const names = ['Error', 'UserError', 'TypeError', 'RangeError', 'SyntaxError', 'ZodError', 'ConnectorError', 'AbortError', 'TimeoutError', 'APIError', 'APIConnectionError', 'APIConnectionTimeoutError', 'RateLimitError', 'AuthenticationError'];
  const result = { name: names.includes(error?.name) ? error.name : 'Error' };
  const status = error?.status ?? error?.details?.status;
  if (Number.isInteger(status) && status >= 100 && status <= 599) result.status = status;
  if (typeof error?.code === 'string' && /^(CONNECTOR_[A-Z_]+|SOURCE_FETCH_FAILED|VALIDATION_ERROR|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EEXIST|ENOENT|ABORT_ERR)$/.test(error.code)) result.code = error.code;
  for (const code of ['AGENT_EVIDENCE_INSUFFICIENT', 'AGENT_OUTPUT_INVALID']) if (typeof error?.message === 'string' && error.message.startsWith(code + ':')) result.code = code;
  if (error?.name === 'UserError' && error.message?.includes('Unable to convert')) result.code = 'OUTPUT_SCHEMA_CONVERSION_FAILED';
  if (error?.name === 'ZodError') result.issues = error.issues?.map((issue) => ({ code: issue.code, path: issue.path }));
  return result;
};
function redact(value) {
  if (typeof value === 'string') return secrets.reduce((text, secret) => text.replaceAll(secret, '[REDACTED]'), value);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
  return value;
}
function uuid(value) { const h = sha(value); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; }
function check(condition) { if (!condition) throw new RangeError('Invalid experiment configuration'); }
function website(value) { try { const url = new URL(value); return `${url.hostname.replace(/^www\./, '').toLowerCase()}${url.pathname.replace(/\/+$/, '')}`; } catch { return ''; } }
const name = (value) => String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const sourceTypes = new Set(['company_website', 'product_page', 'case_study', 'certification_page', 'contact_page', 'search_result', 'tender_notice', 'award_notice', 'registry_record', 'association_page', 'exhibition_page', 'social_public_page', 'industry_article', 'expert_content', 'interaction_record', 'uploaded_document']);

// Observe only this process. Add cancellation and record safe response fields without changing prompts.
globalThis.fetch = async (resource, options = {}) => {
  const scope = scopes.getStore();
  if (!scope) return nativeFetch(resource, options);
  scope.controller.signal.throwIfAborted();
  const address = typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource.url;
  const providerRequest = address.startsWith(scope.providerBase + '/');
  const signal = AbortSignal.any([scope.controller.signal, ...(options.signal ? [options.signal] : []), ...(resource instanceof Request ? [resource.signal] : [])]);
  const headers = new Headers(resource instanceof Request ? resource.headers : undefined);
  new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  // Suppress SDK retry attempts while leaving the first request and AgentRunner unchanged.
  if (providerRequest && Number(headers.get('x-stainless-retry-count') ?? 0) > 0) throw new Error('Retry disabled');
  const record = { phase: scope.phase, kind: providerRequest ? 'provider' : 'public_page', elapsedMs: 0 };
  scope.network.push(record);
  const started = Date.now();
  try {
    const response = await nativeFetch(resource, { ...options, signal });
    record.status = response.status;
    if (providerRequest && response.ok && response.headers.get('content-type')?.includes('application/json')) {
      try {
        const payload = await response.clone().json();
        record.usage = payload.usage ?? null;
        if (scope.phase === 'model') scope.rawResponses.push({ output: payload.output ?? payload.choices ?? null, usage: payload.usage ?? null });
      } catch { record.responseCapture = 'unavailable'; }
    }
    return response;
  } catch (error) { record.error = safeError(error); throw error; }
  finally { record.elapsedMs = Date.now() - started; }
};

function references(value, result = []) {
  if (Array.isArray(value)) { for (const item of value) references(item, result); }
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    if (['evidenceRefs', 'supportingEvidenceRefs', 'contactEvidenceRefs', 'employmentEvidenceRefs'].includes(key) && Array.isArray(item)) result.push(...item.filter((id) => typeof id === 'string'));
    else if (key === 'sourceRef' && typeof item === 'string') result.push(item);
    else references(item, result);
  }
  return result;
}
function structuralChecks(output, context, added, candidates) {
  const targets = output?.result?.targets ?? [];
  const visible = new Set(context?.structured?.evidence.map((item) => item.evidenceId) ?? []);
  const allowed = new Set(context?.evidenceIds ?? []), newIds = new Set(added.map((item) => item.evidenceId));
  const refs = references(output), names = new Set(candidates.map((item) => name(item.name)));
  const sites = new Set(candidates.map((item) => website(item.website)).filter(Boolean));
  return {
    targetCount: targets.length, originalOrderDescending: targets.every((item, index) => index === 0 || targets[index - 1].finalScore >= item.finalScore),
    ranking: [...targets].sort((a, b) => b.finalScore - a.finalScore).map((item) => ({ organizationName: item.organizationName, website: item.website, finalScore: item.finalScore, evidenceRefs: item.evidenceRefs })),
    outsideCandidateOrganizationCount: targets.filter((item) => !names.has(name(item.organizationName))).length,
    outsideCandidateWebsiteCount: targets.filter((item) => item.website && !sites.has(website(item.website))).length,
    outsideCandidateTargetCount: targets.filter((item) => !names.has(name(item.organizationName)) && !sites.has(website(item.website))).length,
    missingEvidenceReferenceCount: refs.filter((id) => !allowed.has(id)).length,
    referenceNotVisibleInPromptCount: refs.filter((id) => !visible.has(id)).length,
    newEvidenceReferenceHitCount: refs.filter((id) => newIds.has(id)).length,
    uniqueNewEvidenceReferenced: [...new Set(refs.filter((id) => newIds.has(id)))],
    evidenceSupportReview: 'pending', businessValidityReview: 'pending',
  };
}

async function runArm(testCase, arm, round, cache, modules) {
  const { agents: A, connectors: C, contracts: K } = modules;
  const input = clone(testCase.input), baseline = clone(testCase.context);
  const rows = new Map(baseline.evidence.map((item, index) => [item.evidenceId, { item, order: baseline.evidence.length - index }]));
  const baselineIds = new Set(rows.keys()), added = [], toolLogs = [];
  const result = { caseKey: testCase.key, arm, round, success: false, runnerSuccess: false, toolLogs, addedEvidence: added, context: null, rawModelOutput: null, usage: null, structuralChecks: null };
  const scope = { controller: new AbortController(), phase: 'search', providerBase: (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, ''), network: [], rawResponses: [] };
  activeController = scope.controller;
  const browser = new C.BrowserConnector();
  const search = new C.OpenAIWebSearchConnector(process.env.OPENAI_API_KEY, MODEL, browser, scope.providerBase);
  let order = baseline.evidence.length, closed = false;
  const store = {
    async start(task, skillKey, modelName, promptVersion) { return { id: randomUUID(), input: task, skillKey, modelName, promptVersion }; },
    async toolStarted(_runId, connectorType, request) { if (closed) throw new Error('Closed'); const id = randomUUID(); toolLogs.push({ id, connectorType, request: clone(request), status: 'running', started: Date.now() }); return id; },
    async toolCompleted(id, response) {
      if (closed) return;
      const log = toolLogs.find((item) => item.id === id); Object.assign(log, { status: 'succeeded', result: { ...clone(response), costAmount: null }, elapsedMs: Date.now() - log.started });
      for (const item of response.evidence ?? []) {
        const source = item.source, snapshot = item.snapshot, evidence = item.evidence;
        const sourceKey = source.normalizedUrl ?? source.url ?? `urn:imea:evidence:${snapshot.contentHash}`;
        const sourceId = uuid(`${input.missionId}:source:${sourceKey}`);
        const mapped = K.evidenceContextSchema.parse({ evidenceId: item.evidenceId, sourceId, sourceSnapshotId: uuid(`${sourceId}:${snapshot.contentHash}`), sourceType: sourceTypes.has(source.sourceType) ? source.sourceType : 'search_result',
          url: source.url, normalizedUrl: source.normalizedUrl, publisher: source.publisher, publishedAt: source.publishedAt, fetchedAt: snapshot.fetchedAt, contentHash: snapshot.contentHash,
          excerpt: evidence.excerpt, locator: evidence.locator, stance: evidence.stance, authority: source.authority, independentGroupKey: source.independentGroupKey,
          subjectEntityId: evidence.subjectEntityId, freshness: evidence.freshness, relevance: evidence.relevance });
        if (!rows.has(mapped.evidenceId)) { rows.set(mapped.evidenceId, { item: mapped, order: ++order }); if (!baselineIds.has(mapped.evidenceId)) added.push(mapped); }
      }
    },
    async toolFailed(id, error) { if (!closed) { const log = toolLogs.find((item) => item.id === id); Object.assign(log, { status: 'failed', error: safeError(error), elapsedMs: Date.now() - log.started }); } },
    async contextReady(_id, context) { if (!closed) result.context = clone(context); },
    async complete() { if (!closed) result.runnerSuccess = true; },
    async fail(_id, error) { if (!closed) result.error = safeError(error); },
  };
  const repository = { async load() {
    const linked = new Set([...baseline.claims.flatMap((item) => item.evidenceRefs), ...baseline.contacts.flatMap((item) => [...item.contactEvidenceRefs, ...item.employmentEvidenceRefs])]);
    const evidence = [...rows.values()].sort((a, b) => b.order - a.order).slice(0, 240).sort((a, b) => Number(linked.has(b.item.evidenceId)) - Number(linked.has(a.item.evidenceId)) || b.order - a.order).map((row) => row.item);
    return K.agentExecutionContextSchema.parse({ ...clone(baseline), evidence: clone(evidence) });
  } };
  const connector = { type: 'web_search', async execute(request) {
    check(arm === 'search' && request.operation === 'search' && Number(request.options?.maxResults) <= 4);
    scope.phase = 'search'; const key = JSON.stringify(request), log = toolLogs.at(-1);
    if (cache.entries.has(key)) { const entry = cache.entries.get(key); log.cache = 'replay'; if (entry.error) throw Object.assign(new Error('Cached failure'), entry.error); return clone(entry.result); }
    check(!cache.sealed); log.cache = 'live';
    try {
      const response = await search.execute(request);
      for (const item of response.items) {
        item.metadata.fetchedAt ??= new Date().toISOString();
        if (item.metadata.fetchError) { delete item.metadata.fetchError; item.metadata.fetchFailure = { name: 'SourceFetchError' }; }
      }
      // Cache raw connector results so the unchanged AgentRunner enriches evidence exactly once.
      cache.entries.set(key, { result: clone(response) }); return clone(response);
    } catch (error) { cache.entries.set(key, { error: safeError(error) }); throw error; }
  } };
  const provider = new A.OpenAIAgentsModelProvider(process.env.OPENAI_API_KEY, scope.providerBase);
  const wrappedProvider = { name: provider.name, async generate(request) {
    if (closed) throw new Error('Closed'); scope.phase = 'model'; const started = Date.now();
    try { const response = await provider.generate({ ...request, outputSchema: makeOutputSchema(request.outputSchema) }); if (!closed) { result.rawModelOutput = clone(response.output); result.usage = { ...response.usage, costAmount: null, pricingStatus: 'provider_does_not_price_usage' }; } return response; }
    finally { if (!closed) result.modelElapsedMs = Date.now() - started; }
  } };
  const skill = arm === 'search' ? A.targetRankerSkill : { ...A.targetRankerSkill, planQueries: () => [] };
  const runner = new A.AgentRunner(wrappedProvider, MODEL, new A.ToolRegistry(new Map([['web_search', connector]])), new A.PromptRegistry(), new A.ContextBuilder(repository), store, [skill]);
  const started = Date.now(); let timer;
  process.stderr.write(`${testCase.key} ${arm} ${round} started\n`);
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { const error = new DOMException('Arm deadline', 'TimeoutError'); scope.controller.abort(error); reject(error); }, ARM_TIMEOUT_MS); });
    await Promise.race([scopes.run(scope, () => runner.execute(input)), timeout]);
    result.success = result.runnerSuccess && toolLogs.every((item) => item.status === 'succeeded');
  } catch (error) { result.error = safeError(error); }
  finally {
    clearTimeout(timer); closed = true; scope.controller.abort(); activeController = undefined;
    if (arm === 'search') cache.sealed = true;
    for (const log of toolLogs) { if (log.status === 'running') { log.status = 'interrupted'; log.elapsedMs = Date.now() - log.started; } delete log.started; }
    result.elapsedMs = Date.now() - started;
    result.network = clone(scope.network); result.rawProviderResponses = clone(scope.rawResponses);
    result.externalSearchCalls = scope.network.filter((item) => item.phase === 'search' && item.kind === 'provider').length;
    result.publicPageFetches = scope.network.filter((item) => item.kind === 'public_page').length;
    result.modelHttpRequests = scope.network.filter((item) => item.phase === 'model' && item.kind === 'provider').length;
    result.searchElapsedMs = scope.network.filter((item) => item.phase === 'search').reduce((sum, item) => sum + item.elapsedMs, 0);
    result.costAmount = null;
    result.structuralChecks = structuralChecks(result.rawModelOutput, result.context, added, testCase.candidates);
    process.stderr.write(`${testCase.key} ${arm} ${round} ${result.success ? 'completed' : 'failed'}\n`);
  }
  return clone(result);
}

const report = { schemaVersion: 1, model: MODEL, success: false, results: [], manualReview: { evidenceSupport: 'pending', businessValidity: 'pending' }, limits: { repeats: [1, 3], maxCases: 5, maxQueriesPerCase: 3, maxSourcesPerQuery: 4, armTimeoutMs: ARM_TIMEOUT_MS }, costAmount: null };
let outputHandle, stdio = false, jsonl = false;
async function writeRecord(record) {
  const line = JSON.stringify(redact(record)) + '\n';
  if (outputHandle) { await outputHandle.writeFile(line); await outputHandle.sync(); }
  else if (stdio) await new Promise((resolve, reject) => process.stdout.write(line, (error) => error ? reject(error) : resolve()));
}
try {
  const args = process.argv.slice(2); let inputPath, outputPath;
  for (let i = 0; i < args.length; i++) { if (args[i] === '--stdio') stdio = true; else if (args[i] === '--jsonl') jsonl = true; else if (args[i] === '--input') inputPath = args[++i]; else if (args[i] === '--output') outputPath = args[++i]; else if (args[i] === '--schema-transport') schemaTransport = args[++i]; else check(false); }
  check(['sdk-zod', 'json-schema-nonstrict'].includes(schemaTransport));
  check(stdio ? !inputPath && !outputPath : Boolean(inputPath && outputPath));
  if (!stdio) outputHandle = await open(path.resolve(outputPath), 'wx');
  const text = stdio ? await (async () => { let text = ''; for await (const chunk of process.stdin) { text += chunk; check(Buffer.byteLength(text) <= 10_000_000); } return text; })() : await readFile(path.resolve(inputPath), 'utf8');
  check(Buffer.byteLength(text) <= 10_000_000); const input = JSON.parse(text);
  check(input.schemaVersion === 1 && input.model === MODEL && Number.isInteger(input.repeats) && input.repeats >= 1 && input.repeats <= 3 && Array.isArray(input.cases) && input.cases.length >= 1 && input.cases.length <= 5);
  const require = createRequire(path.join(process.cwd(), 'apps/worker/package.json'));
  const [agents, connectors, contracts] = await Promise.all(['@imea/agents', '@imea/connectors', '@imea/contracts'].map((item) => import(pathToFileURL(require.resolve(item)).href)));
  if (schemaTransport === 'json-schema-nonstrict') {
    const packageRequire = createRequire(require.resolve('@imea/contracts'));
    const { z } = await import(pathToFileURL(packageRequire.resolve('zod')).href);
    const schema = z.toJSONSchema(agents.targetRankerSkill.outputSchema, { target: 'draft-7', io: 'input' });
    // Experiment-only transport facade; the existing provider still calls the original Zod parser.
    // Never spread a Zod object here: its markers would re-enable the SDK's strict conversion.
    makeOutputSchema = (original) => Object.defineProperty({ type: 'json_schema', name: 'target_ranking', strict: false, schema }, 'parse', { enumerable: false, value: (value) => original.parse(value) });
    report.transportSchemaHash = sha(JSON.stringify(schema));
    report.transportCompatibility = { mode: 'explicit-json-schema', strict: false, runtimeValidation: 'original-zod-schema', appliedEquallyToBothArms: true, productionProviderChanged: false };
  }
  const cases = input.cases.map((item) => {
    check(typeof item.key === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(item.key));
    const task = contracts.agentTaskInputSchema.strict().parse(item.input), context = contracts.agentExecutionContextSchema.strict().parse(item.context);
    check(task.skillKey === 'target_ranker' && task.tenantId === context.scope.tenantId && task.missionId === context.scope.missionId && task.missionId === context.mission.id);
    check(Array.isArray(item.candidates) && item.candidates.length > 0 && item.candidates.every((candidate) => typeof candidate.name === 'string' && candidate.name.trim() && (!candidate.website || website(candidate.website))));
    const queries = agents.targetRankerSkill.planQueries(task);
    check(queries.length === 3 && queries.every((query) => query.operation === 'search' && Number(query.options?.maxResults) <= 4));
    return { key: item.key, input: task, context, candidates: clone(item.candidates) };
  });
  check(new Set(cases.map((item) => item.key)).size === cases.length && Boolean(process.env.OPENAI_API_KEY));
  report.repeats = input.repeats; report.inputSnapshotHash = sha(text); report.schemaTransport = schemaTransport;
  report.method = { changedField: 'targetRankerSkill.planQueries', contextPath: 'ContextBuilder.repository', cache: 'first search arm per case; later arms replay identical results including failures', rawModelOutputBoundary: 'provider structured output before AgentRunner evidence validation; raw HTTP output captured when available', pricingStatus: 'unpriced; token usage and external requests reported separately', sdkRetryPolicy: 'no script retries; SDK requests carrying a positive retry count are blocked', evidenceOrder: 'snapshot evidence order approximates createdAt; latest 240 then linked claims and contacts first', persistence: 'memory only; no database or object storage clients' };
  experiment: for (let index = 0; index < cases.length; index++) {
    const testCase = cases[index], cache = { entries: new Map(), sealed: false };
    for (let round = 1; round <= input.repeats; round++) for (const arm of (index + round) % 2 ? ['no-search', 'search'] : ['search', 'no-search']) {
      if (interrupted) break experiment;
      try { report.results.push(await runArm(testCase, arm, round, cache, { agents, connectors, contracts })); }
      catch (error) { report.results.push({ caseKey: testCase.key, arm, round, success: false, error: safeError(error) }); }
      if (jsonl) await writeRecord({ event: 'arm', inputSnapshotHash: report.inputSnapshotHash, schemaTransport, result: report.results.at(-1) });
      // Check real output compatibility before spending on search; preserve the failed arm and stop.
      if (report.results.length === 1 && !report.results[0].rawModelOutput) { report.stopReason = 'initial_model_output_unavailable'; break experiment; }
      if (report.results.at(-1).error?.name === 'TimeoutError') { report.stopReason = 'arm_timeout_requires_review'; break experiment; }
    }
  }
  report.interrupted = interrupted; report.expectedResults = cases.length * input.repeats * 2;
  report.success = !interrupted && report.results.length === report.expectedResults && report.results.every((item) => item.success);
} catch (error) { report.error = safeError(error); }
finally {
  if (jsonl) {
    try { await writeRecord({ event: 'final', report }); await outputHandle?.close(); }
    catch (error) { report.success = false; process.stderr.write(JSON.stringify({ success: false, error: safeError(error) }) + '\n'); }
    process.exit(report.success ? 0 : 1);
  }
  const serialized = JSON.stringify(redact(report), null, 2) + '\n';
  if (outputHandle) { try { await outputHandle.writeFile(serialized); await outputHandle.close(); } catch (error) { report.success = false; process.stderr.write(JSON.stringify({ success: false, error: safeError(error) }) + '\n'); } }
  else if (!stdio) process.stderr.write(JSON.stringify({ success: false, error: report.error ?? { name: 'Error' } }) + '\n');
  if (stdio) process.stdout.write(serialized, () => process.exit(report.success ? 0 : 1));
  else process.exit(report.success ? 0 : 1);
}
