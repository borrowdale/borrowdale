---
"@borrowdale/core": minor
"@borrowdale/charts": minor
---

Add Venn and Euler diagrams. A `venn` series draws 2 or 3 sets as circles whose areas, and the areas of their overlaps, are in proportion to the sizes given, with a set inside another drawn inside it and sets that share nothing drawn apart. Every overlap must be given, 0 where sets do not overlap; 3 sets that circles cannot draw within 5% of the whole diagram's area, or that would leave a region out, are an error, as are 4 or more. `@borrowdale/core/math` now also exports `acos` and `atan2`, the same in every JavaScript engine.
