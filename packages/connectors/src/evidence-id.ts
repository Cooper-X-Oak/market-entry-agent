import { createHash } from 'node:crypto';
import type { CollectedEvidence, ConnectorItem, ConnectorResult, EnrichedConnectorResult } from './types.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function evidenceIdForItem(item: ConnectorItem, namespace = ''): string {
  const declared = item.metadata.evidenceId;
  if (!namespace && typeof declared === 'string' && uuidPattern.test(declared)) return declared;
  const hash = createHash('sha256').update(JSON.stringify({ namespace, declared: typeof declared === 'string' ? declared : '', title: item.title ?? '', url: item.url ?? '', content: item.content ?? '' })).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function collectedEvidence(item: ConnectorItem, evidenceId: string, rawObjectKey?: string): CollectedEvidence {
  const content = item.content ?? item.title ?? item.url ?? 'Collected evidence';
  const contentHash = createHash('sha256').update(content).digest('hex');
  const normalizedUrl = item.url ? new URL(item.url).toString() : undefined;
  const authority = typeof item.metadata.authority === 'string' ? item.metadata.authority : 'general_public_web';
  const independentGroupKey = typeof item.metadata.independentGroupKey === 'string'
    ? item.metadata.independentGroupKey
    : normalizedUrl ? new URL(normalizedUrl).hostname : `connector:${contentHash.slice(0, 16)}`;
  const fetchedAt = typeof item.metadata.fetchedAt === 'string'
    ? item.metadata.fetchedAt
    : item.metadata.fixture === true ? '2026-08-28T00:00:00.000Z' : new Date().toISOString();
  const itemObjectKey = typeof item.metadata.objectKey === 'string' ? item.metadata.objectKey : undefined;
  return {
    evidenceId,
    source: {
      sourceType: typeof item.metadata.sourceType === 'string' ? item.metadata.sourceType : 'search_result',
      ...(item.url ? { url: item.url, normalizedUrl } : {}),
      ...(item.title ? { title: item.title } : {}),
      ...(typeof item.metadata.publisher === 'string' ? { publisher: item.metadata.publisher } : {}),
      ...(typeof item.metadata.publishedAt === 'string' ? { publishedAt: item.metadata.publishedAt } : {}),
      authority,
      independentGroupKey,
    },
    snapshot: {
      fetchedAt,
      ...(typeof item.metadata.httpStatus === 'number' ? { httpStatus: item.metadata.httpStatus } : {}),
      contentHash,
      objectKey: itemObjectKey ?? rawObjectKey ?? `connector-inline/${contentHash}.json`,
      extractedText: content,
    },
    evidence: {
      excerpt: content.slice(0, 2_000),
      locator: typeof item.metadata.locator === 'object' && item.metadata.locator ? item.metadata.locator as Record<string, unknown> : { ...(item.url ? { url: item.url } : {}), contentHash },
      stance: typeof item.metadata.stance === 'string' ? item.metadata.stance : 'context',
      relevance: Math.max(0, Math.min(100, Math.round(Number(item.metadata.relevance ?? item.metadata.score ?? 80) * (Number(item.metadata.relevance ?? item.metadata.score ?? 80) <= 1 ? 100 : 1)))),
      freshness: Math.max(0, Math.min(100, Math.round(Number(item.metadata.freshness ?? 100)))),
      ...(typeof item.metadata.subjectEntityId === 'string' ? { subjectEntityId: item.metadata.subjectEntityId } : {}),
    },
  };
}

export function enrichConnectorEvidence(result: ConnectorResult, namespace = ''): EnrichedConnectorResult {
  const items = result.items.map((item) => ({ ...item, metadata: { ...item.metadata, evidenceId: evidenceIdForItem(item, namespace) } }));
  return {
    ...result,
    items,
    evidence: result.evidence ?? items.map((item) => collectedEvidence(item, String(item.metadata.evidenceId), result.rawObjectKey)),
    normalizedOutputs: result.normalizedOutputs ?? items.map((item) => ({ title: item.title, url: item.url, content: item.content, metadata: item.metadata })),
  };
}
