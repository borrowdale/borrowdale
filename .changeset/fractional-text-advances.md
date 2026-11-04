---
"@borrowdale/text": patch
"@borrowdale/charts": patch
---

Request fractional glyph advances in SVG and canvas text rendering so text stays at its measured
width when Chromium uses full font hinting. SVG text now includes `text-rendering:geometricPrecision`
in its style, changing the serialized output of text and charts.
