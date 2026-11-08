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
cannot share a chart, except where a row says so:

| Series types | Axes |
|---|---|
| `bar`, `line`, `area`, `rangeArea`, `interval`, `xRange`, in any mix | `x` and `y`, one of them `band` |
| `scatter`, `bubble`, `xyLine`, `xyArea`, in any mix | `x` and `y`, both continuous: `linear`, `time`, `log` or `sqrt` |
| `histogram`, `distribution`, `relationship`, `market`, in any mix, and with the series of the row above | `x` and `y`, both `linear` |
| `radar`, `rose`, `polarLine`, `polarArea`, in any mix | `angle` (`band`), and optionally `radius` (`linear`) |
| `radialBar` | `angle` (`linear`) and `radius` (`band`) |
| `polarScatter` | `angle` and `radius`, both `linear` |
| `pie`, up to 10 as nested rings | none |
| `gauge`, any number sharing the dial | optionally `angle` (`linear`) |
| `timeline`, any number sharing the track | optionally `time` (`time` or `linear`), with its `path` |

| `type` | `data` | Options |
|---|---|---|
| `histogram` | numeric samples | `edges`, `frequency`, `cumulative`, `stack`. See Histograms below. |
| `bar` | a value or `null` per category | `stack`: bars with the same stack name stack (positive values up, negative down); others stand side by side. `axis: 'y2'` |
| `line` | a value or `null` (a gap) per category | `curve`, `dash` (dash and gap lengths, for the line and its legend swatch: `style.strokeLineDash` for short), `axis: 'y2'` |
| `area` | a value or `null` per category | `stack`, `curve`, `axis: 'y2'`. Stacked values must not be negative. Areas of one stack share a `curve` |
| `rangeArea` | a `[low, high]` pair or `null` per category, high not below low | `curve`, `axis: 'y2'` |
| `interval` | a `[from, to]` pair or `null` per category | `display`, `width`, `overlay`, endpoint symbols, `shape`, `dataLabels`, `axis: 'y2'`; see [additional marks](#additional-cartesian-marks) |
| `xRange` | `{ row, from, to?, label?, progress? }` items, any number per category | a Gantt or x-range chart; see [time](#time-log-and-square-root-axes) |
| `xyLine` | `[x, y]` pairs, each read by its axis (a time on a time axis), or `null` between runs | `symbol`, `dash`, `dataLabels`, `segments`, `widths`, `gradient`; see [widths and colours](#widths-crossings-and-colours) |
| `xyArea` | `[x, low, high]` intervals or `null` between runs, x increasing within each run | `difference` permits crossing boundaries; see [widths and colours](#widths-crossings-and-colours) |
| `scatter` | `[x, y]` points | |
| `bubble` | `[x, y, size]` points: the size sets the area, and is not negative | |
| `pie` | `{ name, value, color?, offset?, radius? }` slices | `innerRadius` (0 to 0.95: 0.5 is a donut) and `outerRadius` (0.05 to 1), `startAngle` and `endAngle`, `padAngle` (0 to 10 degrees between slices), `cornerRadius` (0 to 1,000 units). Values must not be negative, and one must be above 0 |
| `radar` | a value per spoke, none negative; or a `[low, high]` pair per spoke, for a range radar | |
| `rose` | a value or `null` per category of the angle axis, none negative | `stack`: wedges with the same stack name stack outwards (a wind rose); others share each category's wedge side by side |
| `radialBar` | a value or `null` per ring of the radius axis | `stack`: bars with the same stack name stack clockwise; others share each ring side by side |
| `polarLine` | a value or `null` (a gap) per category of the angle axis | `dash`. Values below 0 need the radius axis' `min` |
| `polarArea` | a value or `null` per category of the angle axis | `stack`. Stacked values must not be negative |
| `polarScatter` | `[angle, radius]` points | |
| `gauge` | `value`, a number on the dial | `display`: `needle` (default) or `bar`; `length`: a needle's length as a share of the radius, 0.1 to 1 (default 0.8) |
| `timeline` | `{ at, to?, label? }` moments and periods | `dataLabels`; see [timelines](#timelines) |

A slice's `offset` (0 to 0.5 of the radius) pulls it out from the centre. Give every slice of a pie
a `radius`, or none: each slice then reaches out in proportion to it, the largest to the full
radius. Nested rings split the radius equally, outermost first, unless they set `innerRadius` and
`outerRadius`; they share `startAngle` and `endAngle`, and a slice name in two rings is one legend
entry, with one colour. A slice narrower than `padAngle`, or that reaches no further than the hole,
is not drawn, and keeps its legend entry. With per-slice radii, at least one slice needs both a value
and a radius above 0.

`innerRadius` and `outerRadius` are shares of the outermost ring's radius, and the outermost ring
fills the chart: a lone pie's `outerRadius` changes nothing. `startAngle` (default 0) and `endAngle`
(default 360) are degrees clockwise from the top, the end greater than the start and at most 360
past it; −90 and 90 make a half donut. A slice's `offset` is a share of the outermost ring's radius,
and the pie shrinks to leave room for the largest offset on every side, whichever way the slices are
pulled; a slice that is the whole of its pie is not pulled out.
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
point). In a stack of `monotone` areas with missing values, each layer is smoothed only between the
categories where a layer's run begins or ends, or where its gap begins or ends with layers drawn both
below and above it, so the layers still meet exactly; a layer can show a corner there.

With `y` as the band axis, bars and lines run horizontally. A sparkline is a small chart with
`hidden: true` on both axes.

## Histograms

On linear x and y axes, supply raw samples and 2 to 1,001 strictly increasing bin edges.

```js
{ type: 'histogram', name: 'Trip duration', edges: [0, 10, 20, 30], data: [5, 7, 10, 12, 18, 30] }
```

This gives three adjacent bars with heights 2, 3 and 1. Each bin includes its left edge, and
the final bin also includes its right edge. Samples outside the edges raise an error. The x axis
shows each bin at its numeric width. Heights show counts by default, even for unequal widths.

Use `frequency: 'relative'` to divide each count by the series' sample count, or
`cumulative: true` to sum through each successive bin. Together they show the fraction of
samples accumulated through each bin. Empty input gives zero in every bin. Series with the same
`stack` name stack in declaration order and must share edges, frequency and cumulative settings.

## Statistical and financial charts

Use two linear axes and a named series with a `type`, a `display` and 1 to 1,000 observations.
The axes, annotations, legend, SVG, DOM and canvas renderers work as for other Cartesian series.
For example, this plot shows quartiles, whiskers and all six observations.

```js
const spec = {
  width: 480, height: 300,
  axes: { x: { type: 'linear', ticks: [{ value: 0, label: 'East' }] },
          y: { type: 'linear', title: 'Minutes' } },
  series: [{ type: 'distribution', display: 'box', name: 'East',
             data: [12, 14, 15, 16, 19, 29], points: true }]
};
```

### Distribution of a numeric sample

| `display` | Input and interpretation |
|---|---|
| `ecdf`, `normalQQ` | Exact empirical steps at distinct observations, or sorted observations against the standard normal quantiles at their mid-ranks. |
| `box` | Linearly interpolated quartiles and median. Tukey whiskers reach the outermost samples within 1.5 IQR of the box, and never end inside it. Use `whiskers: 'minmax'` for the full range, or `points: true` to show every sample. Without `points`, samples beyond the whiskers are drawn as dots. |
| `violin`, `raincloud` | Gaussian kernel density envelope. A raincloud adds a narrow box and jittered samples. A violin accepts `points`, and `polar` instead of `horizontal`. In a polar violin, `position` is the angle in radians and the density's range, three bandwidths past each end of the samples, maps to radius 1 to 2, with the angle clockwise from the positive y axis. A raincloud accepts `whiskers`, as a box does. |
| `density`, `ridge`, `normal` | Gaussian KDE, a ridge normalised to unit peak at its group position, or a normal curve fitted with the sample mean and sample standard deviation. KDE accepts a positive `bandwidth`. Density series with a shared `stack` name accumulate in order. |
| `swarm` | Places observation markers side by side where they would overlap. Markers are 7 units across; `sizes` gives one diameter per observation, 1 to 40 units, and `symbol` a geometric marker. Its group axis keeps half a unit each side of the position for the markers, and a `min` or `max` fixed on that axis must leave that room in. A swarm too crowded for it spreads further, up to the edge of the plot, over any neighbour, and one that does not fit there is an error. Use `mirrored: false` for a one-sided swarm, which grows as a one-sided dot plot stacks, with the room on that side. |
| `dotPlot`, `isotype` | Stack dots or symbols by value. Each group starts at the smallest remaining observation and spans `binWidth` (default 1). Stacks alternate about their position; `mirrored: false` stacks them to one side: rightward, or upward when horizontal. An isotype accepts a marker `symbol`, defaulting to a star. Dots in a stack sit one unit of the group axis apart, at the value that starts their group, so leave more room between positions than the widest stack. |
| `stemLeaf` | Nonnegative integer samples. Each row gives the tens stem and ordered units digits, up to 450 leaves per stem. Every stem from the lowest to the highest has a row, empty ones included, up to 100 stems. Rows are written at x = 0, the lowest stem at y = 0 and each next stem one unit below, so the display is usually drawn with both axes hidden. |

Use a different numeric `position` for each grouped box, violin, raincloud, ridge, swarm, dot plot
or isotype.
Label the positions with explicit ticks. Use `horizontal: true` on boxes, violins, rainclouds,
swarms, dot plots and isotypes to exchange the axes. KDE draws 65 points across the samples and three
bandwidths past each end. A narrow bandwidth adds points at most a quarter bandwidth apart near
every sample, so no peak is missed. A curve needs at most 2,000 points: a bandwidth too
narrow for that is an error. Its default bandwidth is 1.06 times the sample standard deviation times
the sample count to the power −0.2. A constant sample uses the larger of one unit or
one percent of its absolute value. A fitted normal needs positive sample variance.

### Relationships between observations

A `relationship` series takes numeric pairs.

| `display` | Input and interpretation |
|---|---|
| `histogram2d`, `hexbin` | Count observations in rectangles or flat-top hexagons. Cells with more observations have denser hachure, in the series colour. `binWidth` (default 1) and `binHeight` (default `binWidth`) specify rectangle dimensions or hexagon radii before axial projection. |
| `stanford` | Nonnegative position error and protection level. Cells are hatched by count, as for `histogram2d`. The diagonal and the required positive `alertLimit` delimit integrity regions. The boundaries are dashed reference lines in the axis colour. |
| `regression` | Select `method` from `linear` (the default), `polynomial` (`degree` 1–5, default 2), `exponential`, `logarithmic` and `loess` (`span` 0.05–1, default 0.5). Exponential fits regress log response and logarithmic fits regress on log input, so they need positive responses and positive inputs respectively. The curve runs from the lowest to the highest observed x. LOESS uses local linear fits with tricube weights. A curve that reaches the highest or lowest observation is kept at it, so axis limits at the data extent hold; one that passes beyond the observations, as a parabola can between them, is drawn as calculated and needs the axis to leave room for it. Add a scatter series to show the observations. |
| `qq` | Sort both columns independently and pair their ranks to compare two equal-sized samples. |
| `forest` | Each pair is an ordered confidence interval. Supply one point estimate per interval in `estimates`, each within its interval. Row i is drawn at y = i: label the rows with y-axis ticks. |

### Prices and indicators

A `market` series uses zero-based session indices on x, except for Renko bricks and point-and-figure columns. Candlestick, OHLC, HLC and Heikin-Ashi
take ordered `[open, high, low, close]` bars. Indicators and price-box charts can also read
closing prices directly.

| `display` | Calculation and options |
|---|---|
| `candlestick`, `heikinAshi`, `ohlc`, `hlc` | Candle bodies span open to close and wicks reach high and low. OHLC uses side ticks and HLC omits the opening tick. Heikin-Ashi derives each open from the previous transformed bar. Bars and candles take the series colour: rising candles are outlined and falling candles filled, or with `hollow: false` rising candles are hatched. `flags`, up to 100, label sessions by `index` and a `label` of at most 100 characters. |
| `renko`, `pointFigure` | Close-based price boxes start at the first close. Supply positive `boxSize`. Renko reverses after two boxes. Point-and-figure starts a new column after `reversal` boxes, 1 to 100 (default 3). Up to 4,000 boxes per series. |
| `sma`, `ema`, `bollinger` | Use a trailing `period` of 1 to 1,000 sessions (default 20). EMA starts at the first full-window mean. Bollinger bands show two population standard deviations around the rolling mean. |
| `macd`, `rsi` | MACD uses 12- and 26-session EMAs with a dashed 9-session signal line and difference histogram. Wilder RSI uses `period` changes (default 14) and reports 50 when the smoothed gain and loss are both zero. |
| `control` | An individuals control chart shows measurements, with their mean and limits as dashed lines in the axis colour. The limits lie three times the mean moving range divided by 1.128 above and below the mean. It needs at least two measurements. |

Every point a statistical series draws counts toward the chart-wide point budget, as its observations do. A kernel density's grid also counts once before its densities are computed, and so do a histogram's samples and its edges, one more than its bins. Bin widths and box sizes must produce distinct coordinates at the input magnitude. Computed geometry must stay within ±1e15, the drawable range: a series whose bins, boxes or fits would reach past it is rejected.

A fixed `min` or `max` must leave room for everything a series draws, not only its observations: a
density reaches three bandwidths past the samples, a fitted normal three standard deviations past
the mean, a box, violin or raincloud up to half a unit either side of its position, and a ridge one
unit above it.

Indicators need enough observations for their first complete window: MACD needs 34 sessions, 26
for its first value and 8 more for the signal line. The earliest visible
x position is the corresponding input session.

## Axes

| Axis option | |
|---|---|
| `type: 'band'`, `categories` | one band per category, each name at most 100 characters and at most once |
| `type: 'linear'` | rounded out from the data to ticks of 1, 2 or 5 × 10ⁿ, about one per 50 units |
| `y2` | a second value axis on the right, `linear`, `log` or `sqrt`, for series with `axis: 'y2'`. Only when `x` is the band axis |
| `min`, `max` | fix an end of a linear axis; `max` must be above `min`, and data outside them is an error |
| `step` | a tick at every multiple of it, counted from zero, with free ends rounded out to one, but no further than ±1e15: a number above 0, at most 1e15, with at most 20 decimals, giving at most 1,000 ticks |
| `ticks` | ticks exactly at these values, increasing and within any fixed end: a number, written in the axis format, or `{ value, label }` with a label of at most 100 characters. Free ends reach the outermost tick or value. 1 to 1,000; not with `step` |
| `percent` | stacks on the axis show each value as its share of the stack's total. Only bar and area series may use it, on a chart with a band axis |
| `grid` | gridlines at the ticks; on by default, except on `y2` |
| `title`, `hidden` | |
| `format` | `decimals` (0 to 20; by default tick labels get the fewest that tell the ticks apart, and tooltips every decimal a value has), `thousands` (default `,`), `decimal` (default `.`), `prefix`, `suffix` (default `%` on a percent axis), each text at most 10 characters |

Where tick labels would overlap, an axis labels fewer of its ticks and keeps every tick and
gridline. Evenly spaced ticks are labelled on multiples of a nice number of steps counted from zero,
so a crowded axis with a step of 2 shows 0, 10, 20; listed ticks keep each label that clears the last
one kept, and on an axis with an end the last tick, leaving out the labels before it that would crowd
it; where even the first would, they label whichever of the two is nearer its own end.

Numbers are never formatted with the locale data of the JavaScript engine, which differs between
engines; set `thousands` and `decimal` to write them for another language. Bars, areas and
histograms always stand on zero; range areas, lines, points and the other statistical series do not
have to.

Points, bubbles and the dots and markers of statistical series are centred on their values, so a
chart with them widens each end of `x` and `y`
by the radius of its largest mark, keeping the same ticks, and a point at the end of the data stays
on the plot. An end fixed with `min` or `max` is not widened: the plot keeps that room outside it
instead, so a mark on the fixed end may cross the axis line but stays on the chart.

A band axis' labels are centred on their bands. Where the first or last one shown would reach past
the edge of the chart, the plot is narrowed until it does not; a lone label wider than the chart
throws an error.

`labelAngle` (−90 to 90 degrees, clockwise) slants the tick labels of an `x`, `y` or `y2` axis; the
axis makes room for the slanted labels, and keeps more of them than it could flat. At −45 the x
labels read up to the right and end at their ticks. The axis reserves room past each of its ends for
the furthest any label reaches, so a chart too small for its slanted labels throws an error rather
than drawing them off the chart.

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
| `min`, `max`, `step`, `ticks`, `grid`, `hidden`, `format` | as on a cartesian axis |

Polar axes take no `title`, `percent` or `labelAngle`. The radius axis' labels run along the start of
the sweep, wherever it points, and the circle shrinks to keep them on the chart; a chart too small for
them throws an error naming `axes.radius`.

A gauge's dial is its `angle` axis: by default 0 to 100 over −120 to 120 degrees. It takes `min`,
`max`, `step`, `ticks`, `hidden`, `format`, `startAngle`, `endAngle`, and `bands`: up to 100 `{ from, to, color }`
stretches, in order and not overlapping. Without `min` and `max` it reaches from 0 to the values
and bands; it shows 0 unless `min` or `max` leaves it out. Ticks and labels are inside the rim; bars
take rings inside the track, or the track itself when there are no bands, and a dial holds as many
rings as fit outside its hub; a lone gauge writes its value under the centre. On a whole turn the
last tick would fall on the first, so it is left out: a clock dial is `min: 0, max: 12` over a whole
turn with `ticks` at 0 to 11, the one at 0 labelled 12; a compass is `min: 0, max: 360` with `ticks`
labelled N, E, S and W.

## Time, log and square-root axes

A cartesian `x` or `y` axis may be `time`, `log` or `sqrt` as well as `band` or `linear`, and `y2`
`log` or `sqrt`. Each takes `title`, `min`, `max`, `ticks`, `grid`, `hidden` and `labelAngle` as a
linear axis does. `log` and `sqrt` take the number `format` and `sqrt` also `step`; a time axis takes
its own `step` and `format`, below. `percent` is for linear axes only.

| `type` | Values | Ticks |
|---|---|---|
| `time` | ISO 8601 strings (`"2026-11-01"`, `"2026-11"`, `"2026-11-01T09:30Z"`, `"2026-11-01T09:30:15.250+01:00"`) or whole milliseconds since 1970-01-01T00:00Z, from year 0000 to 9999 | calendar boundaries in UTC, from milliseconds to millennia, about one per 50 units; `step: { unit, every }` picks them, `unit` one of `millisecond`, `second`, `minute`, `hour`, `day`, `week`, `month`, `year` and `every` a whole number from 1 to 1,000 (default 1), giving at most 1,000 ticks |
| `log` | numbers from 1e-20 to 1e15 | powers of ten, with 1, 2 and 5 times them, or every one to nine times, where there is room; where none of those fits and fewer than two powers of ten lie between its ends, a linear axis' ticks; free ends round out to powers of ten within those bounds, so a value alone at 1e15 shows the power below it; no `step` |
| `sqrt` | numbers, negative ones mirroring positive ones | a linear axis' ticks, placed by their square roots |

Times are read without the JavaScript engine's date parser, which differs between engines and
accepts dates that do not exist: an impossible day such as `2027-02-30` is an error. A date and time
must end in `Z` or an offset from UTC such as `+01:00`, since one without would be read as local time,
which differs between viewers. A date alone is midnight UTC. Ticks and labels are in UTC, and weeks
start on Monday. Labels are written without locale data, each at the coarsest level it falls on:
`2026` on a year, `Nov` on a month, `3 Nov` on a day, `09:30` on a minute; `format: { months }` gives
the 12 month names, each at most 20 characters, in another language. Tooltips write a time as
`2026-11-03 09:30`.

A step counts every `every` of its unit from the epoch for units of fixed length (from midnight
for hours that divide a day, from a Monday for weeks), from January of year 0 for months, and from
year 0 for years, so `{ unit: 'month', every: 3 }` falls on quarters, and a number of months that
does not divide 12 runs on across the years. Where labels would overlap, a time axis
labels every tick of its step when they fit, and otherwise only the ticks on the boundaries of a
coarser interval, such as whole months or years.

On a time axis only `interval` and `xRange` series take values on the value axis of a band chart:
range bars and Gantt rows. Values a log axis cannot show are errors, and so are `bar` and `area`
series on one, since they stand on 0.

An `xRange` series lays items along the rows of the band axis: each `{ row, from, to, label,
progress }`, `row` a category, `to` after `from`, `progress` 0 to 1 drawn solid along its start.
Without `to` an item is a milestone, a diamond at `from`. `dataLabels` writes each label on its item,
or past its end where it does not fit, where in a crowded row it can overlap the next; `width` (0.05 to 1 of the row's slot, default 0.6), `shape`
(`rectangle` or `rounded`) and `overlay` work as on an interval. Arrows between items are `arrow`
annotations, such as `{ type: 'arrow', from: ['2026-02-06', 'Design'], to: ['2026-02-09', 'Build'] }`;
they point at the middle of a row, so between the slots where several series share it.

Annotations take times on a time axis: `{ type: 'line', axis: 'x', value: '2026-06-15', label: 'A' }`.

## Timelines

A `timeline` series places moments, `{ at, label }`, and periods, `{ at, to, label }`, along one
axis, `axes.time`: a `time` axis by default, or `linear`, taking `min`, `max`, `step`, `ticks`,
`hidden` and `format`. Its `path` lays the axis out as a track, earliest first:

| `path` | Track |
|---|---|
| `{ type: 'line' }` | straight across the chart (the default) |
| `{ type: 'serpentine', rows }` | `rows` (1 to 20, default 3) left to right and back, joined by half turns; a chart too short for them, or too narrow for their turns, is an error |
| `{ type: 'spiral', turns, innerRadius }` | `turns` (1 to 20, default 3) out from `innerRadius` (0 to 0.9 of the radius, default 0.2), clockwise from the top |
| `{ type: 'curve', points }` | through 2 to 100 `[x, y]` points, each 0 to 1 across and down the area inside the track's labels, joined by straight segments |

Values are placed by their distance along the track, and ticks fall about every 50 units of it,
labelled on its left where they clear the labels before them. Moments are dots and periods thick
stretches of the track; with `dataLabels`, labels go on its right, moving out up to two lines to clear
the labels placed before them, and then to its left, beyond the tick labels. On a crowded track,
such as a tightly wound spiral, some labels can still overlap.

## Chart options

| Option | Default | |
|---|---|---|
| `width`, `height` | required | 1 to 10,000 user units |
| `title` | none | drawn at the top, and the drawing's accessible name; cut short to fit, as below |
| `legend` | `top` with two or more entries, else `none` | `top`, `bottom`, `right` or `none`; `right` takes one column, which must fit the height |
| `seed` | 1 | a number, or a string of at most 100 characters; varies every stroke |
| `fontSize` | 12 | 1 to 200 units, for every label; the title is 4 units larger |
| `style` | none | core style options for every shape, under each series' own `style`, except that lines, the edges of areas, gridlines, axis lines, ticks and a gauge's track are never filled; `stroke` and `fill` are colours, as for `color`, and `strokeWidth` and `fillWeight` from 0 to 100; no `seed`: each mark gets its own from the chart `seed` |

Styles apply in layers: the palette colour, a series' `color` and a line's `dash` first, the
chart's `style` over them, and a series' own `style` over all of these. So
`style: { stroke: 'black' }` on the chart outlines every series in black.

A chart title, an axis title or a legend name too long for its room is cut short with "…" between
whole characters (see `fitText` in `@borrowdale/text`): the chart title to the chart's width, an
axis title to the length of the plot, a label below the plot to twice the way from its tick to the
nearer side of the chart, a legend name to the width of a legend row, or half the chart's width for
a legend on the right. Tooltips and the drawing's accessible name keep the whole text. Where not even
"…" fits, it is an error naming the text's place in the spec.

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
category and value; a point's series and values; a slice's name, value and share; a histogram bin's
series, edges and height; for other statistical marks, the series and what the mark shows, such as
a quartile's value or a cell's count; and the series name of a line, an area or a radar. The drawing has `role="img"` and the chart title as its name. A
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

Each of these is an `InvalidChartError`, exported by the package, with the place as `path`
(`series[2].data[5]`) and the rest of the message as `problem`. A chart too small for its parts has
no single place in the spec, so its `path` is `''`:

```
Invalid chart: a 20 × 20 chart leaves no room for the plot after its title, legend and labels
```

The drawing budget below throws a plain `Error`.

A chart holds at most 100 series, 1,000 categories and 100,000 data points in all, and values
within ±10¹⁵. Validation reserves each series' point count before copying its data and stops as
soon as the total exceeds the limit, without reading later series. A limit error reports the
count reached so far, not a count of unread data. A pie holds at most 1,000 slices, and a chart
at most 10 nested pies. A gauge's dial
holds as many bar rings as fit outside its hub. Titles and stack names hold at most 1,000
characters, and names, categories and colours at most 100. All of a chart's strokes share one
budget of 400,000 units of drawing work, about a second at most, and a chart that needs more throws
`Drawing too complex (more than 400000 operations)`. On a 600 × 400 chart that is about 5,000
scatter points, or about 550 full-height hachured bars; solid bars stay within it up to the 1,000
categories. Straight and stepped lines cost the same for each point however they turn: 100 lines of
1,000 points that swing the full height at every point fit, as do 66 such `step` lines. A
`monotone` line costs more the more it turns: some 18 such lines fit, and one that swings the full
height fits only about 160 points.
Data labels, image markers and the text marks of statistical charts (point-and-figure X and O,
flags and stem-and-leaf rows) draw no strokes, so the budget does not count them: a chart holds at
most 10,000 of them together, about 3 MB of SVG, and more throws
`Drawing too complex (more than 10000 data labels, text marks and images)`.
Hachure fills are what costs most: about 7 KB of SVG for a 40 × 300 bar, against 0.6 KB with
`style: { fillStyle: 'solid' }`.

## Additional Cartesian marks

`interval` draws one `[from, to]` pair per category. Endpoints may descend; `null`
omits a category. It uses the same `axis` and horizontal/vertical orientation as a
bar. Its `display` is `bar` (default), `line`, `error` (stem and caps), or `points`.
`fromSymbol` and `toSymbol` add endpoint markers. `width` is a fraction of its slot,
0.05 to 1 (default 0.8). `overlay: true` puts it at the category centre instead of
reserving a grouped slot. Intervals do not stack automatically: supply their actual
endpoints when composing cumulative or overlapping marks.

```js
const series = [
  { type: 'interval', name: 'Change', data: [[2, 7], [8, 3]],
    display: 'line', fromSymbol: 'square', toSymbol: 'circle' },
];
```

Use `[0, value]` with `display: 'line'` and `toSymbol` for lollipops; use two markers
for dumbbells. Supply `[estimate - lowerError, estimate + upperError]` for error
bars, choosing equal errors for symmetric bars. A single endpoint marker on
`[value, value]` makes a Cleveland dot. `error` on equal endpoints makes a target
cap for a bullet chart.

`xyLine` takes `[x, y]` pairs, each read by the axis it is on, with `null` between runs. It
connects points in their given order, including descending x and loops, and needs two continuous
axes: `linear`, `time`, `log` or `sqrt`.
`symbol` adds markers, and `dash` controls the line. A lone point remains visible.
`xyArea` takes `[x, low, high]` intervals; x increases strictly within each run.
Use it for supplied confidence bands, with an `xyLine` for the estimate. Use a `relationship` series with `display: 'regression'` to fit a trend from observations.

### Symbols and labels

`symbol` on scatter, bubble, polar scatter, line and `xyLine`, and on distribution swarms and
isotypes, supports `circle`, `square`, `diamond`, `triangle`, `cross`, `star`, `wye` and `tick`.
Swarms and isotypes take these geometric symbols only, not images. Point symbols fit
inside a six-unit square, and swarm and isotype markers in a seven-unit one unless `sizes` sets
them; bubble symbols keep the bubble's computed diameter.
The area of equally shaped bubbles remains proportional to their size value.
A tick is a vertical stroke. New symbol choices are also shown in point legends.

`dataLabels: true` adds values to bars, intervals, lines, numeric lines, scatter,
bubbles and polar scatter, and labels to xRange items and timeline events; pies show slice names and values. Defaults stay off.
Labels use the relevant value-axis format where available, retain raw values for
percent bars, fit the plotting rectangle, and can overlap in dense charts. Pie
labels use each actual slice's offset and radius. A label that cannot fit even
with an ellipsis produces an error. This is explicit placement, not collision
avoidance or an interactive tooltip system.

Image markers use `symbol: { image: 'name' }` (or an endpoint symbol). Layout
contains only asset names and dimensions. Supply trusted assets to the renderer:

```js
const images = new Map([
  ['logo', { dataUrl: logoPngDataUrl, source: alreadyDecodedImage }],
]);
const svg = toSvgChart(layout, { images });
appendChart(parent, layout, { images });
drawChart(context, layout, { images });
```

`dataUrl` must be a base64 PNG, JPEG, GIF or WebP raster. SVG export needs only
those bytes; Canvas additionally needs the caller's preloaded `CanvasImageSource`.
The bytes and source must represent the same image. The package never fetches
URLs or decodes assets. Images fill the marker square; supply square assets to
preserve their proportions. Missing assets are rejected before rendering begins.
SVG output embeds each referenced raster once and positions it through references.

### Annotations

Cartesian `annotations` accept up to 100 entries. Coordinates are numbers on
linear, log and sqrt axes, times on time axes, and category names on band axes. Numeric annotation coordinates
contribute to automatic domains, and values beyond fixed bounds are errors.
Bands on category axes extend between category centres.

```js
const annotations = [
  { type: 'line', axis: 'y', value: 20, label: 'Target' },
  { type: 'band', axis: 'x', from: 'Feb', to: 'Apr' },
  { type: 'region', from: ['Feb', 10], to: ['Apr', 15] },
  { type: 'arrow', from: ['Feb', 25], to: ['Apr', 20] },
  { type: 'label', at: ['Apr', 20], text: 'Reached' },
];
```

Line/band axes are `x`, `y` or `y2`. Region, arrow and label entries use `axis: 'y2'`
for their second coordinate when needed. `color` sets the shape paint; annotation
text keeps the chart's text ink. `layer` is `back` or `front`; bands and regions
start behind the grid, other annotations above the data. Labels stay inside the
plot. Polar, pie, gauge and timeline charts take no annotations.

### Widths, crossings and colours

Cartesian band axes accept `weights`, one positive relative width per category
(each from 0.000001 to 1000000). All category centres, marks, labels and annotations
use that allocation: this makes a variwide chart. Bars and bar intervals accept
`shape: 'rounded'` or `'pyramid'`; rounded corners have a radius of at most six
units, and pyramids taper from their first endpoint to the second.

An `xyLine` can supply `segments`, one entry per adjacent pair of data slots.
Each entry is `null` or `{ color?, width?, dash? }`; an edge touching a null point
is absent. Segment overrides take precedence over the series and chart style.
For threshold lines, insert the exact crossing as a point, then choose the colour
of each resulting segment. For endpoints `[x0,y0]`, `[x1,y1]`, the crossing of `t`
is `[x0 + (x1-x0)*(t-y0)/(y1-y0), t]` when `t` lies strictly between their values.

`gradient: { axis: 'x', stops: [{ offset: 0, color: '#0072b2' },
{ offset: 1, color: '#d55e00' }] }` gives a true continuous SVG/Canvas gradient.
Use `axis: 'y'` for bottom-to-top paint. There are 2–32 strictly increasing stops,
starting at 0 and ending at 1. The gradient covers the plot and replaces the
path's paints; separately added point markers retain their normal paints.
Stop colours must be 3, 4, 6 or 8-digit hex codes, so validation can reject
unsupported paints consistently before SVG or Canvas rendering.
When combining exported SVG strings in one document, pass a unique `idPrefix` to
`toSvgChart`. `appendChart` chooses an unused prefix in the destination document.

`widths`, one value from 0 to 100 per point slot, makes a tapered trail, with round
joins and caps. Increase widths along the route for a comet. Widths are in display
units, so they do not affect numeric domains. Gaps break the trail. Gradients can
colour a trail; `segments` cannot be combined with either `widths` or `gradient`.

An `xyArea` with `difference: { positive: '#009e73', negative: '#d55e00' }` permits
its two boundaries to cross. It inserts crossings and fills each side according
to whether the second boundary is above the first. A constant first boundary
makes a threshold area. Numeric paths and bands use straight segments; categorical
lines and range areas retain their existing curve options.

### Chart compositions

The repository's `apps/examples/cartesian-cases.json` contains 33 complete specs;
run `node apps/examples/cartesian.mjs` after building to render each one. Its
`apps/examples/time-cases.json` holds 12 more, rendered by `node apps/examples/time.mjs`: a time axis,
range bars, a Gantt chart, an x-range chart, an annotation chart, a cycle plot, a Marey chart, log and
square-root axes, and serpentine, spiral and curve timelines. `apps/examples/statistical-cases.json`
holds 41 statistical and financial charts, rendered with the other chart kinds by
`npm run example:charts`.

| Chart | Preparation and composition |
|---|---|
| Slope | A categorical line over two categories, with symbols and labels |
| Waterfall | Starting at a running total, convert each signed change to `[total, total + change]`, then advance the total; a total/subtotal is `[0, total]` without advancing it |
| Stacked waterfall | Accumulate each step's components in their given order and overlay their interval series at the same category centre |
| Bullet/range bullet | Overlay qualitative interval bars at full width, the measured value/range at a narrower width, and an equal-endpoint error cap for the target |
| Pareto | Stable-sort nonnegative counts descending, then add a cumulative percentage line on `y2` with fixed 0–100 bounds and `format: { suffix: '%' }`; reject a zero total before dividing |
| Population pyramid | Horizontal signed bar stacks, negative for one population and positive for the other |
| Centred Likert | Centre the neutral interval on zero; place negative responses to its left and positive responses to its right, using overlaid interval series |
| Strip/barcode | Scatter points on a constant y, with circle or tick symbols |
| Index/change line | For a chosen nonzero base `b`, plot `100 * value / b` for an index, or `value - b` for absolute change; retain null gaps |
| Range bar | An `interval` series on a time value axis, one `[from, to]` per category |
| Annotation chart | An `xyLine` on a time `x` axis, with `line` annotations at the events and `label` annotations for their notes |
| Cycle plot | A linear `x` axis with `ticks` labelled by month at 0 to 11; each month's values over the years as one `xyLine` run around its tick, `null` between months, and each month's mean as a short dashed run |
| Marey chart | A time `x` axis and a linear `y` axis with `ticks` at each station's distance, labelled by its name; one `xyLine` per train through its times at the stations |
| Function plot | Sample the function into numeric `[x,y]` data outside the spec and draw an `xyLine` |

Apply the same category order to every composed series. Horizontal interval
charts put categories on y; vertical ones put categories on x. For a stacked
waterfall, component order is meaningful: opposite-signed components accumulate
sequentially rather than independently from zero.

## License

MIT. The tick steps are adapted from ISC-licensed code of d3-array; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Weighted categories retain proportional bar widths with equal inner and outer gaps. Equal weights produce the same bands as omitted weights. Categorical line markers and value labels share their series tooltip group.

Automatic `appendChart` resource prefixes are reserved across documents within the loaded module, including detached and template-created charts. Allocation checks the destination root (including shadow roots) and owner document, and skips explicit prefixes already used by this module. Explicit prefixes remain caller-managed: use unique values when combining independently loaded library copies, exported strings, or unrelated SVG content after moving charts.
