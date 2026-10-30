# @borrowdale/fills

Hand-drawn SVG pattern fills for backgrounds and shapes. Every tile stroke is sketched, so patterns
match the rest of a Borrowdale drawing.

> **Unpublished:** use the [local workspace setup](https://github.com/borrowdale/borrowdale/blob/main/apps/site/content/getting-started.md). Package installation instructions will be added when releases are available.

```js
import { svgElement, toSvgDocument } from '@borrowdale/core';
import { pattern } from '@borrowdale/fills';

const paper = pattern({ kind: 'lines', size: 12, stroke: '#d8cfc0', background: '#fdf8ef' });

const svg = toSvgDocument({
  width: 300,
  height: 200,
  defs: [paper.def],
  body: [svgElement('rect', { width: 300, height: 200, fill: paper.fill })],
});
```

## Options

| Option | Default | |
|---|---|---|
| `kind` | — | `lines`, `crosshatch`, `circles` |
| `size` | `10` | tile size in user units |
| `background` | transparent | colour behind the strokes |
| `id` | derived | `<pattern>` id: a letter followed by letters, digits, `_` or `-` |
| `seed` | derived | same seed, same strokes |

Any `@borrowdale/core` style option (`stroke`, `strokeWidth`, `strokeLineDash`, `roughness`, …)
applies to the tile strokes, and is checked as `sketch` checks it. Tiles that differ in any option
get different ids, unless you set `id` yourself. An unknown `kind`, an invalid `id`, or a `size`
that is not a finite number above 0 throws an error.

For hatched, dashed or zigzag fills *inside* a single shape, use `fillStyle` in `@borrowdale/core`
instead.

## License

MIT
