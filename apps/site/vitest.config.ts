import { defineConfig } from 'vitest/config';
import { defaultClientConditions, defaultServerConditions } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { conditions: ['@borrowdale/source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['@borrowdale/source', ...defaultServerConditions] } },
  test: { include: ['test/**/*.test.ts'] },
});
