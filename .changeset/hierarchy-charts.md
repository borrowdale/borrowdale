---
'@borrowdale/charts': minor
---

Add hierarchies. A `hierarchy` series draws a tree of named values, its `data` the root, as a treemap (tiled `squarify`, `binary`, `dice`, `slice` or `sliceDice`, its `parents` `hidden`, `nested` with each named, or `cascaded`), a sunburst (whole, a semicircle, or with rounded segments), an icicle running in any of four `direction`s (`up` makes a flame graph), or packed circles (`pack`). A leaf's area, or its length across its band, is in proportion to its value, and a parent's value is the sum of its children's. Each branch below the root takes the next palette colour, which every node below it shares unless it gives its own; the legend lists the branches. Names are written inside their marks, cut short with an ellipsis where they do not fit and left out where not one character does, and every mark's tooltip gives its path and value. A tree has at most 2,000 nodes and 10 levels below its root.
