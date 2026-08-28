import type { Connector, ConnectorItem, ConnectorRequest, ConnectorResult } from './types.js';
import { ConnectorError } from './types.js';
import type { WebSearchConnector } from './web-search.js';

function field(content: string, pattern: RegExp): string | undefined {
  return content.match(pattern)?.[1]?.trim();
}

export class TenderSearchConnector implements Connector {
  readonly type = 'tender_search';
  constructor(private readonly search: WebSearchConnector) {}

  async execute(request: ConnectorRequest): Promise<ConnectorResult> {
    if (!request.query) throw new ConnectorError('VALIDATION_ERROR', 'Tender search query is required', false);
    const country = request.countryCode ?? 'target country';
    const locale = request.locale ?? 'en';
    const query = `${request.query} ${country} tender OR procurement OR supplier registration OR contract award lang:${locale}`;
    const result = await this.search.execute({ ...request, operation: 'search_tenders', query });
    return { ...result, items: result.items.map((item) => this.structure(item, country)) };
  }

  private structure(item: ConnectorItem, country: string): ConnectorItem {
    const content = item.content ?? '';
    return { ...item, metadata: { ...item.metadata, title: item.title, buyer: field(content, /(?:buyer|purchaser|contracting authority)[:\s]+([^.;\n]+)/i), agency: field(content, /(?:agency|authority)[:\s]+([^.;\n]+)/i), country, industry: field(content, /(?:industry|sector)[:\s]+([^.;\n]+)/i), published_at: item.metadata.publishedAt, deadline_at: field(content, /(?:deadline|closing date)[:\s]+([^.;\n]+)/i), project_value: field(content, /(?:value|budget)[:\s]+([^.;\n]+)/i), contact_text: field(content, /(?:contact|email)[:\s]+([^.;\n]+)/i), supplier_requirements: field(content, /(?:requirements?|eligibility)[:\s]+([^.;\n]+)/i), source_url: item.url } };
  }
}

export class SocialPublicSearchConnector implements Connector {
  readonly type = 'social_public_search';
  constructor(private readonly search: WebSearchConnector) {}

  async execute(request: ConnectorRequest): Promise<ConnectorResult> {
    if (!request.query) throw new ConnectorError('VALIDATION_ERROR', 'Public profile search query is required', false);
    const query = `${request.query} official company profile OR professional profile OR industry community`;
    const result = await this.search.execute({ ...request, operation: 'search_people', query });
    return { ...result, items: result.items.map((item) => { const content = item.content ?? ''; const domain = item.url ? new URL(item.url).hostname : ''; return { ...item, metadata: { ...item.metadata, person_name: field(content, /(?:name)[:\s]+([^.;\n]+)/i) ?? item.title, organization: field(content, /(?:company|organization)[:\s]+([^.;\n]+)/i), title: field(content, /(?:title|role|position)[:\s]+([^.;\n]+)/i), profile_url: item.url, platform: domain, last_seen_signal: item.metadata.publishedAt, public_contact_text: field(content, /(?:contact|email)[:\s]+([^.;\n]+)/i), source_url: item.url } }; }) };
  }
}
