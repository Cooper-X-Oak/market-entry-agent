import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['src/**/*.workflow.test.ts', 'node_modules/**', 'dist/**'],
    passWithNoTests: true,
  },
});
