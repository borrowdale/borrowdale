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

Here `spec` is a chart spec such as the one in [Getting started](getting-started.md). Consult the [chart reference](../../../packages/charts/README.md) for the renderer signatures and the `<title>` tooltips each mark carries.

## Seeds and styles

Pass an explicit `seed` to reproduce a drawing. Keep the input data, dimensions, styles and seed unchanged when comparing output. Changing the seed changes the sketch, not the underlying data.

Tune roughness, stroke width and fill style through the documented style options. Some options have validation bounds; unknown chart keys and invalid data are rejected rather than silently ignored.

## Text and fallback glyphs

Excalifont is bundled under its own font license. Layout and measurement do not require a DOM. Check the `missing` field returned by text layout or measurement when accepting arbitrary user text; do not assume every writing system is covered. See the [text reference](../../../packages/text/README.md).

## Playground execution

The editor supports synchronous JavaScript with named imports from the local packages. Call `render()` with SVG or HTML. A fresh worker executes each run and is stopped after three seconds. The preview iframe cannot run scripts or load external resources. The worker itself is not a security boundary for untrusted JavaScript; run code you trust.

Drafts survive navigation in the current tab but are lost on reload. The collection can show Canvas previews; the code editor renders SVG or HTML.

## Image assets

Try the permanent [image markers playground](/playground/charts/image-markers/) with a bundled PNG asset. Its synchronous SVG example supplies raster bytes directly; Canvas gallery previews decode the same asset before drawing. Unit charts and pictorial bars take the same `{ image }` symbol: see the [image units](/playground/charts/image-units/) and [image pictorial bar](/playground/charts/image-pictorial-bar/) playgrounds.

Image markers refer to a name such as `symbol: { image: 'logo' }`. Your application supplies trusted raster bytes and, for Canvas, a decoded source:

```js
import { layoutChart, toSvgChart, drawChart } from '@borrowdale/charts';
import { loadFont } from '@borrowdale/text';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';

// Supply your own base64 PNG, JPEG, GIF or WebP data URL.
const logoDataUrl = trustedLogoDataUrl;
const source = new Image();
source.src = logoDataUrl;
await source.decode();
await loadFont(document.fonts, excalifontFiles);

const images = new Map([['logo', { dataUrl: logoDataUrl, source }]]);
const layout = layoutChart(spec);
const svg = toSvgChart(layout, { images, idPrefix: 'sales-chart' });
drawChart(canvas.getContext('2d'), layout, { images });
```

Here `spec` contains a marker named `logo`, and `canvas` has drawing dimensions matching the spec. SVG export only needs the raster bytes; the decoded source is required for Canvas. The chart package does not load URLs. Use distinct `idPrefix` values for multiple exported SVGs in one document; `appendChart` chooses a prefix automatically. The asynchronous loading example runs in your application, not the synchronous playground worker.
