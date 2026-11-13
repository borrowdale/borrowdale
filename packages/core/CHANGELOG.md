# @borrowdale/core

## 0.6.0

### Minor Changes

- 493f918: Add Venn and Euler diagrams. A `venn` series draws 2 or 3 sets as circles whose areas, and the areas of their overlaps, are in proportion to the sizes given, with a set inside another drawn inside it and sets that share nothing drawn apart. Every overlap must be given, 0 where sets do not overlap; 3 sets that circles cannot draw within 5% of the whole diagram's area, or that would leave a region out, are an error, as are 4 or more. `@borrowdale/core/math` now also exports `acos` and `atan2`, the same in every JavaScript engine.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.0

No changes in this release.

## 0.2.0

### Minor Changes

- db29b69: Draw distributions, binned observations, fitted trends, price charts and indicators from raw observations on linear axes.
  
  Expose the portable exponential `exp`, and its argument limit `MAX_EXPONENT`, through `@borrowdale/core/math`.

## 0.1.0

### Minor Changes

- 31fd9ea: First public release. The four packages share one version and are released together. Used in
  Node.js, they need version 22 or later.
