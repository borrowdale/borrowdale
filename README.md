<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/site/public/borrowdale-logo-dark.svg">
    <img src="apps/site/public/borrowdale-logo.svg" alt="BorrowdaleJS" width="309" height="51">
  </picture>
</h1>

Hand-drawn charts, components, text and backgrounds for the web.

**Website: [borrowdalejs.com](https://borrowdalejs.com/)**, with the
[documentation](https://borrowdalejs.com/docs/), a
[playground](https://borrowdalejs.com/playground/) where every example can be edited and run, and
[open-data dashboards](https://borrowdalejs.com/examples/).

Named after Borrowdale in the English Lake District, where the graphite that started the pencil
industry was found.

> **Status:** early development. The latest release, 0.5.0, is on npm:
> `npm install @borrowdale/charts`. Until 1.0, a minor release can include breaking changes.

## Packages

| Package | |
|---|---|
| [`@borrowdale/core`](packages/core) | Deterministic hand-drawn shapes for SVG and canvas. Framework-agnostic, SSR-safe |
| [`@borrowdale/fills`](packages/fills) | Hand-drawn pattern fills and backgrounds |
| [`@borrowdale/text`](packages/text) | Hand-written text for SVG and canvas, measured with no DOM |
| [`@borrowdale/charts`](packages/charts) | Hand-drawn charts: bar, line, area, range area, interval, x-range and Gantt, scatter, bubble, pie, donut, nested rings, radar, rose, radial bar, polar line, area and scatter, gauges, timelines, statistical and financial charts, heatmaps, polar and calendar heatmaps and horizon charts coloured through a colour axis, on linear, time, log and square-root axes |

Planned: `@borrowdale/svg`, `@borrowdale/react`, `@borrowdale/elements`.

The four packages share one version and are released together. Used in Node.js, they need version
22 or later.

## Documentation

Read it on the [website](https://borrowdalejs.com/docs/), which renders the Markdown sources in
this repository: the [shared documentation](apps/site/content/README.md), the
[contributing guide](CONTRIBUTING.md), the [changelog](CHANGELOG.md), and
[license and credits](apps/site/content/license.md).

## Development

The website's source is in [`apps/site`](apps/site/README.md), with the interactive collection and
three open-data dashboards. Run `npm run site` after installing dependencies; the packages resolve
directly from the workspace.

Development uses Node.js 24 (see `.nvmrc`); the packages are built and tested on Node.js 22, 24 and
26. Use `nvm use` with the included `.nvmrc`, or select Node 24 or later through your version manager,
before installing dependencies.

```sh
npm ci
npx playwright-core install chromium firefox webkit   # once: the parity tests render in all three
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

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workspace, conventions and pull requests, and the
[code of conduct](CODE_OF_CONDUCT.md). Report security problems privately, as
[`SECURITY.md`](SECURITY.md) describes.

## License

MIT, except the Excalifont files bundled in `packages/text`, which are licensed under the SIL Open
Font License 1.1 (see [`packages/text/OFL.txt`](packages/text/OFL.txt)).
