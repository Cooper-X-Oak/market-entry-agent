import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.workflow.test.ts'],
    passWithNoTests: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
