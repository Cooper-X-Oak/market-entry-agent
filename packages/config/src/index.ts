import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_BASE_URL: z.url().default('http://localhost:3000'),
  API_BASE_URL: z.url().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_MIGRATOR_URL: z.string().min(1).optional(),
  DATABASE_API_URL: z.string().min(1).optional(),
  DATABASE_WORKER_URL: z.string().min(1).optional(),
  DATABASE_PROJECTOR_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  TEMPORAL_ADDRESS: z.string().default('localhost:7233'),
  TEMPORAL_NAMESPACE: z.string().default('default'),
  TEMPORAL_TASK_QUEUE_PREFIX: z.string().default('imea'),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanString,
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL_RESEARCH: z.string().default('gpt-5'),
  OPENAI_MODEL_EXTRACTION: z.string().default('gpt-5-mini'),
  OPENAI_MODEL_WRITING: z.string().default('gpt-5-mini'),
  TAVILY_API_KEY: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  MOCK_CONNECTORS: booleanString,
  MOCK_MODEL_PROVIDER: booleanString,
});

export type Environment = z.infer<typeof environmentSchema>;

let cachedEnvironment: Environment | undefined;

export function getEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  cachedEnvironment ??= environmentSchema.parse(source);
  return cachedEnvironment;
}

export function clearEnvironmentCache(): void {
  cachedEnvironment = undefined;
}

export function databaseUrlFor(environment: Environment, role: 'migrator' | 'api' | 'worker' | 'projector'): string {
  const roleUrl = {
    migrator: environment.DATABASE_MIGRATOR_URL,
    api: environment.DATABASE_API_URL,
    worker: environment.DATABASE_WORKER_URL,
    projector: environment.DATABASE_PROJECTOR_URL,
  }[role];
  const value = roleUrl ?? environment.DATABASE_URL;
  if (!value) throw new Error(`DATABASE_${role.toUpperCase()}_URL is required`);
  return value;
}
