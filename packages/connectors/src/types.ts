export interface ConnectorRequest {
  tenantId: string;
  missionId: string;
  operation: string;
  query?: string;
  url?: string;
  locale?: string;
  countryCode?: string;
  options?: Record<string, unknown>;
}

export interface ConnectorItem {
  title?: string;
  url?: string;
  content?: string;
  metadata: Record<string, unknown>;
}

export interface CollectedEvidence {
  evidenceId: string;
  source: {
    sourceType: string;
    url?: string;
    normalizedUrl?: string;
    title?: string;
    publisher?: string;
    publishedAt?: string;
    authority: string;
    independentGroupKey: string;
  };
  snapshot: {
    fetchedAt: string;
    httpStatus?: number;
    contentHash: string;
    objectKey: string;
    extractedText?: string;
  };
  evidence: {
    excerpt: string;
    locator: Record<string, unknown>;
    stance: string;
    relevance: number;
    freshness: number;
    subjectEntityId?: string;
  };
}

export interface ConnectorResult {
  success: boolean;
  items: ConnectorItem[];
  evidence?: CollectedEvidence[];
  normalizedOutputs?: Array<Record<string, unknown>>;
  rawObjectKey?: string;
  costAmount: number;
  durationMs: number;
}

export interface EnrichedConnectorResult extends ConnectorResult {
  evidence: CollectedEvidence[];
  normalizedOutputs: Array<Record<string, unknown>>;
}

export interface Connector {
  readonly type: string;
  execute(request: ConnectorRequest): Promise<ConnectorResult>;
}

export class ConnectorError extends Error {
  constructor(readonly code: string, message: string, readonly retryable: boolean, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ConnectorError';
  }
}
