# BorrowdaleJS

Hand-drawn charts, components, text and backgrounds for the web.

Named after Borrowdale in the English Lake District, where the graphite that started the pencil
industry was found.

> **Status:** early development. The first release, 0.1.0, is in preparation and not yet on npm.

## Packages

| Package | |
|---|---|
| [`@borrowdale/core`](packages/core) | Deterministic hand-drawn shapes for SVG and canvas. Framework-agnostic, SSR-safe |
| [`@borrowdale/fills`](packages/fills) | Hand-drawn pattern fills and backgrounds |
| [`@borrowdale/text`](packages/text) | Hand-written text for SVG and canvas, measured with no DOM |
| [`@borrowdale/charts`](packages/charts) | Hand-drawn charts: bar, line, area, range area, interval, x-range and Gantt, scatter, bubble, pie, donut, nested rings, radar, rose, radial bar, polar line, area and scatter, gauges and timelines, on linear, time, log and square-root axes |

Planned: `@borrowdale/svg`, `@borrowdale/react`, `@borrowdale/elements`.

The four packages share one version and are released together. Used in Node.js, they need version
22 or later.

## Development

Development uses Node.js 24 (see `.nvmrc`); the packages are built and tested on Node.js 22, 24 and
26. Use `nvm use` with the included `.nvmrc`, or select Node 24 or later through your version manager,
before installing dependencies.

```sh
npm ci
npx playwright-core install chromium-headless-shell firefox webkit   # once: the parity tests render in all three
npm run build
npm test
npm run typecheck
npm run example
npm run example:text
npm run example:charts
npm run goldens   # re-record golden drawings after a deliberate output change
npm run fonts     # regenerate the bundled font modules from the font files
```

`npm test` includes parity tests that draw every `@borrowdale/core`, `@borrowdale/text` and
`@borrowdale/charts` golden in headless Chromium, Firefox and WebKit and require the output to match
Node's byte for byte, so each golden is checked in V8, SpiderMonkey and JavaScriptCore. For text
they also require the width each browser draws to match the measured width. They fail, rather than
skip, when a browser is not installed.

## License

MIT, except the Excalifont files bundled in `packages/text`, which are licensed under the SIL Open
Font License 1.1 (see [`packages/text/OFL.txt`](packages/text/OFL.txt)).
