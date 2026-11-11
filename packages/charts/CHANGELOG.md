# @borrowdale/charts

## 0.3.0

### Minor Changes

- 21c6513: Colour cells by value through a chart's new `colorAxis`, with sequential, diverging, quantize, quantile and threshold scales and a ramp or class legend. Draw heatmaps on band or continuous axes, punch cards, hexagon heatmaps and correlation matrices, polar and radar heatmaps, calendar heatmaps over any date range, and horizon charts.
  
  A count cell of a `histogram2d` or `hexbin` series now keeps its hachure density when the chart's or the series' `style` sets `fillStyle` or `hachureGap`.

### Patch Changes

- @borrowdale/core@0.3.0
  - @borrowdale/text@0.3.0

## 0.2.0

### Minor Changes

- 04c51b8: Add histograms for raw numeric samples with explicit bin edges, stacked series, relative frequencies and cumulative counts.
- db29b69: Draw distributions, binned observations, fitted trends, price charts and indicators from raw observations on linear axes.
  
  Expose the portable exponential `exp`, and its argument limit `MAX_EXPONENT`, through `@borrowdale/core/math`.

### Patch Changes

- Updated dependencies [db29b69]
  - @borrowdale/core@0.2.0
  - @borrowdale/text@0.2.0

## 0.1.0

### Minor Changes

- 31fd9ea: First public release. The four packages share one version and are released together. Used in
  Node.js, they need version 22 or later.

### Patch Changes

- Updated dependencies [31fd9ea]
  - @borrowdale/core@0.1.0
  - @borrowdale/text@0.1.0
