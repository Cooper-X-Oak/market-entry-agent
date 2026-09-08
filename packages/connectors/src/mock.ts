import type { Connector, ConnectorRequest, ConnectorResult } from './types.js';

const demoOrganizations = [
  ['RheinWerk Distribution GmbH', 'https://rheinwerk.example', 'distributor'],
  ['EuroChem Projects GmbH', 'https://eurochem-projects.example', 'epc'],
  ['NordWater Systems GmbH', 'https://nordwater.example', 'end_user'],
  ['IndustrieArmaturen Verband', 'https://iav.example', 'association'],
  ['ProcessTech Expo', 'https://processtech.example', 'exhibition'],
  ['VectorValve Europe GmbH', 'https://vectorvalve.example', 'competitor'],
] as const;
export class MockConnector implements Connector {
  readonly type = 'mock';
  execute(request: ConnectorRequest): Promise<ConnectorResult> {
    const started = Date.now();
    if (request.operation.includes('search') || request.operation.includes('discover')) {
      return Promise.resolve({ success: true, items: demoOrganizations.map(([title, url, role], index) => ({ title, url, content: `${title} is a fictional Germany-market ${role} fixture.`, metadata: { score: 0.95 - index * 0.05, role, query: request.query, fixture: true } })), costAmount: 0, durationMs: Date.now() - started });
    }
    if (request.operation.includes('contact') || request.operation.includes('verify')) {
      return Promise.resolve({ success: true, items: [{ title: 'Demo procurement contact', url: 'https://nordwater.example/supplier-registration', content: 'procurement@eurochem-projects.example', metadata: { score: 100, status: 'manually_confirmed', fixture: true } }], costAmount: 0, durationMs: Date.now() - started });
    }
    return Promise.resolve({ success: true, items: [{ title: 'Mock result', url: request.url, content: `Deterministic fixture for ${request.operation}`, metadata: { fixture: true } }], costAmount: 0, durationMs: Date.now() - started });
  }
}

export function createMockConnectorRegistry(): Map<string, Connector> {
  const mock = new MockConnector();
  return new Map(['web_search', 'browser', 'company_website', 'document', 'tender_search', 'social_public_search', 'contact_verification'].map((key) => [key, mock]));
}
