import { tavily } from '@tavily/core';
import type { Connector, ConnectorRequest, ConnectorResult } from './types.js';
import { ConnectorError } from './types.js';

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
