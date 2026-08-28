import { load } from 'cheerio';
import type { Connector, ConnectorRequest, ConnectorResult } from './types.js';
import { ConnectorError } from './types.js';
import type { BrowserConnector } from './browser.js';

const pagePatterns: Record<string, RegExp> = {
  discover_product_pages: /product|solution|catalog/i,
  discover_case_pages: /case|project|reference|application/i,
  discover_certification_pages: /certif|quality|compliance/i,
  discover_contact_pages: /contact|about|team|location/i,
};

export class CompanyWebsiteConnector implements Connector {
  readonly type = 'company_website';
  constructor(private readonly browser: BrowserConnector) {}

  async execute(request: ConnectorRequest): Promise<ConnectorResult> {
    if (!request.url) throw new ConnectorError('VALIDATION_ERROR', 'Company website URL is required', false);
    if (request.operation === 'crawl_selected_pages') {
      const urls = Array.isArray(request.options?.urls) ? request.options.urls.filter((item): item is string => typeof item === 'string') : [request.url];
      const results = await Promise.all(urls.map((url) => this.browser.execute({ ...request, url, operation: 'fetch_page' })));
      return { success: results.every((result) => result.success), items: results.flatMap((result) => result.items), costAmount: results.reduce((sum, result) => sum + result.costAmount, 0), durationMs: results.reduce((sum, result) => sum + result.durationMs, 0) };
    }
    const response = await fetch(request.url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new ConnectorError('SOURCE_FETCH_FAILED', `HTTP ${response.status}`, response.status >= 500);
    const html = await response.text();
    const $ = load(html);
    const pattern = pagePatterns[request.operation] ?? /.*/;
    const links = new Map<string, string>();
    $('a[href]').each((_index, element) => {
      const href = $(element).attr('href');
      const label = $(element).text().trim();
      if (!href) return;
      const resolved = new URL(href, request.url).toString();
      if (pattern.test(`${label} ${resolved}`) && new URL(resolved).hostname === new URL(request.url!).hostname) links.set(resolved, label);
    });
    return { success: true, items: [...links].map(([url, title]) => ({ title, url, metadata: { operation: request.operation } })), costAmount: 0, durationMs: 0 };
  }
}
