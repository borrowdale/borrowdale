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
npm run build
npm test
npm run typecheck
npm run example
npm run goldens   # re-record golden drawings after a deliberate output change
```

## License

MIT
