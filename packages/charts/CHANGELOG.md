# @borrowdale/charts

## 0.6.0

### Minor Changes

- 493f918: Add Venn and Euler diagrams. A `venn` series draws 2 or 3 sets as circles whose areas, and the areas of their overlaps, are in proportion to the sizes given, with a set inside another drawn inside it and sets that share nothing drawn apart. Every overlap must be given, 0 where sets do not overlap; 3 sets that circles cannot draw within 5% of the whole diagram's area, or that would leave a region out, are an error, as are 4 or more. `@borrowdale/core/math` now also exports `acos` and `atan2`, the same in every JavaScript engine.

### Patch Changes

- Updated dependencies [493f918]
  - @borrowdale/core@0.6.0
  - @borrowdale/text@0.6.0

## 0.5.0

### Minor Changes

- 956bbe9: Add charts of parts and units. A `units` series draws each category as a count of equal units: a waffle, the seats of a parliament, rows of pictograms, or a segmented doughnut. A `funnel` series draws stages in turn: a funnel, back to back with another, a pyramid, a funnel area, or the bands of a silhouette given as SVG path data. A `liquid` series shows a level as liquid in a circle or a rectangle. A pie's `breakout` draws one slice's parts as a second pie, a band axis' `weights: "stacks"` sizes a Marimekko chart's columns by their stacks, and a bar's `shape: "pictorial"` repeats a symbol along it.

### Patch Changes

- 8623af9: Errors for a missing image, an image without raster bytes, or one without a Canvas source write the image's name quoted and escaped: a character in the name that could break or disguise a line, such as a bidirectional override, is written as its `\u` escape. The messages show the name in quotes, as in `Missing chart image: "photo"`. A name longer than 100 characters, which only a layout built by hand can hold, is described by its length instead.
- @borrowdale/core@0.5.0
  - @borrowdale/text@0.5.0

## 0.4.0

### Minor Changes

- cf0f2b4: Name the calendar option to change when a date or range is out of bounds, and say when an end is a default. Code that matches on an error's `path` sees these changes:
  
  - a date before a given `from` or after a given `to` is named at its place in `data`, where an omitted `to` was named before;
  - a range of more than 100,000 days names `data` when the data alone span that many days, and otherwise the series, with both ends and which of them is a default, where it always named `to`.
- ed4c47d: Keep a classed colour legend true to the classes it shows. A quantile scale now rejects classes that tied or nearly equal values would leave without a value, also between two different breaks, as documented, and a threshold scale rejects a break its legend cannot write exactly: with a fixed `format.decimals`, one such as 0.5 written as 1, and otherwise one with more than 20 decimals. Both drew a legend that misstated the classes. The two outer labels of a quantize or quantile legend are rounded outward, so they hold every value: a lowest value of `-0.04` written to one decimal is now labelled `-0.1`, not `0.0`.
  
  Colour axis errors name the option to change, and say when a value is a default. Code that matches on an error's `path` sees these changes:
  
  - a colour scale too wide for its legend row, with a title: `legend`, or `''` when the legend is placed by default, not `colorAxis.title`; without a title and placed by default: `''`, not `legend`;
  - a quantile scale with the default 5 classes: `colorAxis`, not `colorAxis.classes`;
  - horizon rows whose `layers` are the default: the series, not its `layers`;
  - a horizon colour axis with only `max`: `colorAxis.max`, not `colorAxis.min`;
  - a diverging scale with no value between its ends for the default midpoint: `colorAxis`, not `colorAxis.midpoint`.
  
  A diverging scale's midpoint error now writes the domain's ends exactly.
- b726aaa: Errors name the option the spec gives, never one it leaves out, and say when a value is a default. Code that matches on an error's `path` sees these changes:
  
  - a sweep of more than a turn with only `startAngle` given, on a pie, a polar angle axis or a gauge dial: `startAngle`, not `endAngle`;
  - nested rings whose angles differ where a ring has the default: that ring, not its `startAngle` or `endAngle`;
  - stacked areas whose curves differ where an area has the default: that series, not its `curve`;
  - a serpentine timeline whose default rows do not fit: `axes.time.path`, not `axes.time.path.rows`;
  - a given density `bandwidth` too small for the samples: `bandwidth`, not the series;
  - a given polynomial `degree` with too few distinct x values: `degree`, not the series.
  
  The messages also say when a value is a default: a ring inside its default hole, a polar chart without a radius axis, and a density whose default bandwidth is too small for its samples.
- cd5b9c8: Reject a histogram edge that the x axis' format cannot write exactly: with a fixed `format.decimals`, one such as 0.5 written as 1, and otherwise one with more than 20 decimals. Each bin's tooltip states its edges, and a rounded edge misstated the bin, or wrote an empty one such as `[1, 1)`.

### Patch Changes

- @borrowdale/core@0.4.0
  - @borrowdale/text@0.4.0

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
