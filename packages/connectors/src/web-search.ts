import { tavily } from '@tavily/core';
import type { Connector, ConnectorRequest, ConnectorResult } from './types.js';
import { ConnectorError } from './types.js';
import type { BrowserConnector } from './browser.js';

const allowedOperations = new Set(['search', 'search_news', 'search_domain', 'search_people', 'search_tenders', 'search_exhibitions']);

export class WebSearchConnector implements Connector {
  readonly type = 'web_search';
  private readonly client: ReturnType<typeof tavily>;

  constructor(apiKey: string) {
    this.client = tavily({ apiKey });
  }

  async execute(request: ConnectorRequest): Promise<ConnectorResult> {
    if (!allowedOperations.has(request.operation)) throw new ConnectorError('CONNECTOR_OPERATION_INVALID', `Unsupported search operation: ${request.operation}`, false);
    if (!request.query) throw new ConnectorError('VALIDATION_ERROR', 'Search query is required', false);
    const started = Date.now();
    try {
      const response = await this.client.search(request.query, {
        topic: request.operation === 'search_news' ? 'news' : 'general',
        searchDepth: 'advanced',
        maxResults: Number(request.options?.maxResults ?? 10),
        includeAnswer: false,
        includeRawContent: false,
      });
      return {
        success: true,
        items: response.results.map((item) => ({
          title: item.title,
          url: item.url,
          content: item.content,
          metadata: { score: item.score, publishedAt: item.publishedDate, query: request.query, domain: new URL(item.url).hostname },
        })),
        costAmount: 0,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      throw new ConnectorError('CONNECTOR_UNAVAILABLE', error instanceof Error ? error.message : 'Search failed', true, { operation: request.operation });
    }
  }
}

interface OpenAIResponseSource { url?: string; title?: string; type?: string }
interface OpenAIResponsePayload {
  id?: string;
  output?: Array<{
    type?: string;
    action?: { sources?: OpenAIResponseSource[] };
    content?: Array<{ annotations?: Array<{ type?: string; url?: string; title?: string }> }>;
  }>;
  error?: { message?: string };
}

function sourceUrls(payload: OpenAIResponsePayload): OpenAIResponseSource[] {
  const found: OpenAIResponseSource[] = [];
  for (const output of payload.output ?? []) {
    for (const source of output.action?.sources ?? []) if (source.url) found.push(source);
    for (const content of output.content ?? []) for (const annotation of content.annotations ?? []) if (annotation.url) found.push({ url: annotation.url, ...(annotation.title ? { title: annotation.title } : {}), ...(annotation.type ? { type: annotation.type } : {}) });
  }
  const unique = new Map<string, OpenAIResponseSource>();
  for (const source of found) if (source.url && !unique.has(source.url)) unique.set(source.url, source);
  return [...unique.values()];
}

export class OpenAIWebSearchConnector implements Connector {
  readonly type = 'web_search';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly browser: BrowserConnector,
    private readonly baseURL = 'https://api.openai.com/v1',
  ) {}

  async execute(request: ConnectorRequest): Promise<ConnectorResult> {
    if (!allowedOperations.has(request.operation)) throw new ConnectorError('CONNECTOR_OPERATION_INVALID', `Unsupported search operation: ${request.operation}`, false);
    if (!request.query) throw new ConnectorError('VALIDATION_ERROR', 'Search query is required', false);
    const started = Date.now();
    const maxResults = Math.max(1, Math.min(20, Number(request.options?.maxResults ?? 10)));
    const focus = request.operation === 'search_news' ? 'recent public news' : request.operation === 'search_people' ? 'public professional and organization pages' : request.operation === 'search_tenders' ? 'official tender and supplier-registration sources' : request.operation === 'search_exhibitions' ? 'official exhibition and association sources' : 'authoritative public business sources';
    let response: Response;
    try {
      response = await fetch(`${this.baseURL.replace(/\/+$/, '')}/responses`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          input: `Find up to ${maxResults} ${focus} for this industrial market-entry research question. Return sources that directly support the answer. Query: ${request.query}`,
          tools: [{ type: 'web_search', search_context_size: 'high' }],
          tool_choice: { type: 'web_search' },
          include: ['web_search_call.action.sources'],
          max_output_tokens: 2_000,
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      throw new ConnectorError('CONNECTOR_UNAVAILABLE', error instanceof Error ? error.message : 'OpenAI Web Search failed', true, { operation: request.operation });
    }
    const payload = await response.json() as OpenAIResponsePayload;
    if (!response.ok) throw new ConnectorError('CONNECTOR_UNAVAILABLE', payload.error?.message ?? `OpenAI Web Search returned HTTP ${response.status}`, response.status >= 500 || response.status === 429, { operation: request.operation, status: response.status });
    const sources = sourceUrls(payload).slice(0, maxResults);
    const items = [] as ConnectorResult['items'];
    for (const source of sources) {
      if (!source.url) continue;
      try {
        const fetched = await this.browser.execute({ tenantId: request.tenantId, missionId: request.missionId, operation: 'fetch_page', url: source.url, ...(request.locale ? { locale: request.locale } : {}), ...(request.countryCode ? { countryCode: request.countryCode } : {}) });
        const item = fetched.items[0];
        if (!item) continue;
        const host = new URL(source.url).hostname.toLowerCase().replace(/^www\./, '');
        items.push({
          ...(item.title ?? source.title ? { title: item.title ?? source.title } : {}),
          url: source.url,
          content: item.content,
          metadata: { ...item.metadata, objectKey: fetched.rawObjectKey, sourceType: source.type === 'computer_initialize_state' ? 'search_result' : source.type ?? 'search_result', authority: 'general_public_web', independentGroupKey: host, query: request.query, responseId: payload.id, fetchedAt: new Date().toISOString() },
        });
      } catch (error) {
        const host = new URL(source.url).hostname.toLowerCase().replace(/^www\./, '');
        items.push({ ...(source.title ? { title: source.title } : {}), url: source.url, content: source.title ?? source.url, metadata: { sourceType: 'search_result', authority: 'general_public_web', independentGroupKey: host, query: request.query, responseId: payload.id, fetchError: error instanceof Error ? error.message : String(error) } });
      }
    }
    if (items.length === 0) throw new ConnectorError('CONNECTOR_EMPTY_RESULT', 'OpenAI Web Search returned no usable public sources', true, { operation: request.operation });
    return { success: true, items, costAmount: 0, durationMs: Date.now() - started };
  }
}
