export interface DomainErrorOptions {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
  cause?: unknown;
}

export class DomainError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly retryable: boolean;
  override readonly cause?: unknown;

  constructor(options: DomainErrorOptions) {
    super(options.message);
    this.name = 'DomainError';
    this.code = options.code;
    this.details = options.details ?? {};
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;
  }
}

export class StateTransitionError extends DomainError {
  constructor(aggregate: string, from: string, to: string) {
    super({
      code: `${aggregate.toUpperCase()}_STATE_CONFLICT`,
      message: `Cannot transition ${aggregate} from ${from} to ${to}`,
      details: { aggregate, from, to },
    });
  }
}
