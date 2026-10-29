# Accessibility and limitations

Hand-drawn styling should support the information rather than hide it. Accessibility depends on the application around the chart as well as the generated drawing.

## Make the meaning available

- Give charts descriptive titles and series names.
- Include a written summary of the important result and the units or baseline.
- Provide an accessible data alternative when exact values matter.
- Do not communicate differences through color alone; use labels, patterns and context.
- Keep text legible and check contrast against the background.

SVG output exposes chart descriptions and labels. Canvas is a bitmap: provide an accessible name and an equivalent explanation or data view in the surrounding HTML. A tooltip alone is not a keyboard-accessible data alternative.

## Data contracts

Missing values are supported only where documented for the series type. For example, a line can use `null` to create a gap, while radar values must be nonnegative numbers. Do not replace missing observations with zero just to draw them.

Stacked areas require nonnegative values. Chart families have specific axis requirements and cannot all be mixed together. Consult the [chart reference](../packages/charts/README.md) before composing series.

## Scope and verification

The packages are early-development software. React, SVG wrapper and custom-element packages listed as planned in the repository README are not shipped APIs.

The repository's parity tests compare Node and Chromium. Both use V8; passing those tests does not establish equivalent behavior in every browser engine. Test your own target browsers, assistive technologies and data volumes.

The playground is a synchronous example editor, not a full bundler or application framework. Full dashboards use saved data snapshots, with attribution and dates shown on each example.
