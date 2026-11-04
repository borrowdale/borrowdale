import { defineConfig, defaultClientConditions, defaultServerConditions } from 'vite';
import { fileURLToPath } from 'node:url';
const base = process.env.SITE_BASE || '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base))
  throw new Error('SITE_BASE must be a path starting and ending with /, such as /borrowdale/.');
export default defineConfig({
  define: { 'import.meta.env.VITE_SITE_ORIGIN': JSON.stringify(process.env.SITE_ORIGIN || '') },
  base,
  ssr: {
    noExternal: [/^@borrowdale\//],
    resolve: { conditions: ['@borrowdale/source', ...defaultServerConditions] },
  },
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { conditions: ['@borrowdale/source', ...defaultClientConditions] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { outDir: 'dist' },
});
