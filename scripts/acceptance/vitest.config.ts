import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const root = new URL('../../', import.meta.url);
const packageRequire = (name: string) => createRequire(new URL(`${name}/package.json`, root));
export default defineConfig({
  resolve: { alias: {
    ...(process.env.IMEA_TEST_POSTGRES_PATCH === '1' ? { postgres: fileURLToPath(new URL('.test-dependencies/postgres/src/index.js', root)) } : {}),
    ...Object.fromEntries(['agents', 'contracts', 'database', 'connectors', 'workflows', 'domain', 'evidence', 'policies', 'config', 'observability'].map(name => [`@imea/${name}`, fileURLToPath(new URL(`packages/${name}/src/index.ts`, root))])),
    '@testcontainers/postgresql': packageRequire('packages/database').resolve('@testcontainers/postgresql'),
    '@temporalio/testing': packageRequire('packages/workflows').resolve('@temporalio/testing'),
    '@temporalio/worker': packageRequire('apps/worker').resolve('@temporalio/worker'),
    '@nestjs/core': packageRequire('apps/api').resolve('@nestjs/core'),
    '@nestjs/common': packageRequire('apps/api').resolve('@nestjs/common'),
    '@nestjs/platform-fastify': packageRequire('apps/api').resolve('@nestjs/platform-fastify'),
    'fastify': packageRequire('apps/api').resolve('fastify'),
    'jszip': packageRequire('apps/api').resolve('jszip'),
    'drizzle-orm': fileURLToPath(new URL('packages/database/node_modules/drizzle-orm', root)),
  } },
  esbuild: { tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } },
  test: { include: ['scripts/acceptance/*.integration.test.mts', 'packages/agents/src/__tests__/execution-boundaries.test.ts', 'packages/agents/src/__tests__/model-provider.test.ts'], hookTimeout: 120000, testTimeout: 60000, fileParallelism: false },
});
