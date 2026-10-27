# BorrowdaleJS

Hand-drawn charts, components, text and backgrounds for the web.

Named after Borrowdale in the English Lake District, where the graphite that started the pencil
industry was found.

> **Status:** early development. Packages are not yet published.

## Packages

| Package | |
|---|---|
| [`@borrowdale/core`](packages/core) | Deterministic hand-drawn shapes for SVG and canvas. Framework-agnostic, SSR-safe |
| [`@borrowdale/fills`](packages/fills) | Hand-drawn pattern fills and backgrounds |

Planned: `@borrowdale/text`, `@borrowdale/svg`, `@borrowdale/charts`, `@borrowdale/react`,
`@borrowdale/elements`.

## Development

```sh
npm ci
npx playwright-core install chromium-headless-shell   # once: the parity test renders in Chromium
npm run build
npm test
npm run typecheck
npm run example
npm run goldens   # re-record golden drawings after a deliberate output change
```

`npm test` includes a parity test that draws every `@borrowdale/core` golden in headless Chromium and requires the
output to match Node's byte for byte. It fails, rather than skips, when Chromium is not installed.

## License

MIT
