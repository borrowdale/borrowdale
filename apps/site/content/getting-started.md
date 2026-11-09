# Getting started

Install the packages from npm. Using them in Node.js needs version 22 or later; in a browser, any bundler that reads a package's `exports` works.

```sh
npm install @borrowdale/charts @borrowdale/text
```

`@borrowdale/charts` brings `@borrowdale/core` and `@borrowdale/text` with it. Name `@borrowdale/text` yourself as well, because the example below imports its font files directly.

## Your first chart

A chart spec describes dimensions, axes and series. Layout produces the drawing; the renderer turns it into SVG.

```js
import { layoutChart, toSvgChart } from '@borrowdale/charts';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';

const spec = {
  width: 640,
  height: 360,
  seed: 7,
  title: 'Ideas per day',
  axes: {
    x: { type: 'band', categories: ['Mon', 'Tue', 'Wed'] },
    y: { type: 'linear' },
  },
  series: [{ type: 'bar', name: 'Ideas', data: [12, 19, 15] }],
};

const svg = toSvgChart(layoutChart(spec), { fontFiles: excalifontFiles });
document.querySelector('#chart').innerHTML = svg;
```

Provide a container such as `<div id="chart"></div>` in your app. The playground supplies its own preview container: replace the last line with `render(svg)` there.

[View the chart reference fixtures](https://github.com/borrowdale/borrowdale/blob/main/packages/charts/test/golden/corpus.json).

## Choose a package

Use `@borrowdale/charts` for data visualization, `@borrowdale/core` for drawing primitives, `@borrowdale/text` for measured lettering, and `@borrowdale/fills` for repeating patterns. Read their package references for precise options and limits.

## Run the website locally

Developing BorrowdaleJS, or running this website and its playground from source, uses **Node.js 24**:

```sh
git clone https://github.com/borrowdale/borrowdale.git
cd borrowdale
nvm use
npm ci
npm run site
```

Open http://127.0.0.1:5173/. The site imports the `@borrowdale/*` packages from the workspace, so changes to them show at once.

## Check your changes

```sh
npm run site:build
npm test --workspace @borrowdale/site
```

See [Contributing](../../../CONTRIBUTING.md) for the library's full build and test workflow.
