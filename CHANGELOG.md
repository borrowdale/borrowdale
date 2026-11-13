# Changelog

Each package's release notes are generated from its changesets into its own changelog:
[`@borrowdale/core`](packages/core/CHANGELOG.md), [`@borrowdale/fills`](packages/fills/CHANGELOG.md),
[`@borrowdale/text`](packages/text/CHANGELOG.md) and
[`@borrowdale/charts`](packages/charts/CHANGELOG.md).
The four packages share one version and are released together. Each release also has its notes on
[GitHub](https://github.com/borrowdale/borrowdale/releases), and the
[commit history](https://github.com/borrowdale/borrowdale/commits/main/) records every source change.

## 0.5.0

Published on 13 November 2026:

- **`@borrowdale/charts`:** charts of parts and units. A `units` series draws each category as a count
  of equal units: a waffle, the seats of a parliament, rows of pictograms or a segmented doughnut. A
  `funnel` series draws stages in turn: a funnel, two back to back, a pyramid, a funnel area, or the
  bands of a silhouette given as SVG path data. A `liquid` series shows a level as liquid in a circle
  or a rectangle. A pie's `breakout` draws one slice's parts as a second pie, a band axis'
  `weights: "stacks"` sizes a Marimekko chart's columns by their stacks, and a bar's
  `shape: "pictorial"` repeats a symbol along it. The errors for a missing or unusable image now
  write its name quoted and escaped, as in `Missing chart image: "photo"`.
- **`@borrowdale/core`, `@borrowdale/fills` and `@borrowdale/text`:** only the version changes.

Everything else 0.4.0 offered works as before. The website's playground has 17 parts-and-units
examples.

## 0.4.0

Published on 12 November 2026:

- **`@borrowdale/charts`:** classed colour legends state their classes truthfully. A quantile scale
  rejects classes that tied or nearly equal values would leave empty, a threshold break and a
  histogram edge must be written exactly by their axis' format, and the outer labels of a quantize or
  quantile legend round outward so that they hold every value. Errors name the option the spec
  gives, never one it leaves out, and say when a value is a default; an error that echoes a format's
  text writes its invisible and bidirectional characters as escapes.
- **Why a minor release:** about 13 errors now report a different `path`, and specs whose legend
  misstated its classes are rejected. The [`@borrowdale/charts` changelog](packages/charts/CHANGELOG.md)
  lists each moved path.
- **`@borrowdale/core`, `@borrowdale/fills` and `@borrowdale/text`:** only the version changes.

Everything else 0.3.0 offered works as before.

## 0.3.0

Published on 11 November 2026:

- **`@borrowdale/charts`:** colour by value. A chart's `colorAxis` colours cells through a
  sequential, diverging, quantize, quantile or threshold scale, with a ramp or class legend. It draws
  heatmaps on band or continuous axes, punch cards, hexagon heatmaps and correlation matrices, polar
  and radar heatmaps, calendar heatmaps over any date range, and horizon charts. A count cell of a
  `histogram2d` or `hexbin` series now keeps its hachure density when a `style` sets `fillStyle` or
  `hachureGap`.
- **`@borrowdale/core`, `@borrowdale/fills` and `@borrowdale/text`:** only the version changes.

Everything else 0.2.0 offered works as before. The website's playground has 15 colour-by-value
examples.

## 0.2.0

Published on 10 November 2026:

- **`@borrowdale/charts`:** histograms, and statistical and financial series on linear axes. These
  are distributions of a sample, relationships between paired observations, and prices with their
  indicators.
- **`@borrowdale/core/math`:** the portable exponential `exp`, with its argument limit `MAX_EXPONENT`.
- **`@borrowdale/fills` and `@borrowdale/text`:** only the version changes.

Everything 0.1.0 offered works as before. The website's playground has 40 statistical and financial
examples.

## 0.1.0

The first public release, published on 9 November 2026. Used in Node.js, the packages need version 22
or later.

The website, [borrowdalejs.com](https://borrowdalejs.com/), has an editable playground, three
open-data examples, the shared documentation and project information pages.
