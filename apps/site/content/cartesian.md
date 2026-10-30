# Cartesian charts and annotations

Build charts from values, intervals or ordered numeric points, then add the marks that explain the data. The playground includes 33 editable compositions alongside the reference charts. Search for names such as **waterfall**, **bullet**, **dumbbell**, **gradient line**, **variwide** or **annotations**, or filter by the `interval`, `xyLine` and `xyArea` families.

## Intervals: two endpoints per category

Use `interval` for floating bars, lollipops, dumbbells and error bars. Both endpoints affect the value axis. A pair may descend; a `null` leaves a gap. Choose `display: 'bar'`, `'line'`, `'error'` or `'points'` and add endpoint symbols when useful.

```js
import { layoutChart, toSvgChart } from '@borrowdale/charts';

const spec = {
  width: 560,
  height: 320,
  title: 'Before and after',
  legend: 'none',
  axes: {
    x: { type: 'band', categories: ['North', 'South', 'West'] },
    y: { type: 'linear', grid: true },
  },
  series: [{
    type: 'interval', name: 'Change', display: 'line',
    data: [[12, 20], [24, 18], [9, 16]],
    fromSymbol: 'circle', toSymbol: 'diamond', dataLabels: true,
  }],
};
const svg = toSvgChart(layoutChart(spec));
// In the playground, call render(svg). In your app, insert it into a container.
```

Put categories on `y` for horizontal intervals. Use `axis: 'y2'` with a secondary value axis when needed. `overlay: true` layers a range or target over another series without taking a separate group slot. The bullet examples combine background ranges, a measure and a target. Waterfall examples supply cumulative endpoints explicitly, including decreases and totals.

## Numeric paths and confidence bands

`xyLine` connects `[x, y]` points in input order, so a connected scatter chart can loop back along x. `null` breaks a run. `xyArea` takes `[x, low, high]` triples with x increasing within each run; it draws supplied confidence intervals without estimating them.

- **Connected scatter, slope and index/change lines:** prepare values, then connect the appropriate points. Slope charts can also use categorical lines.
- **Difference and threshold areas:** `xyArea.difference` supplies positive/negative colours; crossing boundaries split at the interpolated crossing. A constant first boundary makes a threshold area.
- **Function plots:** sample a function into points before passing the spec. Specs contain data, never executable expressions.

## Symbols, labels and annotations

Choose `circle`, `square`, `diamond`, `triangle`, `cross`, `star`, `wye` or `tick` for eligible point markers. Bubble markers retain their size encoding. Endpoint symbols turn intervals into lollipop or dumbbell charts; tick markers make barcode-style plots.

`dataLabels: true` adds values to bars, intervals, lines, numeric lines, scatter, bubbles and polar scatter. Pie labels show names and values. Labels use the relevant axis formatting, fit inside the plot and may overlap in crowded charts. Labels are off by default.

Cartesian annotations include reference lines, bands, regions, arrows and labels:

```js
const annotations = [
  { type: 'line', axis: 'y', value: 20, label: 'Target' },
  { type: 'band', axis: 'x', from: 'North', to: 'South' },
  { type: 'arrow', from: ['West', 9], to: ['West', 16] },
  { type: 'label', at: ['West', 16], text: 'Improved' },
];
// Add annotations to the interval spec above before calling layoutChart.
```

Coordinates use numbers on linear axes and category names on band axes. Numeric annotation coordinates extend automatic domains; fixed domains reject outliers. Choose `layer: 'back'` or `'front'`. Annotation colours affect shapes; text keeps the chart's ink. Up to 100 annotations are supported per Cartesian chart.

## Widths, shapes and colour

- **Variwide:** add positive `weights` to the Cartesian band axis, one per category. Marks, labels and annotations use the same category allocation.
- **Rounded and pyramid bars:** set `shape: 'rounded'` or `'pyramid'` on a bar or bar interval.
- **Segment styles:** `xyLine.segments` has one entry per adjacent pair of data slots. Each entry can override `color`, `width` and `dash`; null data still breaks the line. A zero-width stroke is invisible in SVG and Canvas.
- **Trails and comets:** `xyLine.widths` supplies a width from 0 to 100 display units per point slot. Gaps break the trail; increasing widths makes a comet.
- **Continuous gradients:** add `gradient: { axis: 'x', stops: [{ offset: 0, color: '#0072b2' }, { offset: 1, color: '#d55e00' }] }`. Use `axis: 'y'` for bottom-to-top colour. Stops must increase strictly from 0 to 1 and use hex colours. Gradients can colour trails; segment overrides cannot combine with gradients or tapered widths.

When several exported SVG charts share a document, give each `toSvgChart` call a unique `idPrefix` so gradient and image references stay within the intended chart. `appendChart` allocates an unused prefix automatically.

## Image markers use caller-supplied assets

Use `symbol: { image: 'logo' }` in the spec, then pass an `images` map to the renderer. Each entry supplies a base64 PNG, JPEG, GIF or WebP `dataUrl`; Canvas additionally requires a preloaded `CanvasImageSource`. The bytes and source must represent the same image. Layout stays synchronous, and the chart package never fetches or decodes assets.

See [Rendering and fonts](rendering.md#image-assets) for a complete loading example. Image markers fill a square; use square assets to preserve their proportions. Missing assets fail before rendering begins. The playground's SVG editor can use embedded raster data; it does not support asynchronous loading code.

## Compositions to explore

The playground includes vertical/horizontal waterfalls and bullets, stacked waterfalls, Pareto, population pyramids, Likert charts, Cleveland dots, confidence bands, difference/threshold areas, segment/gradient lines, trails, comets, shaped bars and function plots. Each example shows explicit input data and editable code.

The [chart reference](../../../packages/charts/README.md) gives the exact type and validation contracts. The [example catalogue](../../examples/cartesian-cases.json) contains the same composition specs used by the playground.
