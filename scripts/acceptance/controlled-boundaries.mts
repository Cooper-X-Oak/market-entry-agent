import { deterministicAgentFixtures, type ModelProvider, type ModelResult } from '@imea/agents';
import type { Connector } from '@imea/connectors';

/** Controlled external data only: application activities still create every business row. */
export const controlledProvider: ModelProvider = {
  name: 'controlled-acceptance',
  async generate<T>(input: Parameters<ModelProvider['generate']>[0]): Promise<ModelResult<T>> {
    const context = JSON.parse(input.prompt);
    const evidence = context.evidence ?? [];
    const primary = evidence.find((item: { url?: string }) => item.url?.includes('target-01.example'))?.evidenceId;
    const secondary = evidence.find((item: { url?: string }) => item.url?.includes('industry.example'))?.evidenceId;
    let output = JSON.parse(JSON.stringify(deterministicAgentFixtures.get(input.name)).replaceAll('Germany', 'Kazan').replaceAll('German', 'Kazan')) as { result: Record<string, unknown> };
    if (input.name === 'mission_compiler') output.result.knownFacts = [];
    if (input.name === 'ecosystem_mapper') { output.result.entities = (output.result.entities as unknown[]).slice(0, 3); output.result.relationships = []; }
    if (input.name === 'target_ranker') output.result.targets = (output.result.targets as unknown[]).slice(0, 3);
    if (input.name === 'contact_path_finder') output.result.contactPoints = [{ contactType: 'contact_form', value: 'https://target-01.example/contact', normalizedValue: 'https://target-01.example/contact', label: 'Public contact', isPublic: true, contactEvidenceRefs: [primary], employmentEvidenceRefs: [], sourceAuthority: 'official_organization', independentGroupKeys: ['target-01.example'], confidence: 90, recommendedRank: 1 }];
    if (input.name === 'action_card_builder') Object.assign(output.result, { channel: 'contact_form', contactReason: 'Controlled target lists industrial valves', valueHypothesis: 'Ask about procurement needs; commissioning party capabilities are unknown', emailBody: 'Please clarify your public procurement process. This is a research enquiry.', contactFormMessage: 'Please clarify your public procurement process. This is a research enquiry.' });
    const groundedStatements = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(groundedStatements);
      if (!value || typeof value !== 'object') return value;
      const object = value as Record<string, unknown>;
      if (object.countryCode === 'DE') { object.countryCode = 'RU'; object.city = 'Kazan'; }
      const refs = (object.evidenceRefs ?? object.supportingEvidenceRefs ?? []) as string[];
      const id = refs[0] === '00000000-0000-4000-8000-000000000102' ? secondary : primary;
      const text = evidence.find((item: { evidenceId: string }) => item.evidenceId === id)?.excerpt;
      return Object.fromEntries(Object.entries(object).map(([key, nested]) => [key, text && refs.length && ['rationale', 'hypothesis', 'relevanceReason', 'marketImplication', 'contactReason', 'description', 'marketPresenceSummary', 'positionSummary'].includes(key) && typeof nested === 'string' ? text : groundedStatements(nested)]));
    };
    output = groundedStatements(output) as typeof output;
    output = JSON.parse(JSON.stringify(output).replaceAll('00000000-0000-4000-8000-000000000101', primary ?? '').replaceAll('00000000-0000-4000-8000-000000000102', secondary ?? ''));
    const usage = { inputTokens: 0, outputTokens: 0, costAmount: 0 };
    await input.onAttempt?.({ attempt: 1, state: 'started', at: new Date().toISOString() });
    await input.onAttempt?.({ attempt: 1, state: 'succeeded', at: new Date().toISOString(), usage });
    return { output: input.outputSchema.parse(output) as T, usage };
  },
};
const connector: Connector = { type: 'controlled', async execute() {
  return { success: true, costAmount: 0, durationMs: 0, items: [
    { title: 'Controlled official target', url: 'https://target-01.example/contact', content: 'Fixture Industrial Target 01 GmbH is an industrial valve distributor in Kazan city. Public contact form: https://target-01.example/contact', metadata: { authority: 'official_organization', sourceType: 'contact_page' } },
    { title: 'Controlled independent source', url: 'https://industry.example/directory', content: 'Fixture Industrial Target 01 GmbH distributes industrial valves in Kazan city. Distributor, EPC and end-user procurement routes exist.', metadata: { authority: 'industry_directory' } },
  ] };
} };
export const controlledConnectors = new Map(['web_search', 'browser', 'tender_search', 'company_website', 'contact_verification', 'social_public_search'].map(key => [key, connector]));
