import { createHash } from 'node:crypto';
import officeParser from 'officeparser';
import type { Connector, ConnectorRequest, ConnectorResult } from './types.js';
import { ConnectorError } from './types.js';
import type { ObjectStorageConnector } from './storage.js';
import type { EmbeddingProvider } from './embeddings.js';

export class DocumentConnector implements Connector {
  readonly type = 'document';
  constructor(private readonly storage: ObjectStorageConnector, private readonly embeddings?: EmbeddingProvider) {}

  async execute(request: ConnectorRequest): Promise<ConnectorResult> {
    const objectKey = typeof request.options?.objectKey === 'string' ? request.options.objectKey : undefined;
    if (!objectKey) throw new ConnectorError('VALIDATION_ERROR', 'objectKey is required', false);
    const started = Date.now();
    const bytes = await this.storage.get(objectKey);
    const text = await officeParser.parseOfficeAsync(Buffer.from(bytes));
    if (request.operation === 'generate_embeddings') {
      if (!this.embeddings) throw new ConnectorError('CONNECTOR_UNAVAILABLE', 'Embedding provider is not configured', false);
      const chunkSize = Number(request.options?.chunkSize ?? 4_000);
      const chunks: string[] = [];
      for (let offset = 0; offset < text.length; offset += chunkSize) chunks.push(text.slice(offset, offset + chunkSize));
      const vectors = await this.embeddings.embed(chunks);
      return { success: true, items: chunks.map((content, index) => ({ content, metadata: { chunkIndex: index, embedding: vectors[index], dimensions: vectors[index]?.length ?? 0 } })), costAmount: 0, durationMs: Date.now() - started };
    }
    if (request.operation === 'split_chunks') {
      const chunkSize = Number(request.options?.chunkSize ?? 4_000);
      const chunks: string[] = [];
      for (let offset = 0; offset < text.length; offset += chunkSize) chunks.push(text.slice(offset, offset + chunkSize));
      return { success: true, items: chunks.map((content, index) => ({ content, metadata: { chunkIndex: index, tokenCount: Math.ceil(content.length / 4) } })), costAmount: 0, durationMs: Date.now() - started };
    }
    return { success: true, items: [{ content: text, metadata: { contentHash: createHash('sha256').update(bytes).digest('hex'), operation: request.operation } }], rawObjectKey: objectKey, costAmount: 0, durationMs: Date.now() - started };
  }
}
