import { createHash } from 'node:crypto';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { chromium } from 'playwright';
import type { Connector, ConnectorRequest, ConnectorResult } from './types.js';
import { ConnectorError } from './types.js';
import type { ObjectStorageConnector } from './storage.js';

function extract(html: string, url: string): { title: string; content: string; links: string[] } {
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  const links = [...dom.window.document.querySelectorAll('a[href]')].map((node) => (node as HTMLAnchorElement).href).filter(Boolean);
  return { title: article?.title ?? dom.window.document.title, content: article?.textContent ?? dom.window.document.body?.textContent ?? '', links: [...new Set(links)] };
}

export class BrowserConnector implements Connector {
  readonly type = 'browser';
  constructor(private readonly storage?: ObjectStorageConnector) {}

  async execute(request: ConnectorRequest): Promise<ConnectorResult> {
    if (!request.url) throw new ConnectorError('VALIDATION_ERROR', 'URL is required', false);
    const started = Date.now();
    let html: string;
    let httpStatus = 200;
    if (request.operation === 'fetch_rendered_page' || request.operation === 'capture_snapshot') {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({ locale: request.locale ?? 'en-US' });
        const response = await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        httpStatus = response?.status() ?? 0;
        html = await page.content();
      } finally {
        await browser.close();
      }
    } else {
      const response = await fetch(request.url, { redirect: 'follow', signal: AbortSignal.timeout(120_000), headers: { 'user-agent': 'IndustrialMarketEntryAgent/1.0 (+public-research)' } });
      httpStatus = response.status;
      if (!response.ok) throw new ConnectorError('SOURCE_FETCH_FAILED', `HTTP ${response.status} for ${request.url}`, response.status >= 500);
      html = await response.text();
    }
    const parsed = extract(html, request.url);
    const contentHash = createHash('sha256').update(html).digest('hex');
    const stored = this.storage ? await this.storage.put(request.tenantId, request.missionId, 'web', html, 'text/html') : undefined;
    return {
      success: true,
      items: [{ title: parsed.title, url: request.url, content: parsed.content, metadata: { httpStatus, contentHash, links: request.operation === 'extract_links' ? parsed.links : undefined } }],
      rawObjectKey: stored?.objectKey,
      costAmount: 0,
      durationMs: Date.now() - started,
    };
  }
}
