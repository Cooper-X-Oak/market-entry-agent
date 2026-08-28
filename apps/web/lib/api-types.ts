export interface ApiFailure { code: string; message: string; details?: unknown }
export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiFailure };
