# @borrowdale/fills

Hand-drawn SVG pattern fills for backgrounds and shapes. Every tile stroke is sketched, so patterns
match the rest of a Borrowdale drawing.

```sh
npm install @borrowdale/fills
```

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
| `kind` | — | `lines`, `cross-hatch`, `circles` |
| `size` | `10` | tile size in user units |
| `background` | transparent | colour behind the strokes: a hex code, a name, `rgb()`, `rgba()`, `hsl()` or `hsla()`, at most 100 characters |
| `id` | derived | `<pattern>` id: a letter followed by letters, digits, `_` or `-`, at most 94 characters |
| `seed` | derived | same seed, same strokes |

Any `@borrowdale/core` style option (`stroke`, `strokeWidth`, `strokeLineDash`, `roughness`, …)
applies to the tile strokes, and is checked as `sketch` checks it. An unknown `kind`, an invalid
`id`, a `size` that is not a finite number above 0, a `background` that is not a colour, or a
`seed` that is neither a string nor a finite number throws an error. The wording of these messages is
for people and can change in any release, so do not match on it in code.

A derived id comes from a 31-bit hash of every option, so tiles that differ in any option almost
always get different ids. Two `<pattern>` elements with the same id in one document make `url(#…)`
paint with only one of them, and options that give a chosen id are cheap to find on purpose. When
the options come from people you do not trust, set `id` yourself.

For hatched, dashed or zigzag fills *inside* a single shape, use `fillStyle` in `@borrowdale/core`
instead.

## License

MIT
