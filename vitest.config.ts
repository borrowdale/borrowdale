import { defaultClientConditions, defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// Tests run against each package's TypeScript source through the `@borrowdale/source` export
// condition. Node and consumers' bundlers ignore that condition and load `dist`.
const source = '@borrowdale/source';

export default defineConfig({
  resolve: { conditions: [source, ...defaultClientConditions] },
  ssr: { resolve: { conditions: [source, ...defaultServerConditions] } },
  test: {
    // The website's tests run here too, with its own config: it renders the packages' READMEs and
    // golden corpora, so a package change can break it.
    projects: [
      { extends: true, test: { name: 'packages', include: ['packages/*/test/**/*.test.ts'] } },
      'apps/site/vitest.config.ts',
    ],
  },
});
