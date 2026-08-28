import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['src/__tests__/*.workflow.test.ts'], testTimeout: 60_000, hookTimeout: 60_000, pool: 'forks', poolOptions: { forks: { singleFork: true } } } });
