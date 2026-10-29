# Rendering and fonts

BorrowdaleJS separates drawing layout from browser rendering. The package references document each function and option in detail.

## SVG

`layoutChart(spec)` is DOM-free. `toSvgChart(layout, { fontFiles: excalifontFiles })` produces an SVG string with the font data needed for its labels. Insert the SVG into a container in your application, or call `render(svg)` in the website playground.

SVG scales with its view box. Keep its aspect ratio when sizing the containing element. Use a title and useful series names so generated labels describe the data.

## Canvas

Canvas text requires the font to be loaded before drawing. Set the canvas drawing dimensions to match the chart dimensions; changing only its CSS dimensions can stretch the drawing.

```js
import { layoutChart, drawChart } from '@borrowdale/charts';
import { loadFont } from '@borrowdale/text';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';

await loadFont(document.fonts, excalifontFiles);
const canvas = document.querySelector('canvas');
canvas.width = spec.width;
canvas.height = spec.height;
drawChart(canvas.getContext('2d'), layoutChart(spec));
```

Here `spec` is a chart spec such as the one in [Getting started](getting-started.md). Consult the [chart reference](../packages/charts/README.md) for the renderer signature and interaction helpers.

## Seeds and styles

Pass an explicit `seed` to reproduce a drawing. Keep the input data, dimensions, styles and seed unchanged when comparing output. Changing the seed changes the sketch, not the underlying data.

Tune roughness, stroke width and fill style through the documented style options. Some options have validation bounds; unknown chart keys and invalid data are rejected rather than silently ignored.

## Text and fallback glyphs

Excalifont is bundled under its own font license. Layout and measurement do not require a DOM. Check the `missing` field returned by text layout or measurement when accepting arbitrary user text; do not assume every writing system is covered. See the [text reference](../packages/text/README.md).

## Playground execution

The editor supports synchronous JavaScript with named imports from the local packages. Call `render()` with SVG or HTML. A fresh worker executes each run and is stopped after three seconds. The preview iframe cannot run scripts or load external resources. The worker itself is not a security boundary for untrusted JavaScript; run code you trust.

Drafts survive navigation in the current tab but are lost on reload. The collection can show Canvas previews; the code editor renders SVG or HTML.
