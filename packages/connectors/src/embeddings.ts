import { ConnectorError } from './types.js';

export interface EmbeddingProvider {
  embed(inputs: string[]): Promise<number[][]>;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = 'text-embedding-3-small',
    private readonly baseURL = 'https://api.openai.com/v1',
  ) {}

  async embed(inputs: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseURL.replace(/\/+$/, '')}/embeddings`, { method: 'POST', headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: this.model, input: inputs }), signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new ConnectorError('CONNECTOR_UNAVAILABLE', `Embedding provider returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    const payload = await response.json() as { data: Array<{ index: number; embedding: number[] }> };
    return payload.data.sort((left, right) => left.index - right.index).map((item) => item.embedding);
  }
}
