---
"@borrowdale/charts": minor
---

Keep a classed colour legend true to the classes it shows. A quantile scale now rejects classes that tied or nearly equal values would leave without a value, also between two different breaks, as documented, and a threshold scale rejects a break its legend cannot write exactly: with a fixed `format.decimals`, one such as 0.5 written as 1, and otherwise one with more than 20 decimals. Both drew a legend that misstated the classes. The two outer labels of a quantize or quantile legend are rounded outward, so they hold every value: a lowest value of `-0.04` written to one decimal is now labelled `-0.1`, not `0.0`.

Colour axis errors name the option to change, and say when a value is a default. Code that matches on an error's `path` sees these changes:

- a colour scale too wide for its legend row, with a title: `legend`, or `''` when the legend is placed by default, not `colorAxis.title`; without a title and placed by default: `''`, not `legend`;
- a quantile scale with the default 5 classes: `colorAxis`, not `colorAxis.classes`;
- horizon rows whose `layers` are the default: the series, not its `layers`;
- a horizon colour axis with only `max`: `colorAxis.max`, not `colorAxis.min`;
- a diverging scale with no value between its ends for the default midpoint: `colorAxis`, not `colorAxis.midpoint`.

A diverging scale's midpoint error now writes the domain's ends exactly.
