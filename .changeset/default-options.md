---
"@borrowdale/charts": minor
---

Errors name the option the spec gives, never one it leaves out, and say when a value is a default. Code that matches on an error's `path` sees these changes:

- a sweep of more than a turn with only `startAngle` given, on a pie, a polar angle axis or a gauge dial: `startAngle`, not `endAngle`;
- nested rings whose angles differ where a ring has the default: that ring, not its `startAngle` or `endAngle`;
- stacked areas whose curves differ where an area has the default: that series, not its `curve`;
- a serpentine timeline whose default rows do not fit: `axes.time.path`, not `axes.time.path.rows`;
- a given density `bandwidth` too small for the samples: `bandwidth`, not the series;
- a given polynomial `degree` with too few distinct x values: `degree`, not the series.

The messages also say when a value is a default: a ring inside its default hole, a polar chart without a radius axis, and a density whose default bandwidth is too small for its samples.
