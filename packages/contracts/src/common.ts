import { z } from 'zod';

export const uuidSchema = z.uuid();
export const timestampSchema = z.iso.datetime({ offset: true });
export const confidenceSchema = z.number().int().min(0).max(100);
export const scoreSchema = confidenceSchema;

export const actorRefSchema = z.object({
  type: z.enum(['user', 'agent', 'system']),
  id: z.string().min(1).optional(),
});

export type ActorRef = z.infer<typeof actorRefSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface ApiMeta {
  requestId: string;
  timestamp: string;
}

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: ApiMeta & { page: number; pageSize: number; total: number };
}

export interface ApiErrorResponse {
  error: { code: string; message: string; details?: Record<string, unknown>; retryable: boolean; requestId: string };
  meta: ApiMeta;
}

export const evidenceReferenceSchema = z.object({
  evidenceItemId: uuidSchema,
  sourceId: uuidSchema,
  sourceSnapshotId: uuidSchema,
  excerpt: z.string().min(1),
  locator: z.record(z.string(), z.unknown()),
  stance: z.enum(['support', 'oppose', 'context']),
});

export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;
