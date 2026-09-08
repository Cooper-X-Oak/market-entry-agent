export type ExecutionErrorCode = 'PROVIDER_TRANSIENT' | 'PROVIDER_CONFIG' | 'OUTPUT_INVALID' |
  'EVIDENCE_INVALID' | 'INPUT_MISSING' | 'PROVIDER_TIMEOUT' | 'EXECUTION_CANCELLED' | 'AUDIT_UNAVAILABLE';

export class ExecutionError extends Error {
  constructor(readonly code: ExecutionErrorCode, message: string, readonly retryAfterMs = 0) {
    super(message); this.name = code;
  }
}

export function classifyExecutionError(error: unknown): ExecutionError {
  if (error instanceof ExecutionError) return error;
  const value = error as { name?: string; status?: number; headers?: { get?(key: string): string | null } } | null;
  if (value?.name === 'ZodError') {
    const issues = (error as { issues?: Array<{ path?: unknown; code?: string; message?: string }> }).issues ?? [];
    return new ExecutionError('OUTPUT_INVALID', `Response rejected by original business schema: ${JSON.stringify(issues.map(({ path, code, message }) => ({ path, code, message })))}`);
  }
  if (value?.name === 'SyntaxError') return new ExecutionError('OUTPUT_INVALID', 'Response is not valid JSON');
  if (value?.name === 'AbortError' || value?.name === 'APIUserAbortError') return new ExecutionError('EXECUTION_CANCELLED', 'Client request aborted; server completion unknown');
  if (value?.name === 'TimeoutError' || value?.name === 'APIConnectionTimeoutError') return new ExecutionError('PROVIDER_TIMEOUT', 'Provider deadline exceeded; server completion unknown');
  if (value?.status === 429 || (value?.status !== undefined && value.status >= 500) || value?.name === 'APIConnectionError') {
    const header = value?.headers?.get?.('retry-after');
    const delay = header ? (/^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 0;
    return new ExecutionError('PROVIDER_TRANSIENT', 'Temporary Provider failure', Number.isFinite(delay) ? Math.max(0, delay) : 0);
  }
  return new ExecutionError('PROVIDER_CONFIG', 'Provider request rejected; inspect private diagnostic evidence');
}
