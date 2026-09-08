import { AgentRunner, ContextBuilder, deterministicAgentFixtures, MockModelProvider, OpenAIAgentsModelProvider, PromptRegistry, skillCatalog, ToolRegistry, type ModelProvider } from '@imea/agents';
import type { Environment } from '@imea/config';
import { BrowserConnector, CompanyWebsiteConnector, ContactVerificationConnector, createMockConnectorRegistry, DocumentConnector, ObjectStorageConnector, OpenAIEmbeddingProvider, OpenAIWebSearchConnector, SocialPublicSearchConnector, TenderSearchConnector, WebSearchConnector, type Connector } from '@imea/connectors';
import { AgentContextRepository, type Database } from '@imea/database';
import { DatabaseRunStore } from './run-store.js';

export interface AgentFactoryResult { runner: AgentRunner; storage: ObjectStorageConnector; connectors: ReadonlyMap<string, Connector> }

export function createAgentRuntime(env: Environment, db: Database): AgentFactoryResult {
  const storage = new ObjectStorageConnector({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION, bucket: env.S3_BUCKET, accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY, forcePathStyle: env.S3_FORCE_PATH_STYLE });
  let connectors: ReadonlyMap<string, Connector>;
  if (env.MOCK_CONNECTORS) {
    connectors = createMockConnectorRegistry();
  } else {
    const browser = new BrowserConnector(storage);
    const search = env.OPENAI_API_KEY
      ? new OpenAIWebSearchConnector(env.OPENAI_API_KEY, env.OPENAI_MODEL_RESEARCH, browser, env.OPENAI_BASE_URL)
      : env.TAVILY_API_KEY
        ? new WebSearchConnector(env.TAVILY_API_KEY)
        : undefined;
    if (!search) throw new Error('OPENAI_API_KEY is required for the BM1 live research runtime');
    connectors = new Map<string, Connector>([
      ['web_search', search], ['tender_search', new TenderSearchConnector(search)], ['social_public_search', new SocialPublicSearchConnector(search)],
      ['browser', browser], ['company_website', new CompanyWebsiteConnector(browser)],
      ['document', new DocumentConnector(storage, env.OPENAI_API_KEY ? new OpenAIEmbeddingProvider(env.OPENAI_API_KEY, 'text-embedding-3-small', env.OPENAI_BASE_URL) : undefined)], ['contact_verification', new ContactVerificationConnector()],
    ]);
  }
  const model: ModelProvider = env.MOCK_MODEL_PROVIDER ? new MockModelProvider(deterministicAgentFixtures) : new OpenAIAgentsModelProvider(env.OPENAI_API_KEY, env.OPENAI_BASE_URL);
  const modelNames = env.MOCK_MODEL_PROVIDER ? 'mock-deterministic-v1' : { research: env.OPENAI_MODEL_RESEARCH, extraction: env.OPENAI_MODEL_EXTRACTION, writing: env.OPENAI_MODEL_WRITING };
  const runner = new AgentRunner(model, modelNames, new ToolRegistry(connectors), new PromptRegistry(), new ContextBuilder(new AgentContextRepository(db)), new DatabaseRunStore(db, model.name, storage), skillCatalog);
  return { runner, storage, connectors };
}
