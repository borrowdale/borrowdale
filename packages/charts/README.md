# @borrowdale/charts

Hand-drawn charts for SVG and canvas. A chart is plain data, so it can come straight from JSON;
`layoutChart` measures every label, picks scales and ticks and draws every stroke with no DOM, and
the result is the same on the server and in the browser, down to the byte.

```sh
npm install @borrowdale/charts @borrowdale/text
```

```js
import { layoutChart, toSvgChart } from '@borrowdale/charts';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';

const chart = layoutChart({
  width: 640,
  height: 400,
  title: 'Revenue by month',
  axes: {
    x: { type: 'band', categories: ['Jan', 'Feb', 'Mar'] },
    y: { type: 'linear', title: 'Revenue', format: { prefix: '€' } },
    y2: { type: 'linear', title: 'Target' },
  },
  series: [
    { type: 'bar', name: 'Pencils', data: [12, 15, 9] },
    { type: 'bar', name: 'Paper', data: [7, 8, 11] },
    { type: 'line', name: 'Target', axis: 'y2', curve: 'monotone', dash: [6, 4], data: [25, 25, 30] },
  ],
});

const svg = toSvgChart(chart, { fontFiles: excalifontFiles });
```

## Charts

Each series has a `type`, a `name` of at most 100 characters that is unique in the chart, and
optionally its own `color` (a hex code, a colour name, `rgb()`, `rgba()`, `hsl()` or `hsla()`) and
`style` (any `@borrowdale/core` style option but `seed`, within the limits under Chart options).
The series' types decide what the chart is, and which axes it takes; series of different rows
cannot share a chart:

| Series types | Axes |
|---|---|
| `bar`, `line`, `area`, `rangeArea`, in any mix | `x` and `y`, one of them `band` |
| `scatter`, `bubble` | `x` and `y`, both `linear` |
| `radar`, `rose`, `polarLine`, `polarArea`, in any mix | `angle` (`band`), and optionally `radius` (`linear`) |
| `radialBar` | `angle` (`linear`) and `radius` (`band`) |
| `polarScatter` | `angle` and `radius`, both `linear` |
| `pie`, up to 10 as nested rings | none |
| `gauge`, any number sharing the dial | optionally `angle` (`linear`) |

| `type` | `data` | Options |
|---|---|---|
| `bar` | a value or `null` per category | `stack`: bars with the same stack name stack (positive values up, negative down); others stand side by side. `axis: 'y2'` |
| `line` | a value or `null` (a gap) per category | `curve`, `dash` (dash and gap lengths, for the line and its legend swatch: `style.strokeLineDash` for short), `axis: 'y2'` |
| `area` | a value or `null` per category | `stack`, `curve`, `axis: 'y2'`. Stacked values must not be negative. Areas of one stack share a `curve` |
| `rangeArea` | a `[low, high]` pair or `null` per category, high not below low | `curve`, `axis: 'y2'` |
| `scatter` | `[x, y]` points | |
| `bubble` | `[x, y, size]` points: the size sets the area, and is not negative | |
| `pie` | `{ name, value, color?, offset?, radius? }` slices | `innerRadius` (0 to 0.95: 0.5 is a donut) and `outerRadius` (0.05 to 1), as shares of the chart's radius; `startAngle` (default 0) and `endAngle` (default 360): degrees clockwise from the top, the end greater than the start and at most 360 past it. −90 and 90 make a half donut. `padAngle` (0 to 10 degrees between slices), `cornerRadius` (0 to 1,000 units). Values must not be negative, and one must be above 0 |
| `radar` | a value per spoke, none negative; or a `[low, high]` pair per spoke, for a range radar | |
| `rose` | a value or `null` per category of the angle axis, none negative | `stack`: wedges with the same stack name stack outwards (a wind rose); others share each category's wedge side by side |
| `radialBar` | a value or `null` per ring of the radius axis | `stack`: bars with the same stack name stack clockwise; others share each ring side by side |
| `polarLine` | a value or `null` (a gap) per category of the angle axis | `dash`. Values below 0 need the radius axis' `min` |
| `polarArea` | a value or `null` per category of the angle axis | `stack`. Stacked values must not be negative |
| `polarScatter` | `[angle, radius]` points | |
| `gauge` | `value`, a number on the dial | `display`: `needle` (default) or `bar`; `length`: a needle's length as a share of the radius, 0.1 to 1 (default 0.8) |

A slice's `offset` (0 to 0.5 of the radius) pulls it out from the centre. Give every slice of a pie
a `radius`, or none: each slice then reaches out in proportion to it, the largest to the full
radius. Nested rings split the radius equally, outermost first, unless they set `innerRadius` and
`outerRadius`; they share `startAngle` and `endAngle`, and a slice name in two rings is one legend
entry, with one colour. A slice narrower than `padAngle` is not drawn, and keeps its legend entry.
With several pies, each slice's tooltip starts with its ring's name.

The polar types share the rules of their cartesian twins: a `rose` is a `bar` wrapped around a band
angle axis, a `radialBar` a bar bent along a ring, and `polarLine`, `polarArea` and `polarScatter`
a `line`, `area` and `scatter`. They take no `curve` and no `axis`. On a whole turn a polar line or
area through every category closes, as a radar does; with gaps, the run that ends the data goes on
into the run that starts it.

A pyramid pie is a pie with a rotated `startAngle`. A radial histogram is a `rose` over categories
binned beforehand. A polar clock is a `radialBar` of shares, and a clock a `gauge` dial of a whole
turn with two needles of different lengths.

`curve` is `linear` (the default), `monotone` (smooth, and never beyond the data between points),
or `step`, `step-before` or `step-after` (the value changes halfway, at the point, or at the next
point).

With `y` as the band axis, bars and lines run horizontally. A sparkline is a small chart with
`hidden: true` on both axes.

## Axes

| Axis option | |
|---|---|
| `type: 'band'`, `categories` | one band per category, each name at most 100 characters and at most once |
| `type: 'linear'` | rounded out from the data to ticks of 1, 2 or 5 × 10ⁿ, about one per 50 units |
| `y2` | a second linear axis on the right, for series with `axis: 'y2'`. Only when `x` is the band axis |
| `min`, `max` | fix an end of a linear axis; `max` must be above `min`, and data outside them is an error |
| `percent` | stacks on the axis show each value as its share of the stack's total. Only bar and area series may use it, on a chart with a band axis |
| `grid` | gridlines at the ticks; on by default, except on `y2` |
| `title`, `hidden` | |
| `format` | `decimals` (0 to 20; by default tick labels get the fewest that tell the ticks apart, and tooltips every decimal a value has), `thousands` (default `,`), `decimal` (default `.`), `prefix`, `suffix` (default `%` on a percent axis), each text at most 10 characters |

`labelAngle` (−90 to 90 degrees, clockwise) slants the tick labels of an `x`, `y` or `y2` axis; the
axis makes room for the slanted labels, and keeps more of them than it could flat. At −45 the x
labels read up to the right and end at their ticks.

On a polar chart, `angle` goes clockwise from the top, and `radius` out from the centre, linear by
default:

| Polar axis option | |
|---|---|
| `angle`: `type: 'band'`, `categories` | spokes or wedges. On a whole turn the first is at `startAngle`; on part of one each takes an equal share, centred in it |
| `angle`: `type: 'linear'` | values from `startAngle` to `endAngle`; on a whole turn the end is labelled once, as the start |
| `angle`: `startAngle`, `endAngle` | default 0 and 360 degrees; the end greater than the start and at most 360 past it |
| `radius`: `type: 'linear'` | from 0 unless `min` is set |
| `radius`: `type: 'band'`, `categories` | rings, the first outermost, labelled beside the start of the angle axis |
| `radius`: `innerRadius` | a hole in the middle, 0 to 0.95 of the radius |
| `radius`: `shape` | `polygon` gridlines through the spokes (the default when every series is a radar; needs a band angle axis of at least 3 categories), or `circle` |
| `min`, `max`, `grid`, `hidden`, `format` | as on a cartesian axis |

Polar axes take no `title`, `percent` or `labelAngle`.

A gauge's dial is its `angle` axis: by default 0 to 100 over −120 to 120 degrees. It takes `min`,
`max`, `hidden`, `format`, `startAngle`, `endAngle`, and `bands`: up to 100 `{ from, to, color }`
stretches, in order and not overlapping. Without `min` and `max` it reaches from 0 to the values
and bands. Ticks and labels are inside the rim; bars take rings inside the track, or the track
itself when there are no bands; a lone gauge writes its value under the centre.

Numbers are never formatted with the locale data of the JavaScript engine, which differs between
engines; set `thousands` and `decimal` to write them for another language. Bars and areas always
stand on zero; range areas, lines and points do not have to.

## Chart options

| Option | Default | |
|---|---|---|
| `width`, `height` | required | 1 to 10,000 user units |
| `title` | none | drawn at the top, and the drawing's accessible name |
| `legend` | `top` with two or more entries, else `none` | `top`, `bottom`, `right` or `none`; `right` takes one column, which must fit the height |
| `seed` | 1 | a number, or a string of at most 100 characters; varies every stroke |
| `fontSize` | 12 | 1 to 200 units, for every label; the title is 4 units larger |
| `style` | none | core style options for every shape, under each series' own `style`; `stroke` and `fill` are colours, as for `color`, and `strokeWidth` and `fillWeight` from 0 to 100; no `seed`: each mark gets its own from the chart `seed` |

Styles apply in layers: the palette colour, a series' `color` and a line's `dash` first, the
chart's `style` over them, and a series' own `style` over all of these. So
`style: { stroke: 'black' }` on the chart outlines every series in black.

The font is not part of the spec, since a spec may come from anyone: pass a `@borrowdale/text` font
as `layoutChart(spec, { font })`. It defaults to Excalifont.

Colours come from the Okabe–Ito palette, which stays distinct with the common forms of colour
blindness. Its seven colours come round four times, each time with a new hachure angle, so its 28
pairs never look alike. They are never reused: a 29th series or slice needs its own `color`. A
series or slice with its own `color` keeps the first angle.

Each mark's strokes are seeded from the chart `seed`, its series and its category, so a bar keeps
its strokes when other data change.

## Rendering

| Function | Output | Needs |
|---|---|---|
| `toSvgChart(layout, { fontFiles? })` | complete `<svg>` string | nothing (SSR-safe) |
| `appendChart(parent, layout)` | appends an `<svg>` element and returns it | a DOM |
| `drawChart(context2d, layout)` | draws into a canvas | `Path2D`, and the font loaded |

A layout is plain JSON. The renderers draw it as it is and do not check it again, so draw only
layouts that `layoutChart` returned. The type declarations refer to DOM types (`Element`,
`SVGSVGElement`, `CanvasRenderingContext2D`), so TypeScript projects need `"dom"` in
`compilerOptions.lib`, even when they only render on the server.

Labels are measured in the chart's font, so the viewer must draw them in it too. Pass `fontFiles`
to `toSvgChart` to embed the font files the chart's labels need, load the font with `loadFont`
before `drawChart` (which throws otherwise), or serve it to the page yourself. The `fontFiles` must
be the files of the font the chart was laid out in; `toSvgChart` throws otherwise. `layout.labels`
lists every label, for `fontFaceCss`; `layout.missing` lists any character the font does not cover.

In SVG and the DOM, each mark carries a `<title>`, which browsers show as a tooltip: a bar's series,
category and value; a point's series and values; a slice's name, value and share; and the series
name of a line, an area or a radar. The drawing has `role="img"` and the chart title as its name. A
canvas has neither.

## Errors and limits

Anything that cannot be drawn throws an error naming its place in the spec:

```
Invalid chart: series[2].data[5] must be a number from -1e15 to 1e15 or null, got "5"
Invalid chart: axes must be left out: a pie chart has no axes
Invalid chart: axes.y.max is 100, but the data reach 130
```

Unknown keys are errors too, so a misspelled option never goes unnoticed. Errors that
`@borrowdale/core` or `@borrowdale/text` raise for a series' `style`, a `dash` or a label are
passed on with the same prefix.

A chart holds at most 100 series, 1,000 categories and 100,000 data points in all, and values
within ±10¹⁵. A pie holds at most 1,000 slices. Titles and stack names hold at most 1,000
characters, and names, categories and colours at most 100. All of a chart's strokes share one
budget of 400,000 units of drawing work, about a second at most, and a chart that needs more throws
`Drawing too complex (more than 400000 operations)`. On a 600 × 400 chart that is about 5,000
scatter points, or about 550 full-height hachured bars; solid bars stay within it up to the 1,000
categories. A line costs more the more it turns: some 25 lines of 1,000 smooth points fit, but one
line that swings the full height at every point fits only about 880 points. A `monotone` line costs
more: some 18 such lines fit, and one that swings the full height fits only about 160 points.
Hachure fills are what costs most: about 7 KB of SVG for a 40 × 300 bar, against 0.6 KB with
`style: { fillStyle: 'solid' }`.

## License

MIT. The tick steps are adapted from ISC-licensed code of d3-array; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
