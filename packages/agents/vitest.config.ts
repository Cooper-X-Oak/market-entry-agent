import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@imea/contracts': fileURLToPath(new URL('../contracts/src/index.ts', import.meta.url)), '@imea/connectors': fileURLToPath(new URL('../connectors/src/index.ts', import.meta.url)), '@imea/evidence': fileURLToPath(new URL('../evidence/src/index.ts', import.meta.url)) } },
});
