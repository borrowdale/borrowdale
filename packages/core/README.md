# @borrowdale/core

Deterministic hand-drawn shapes for SVG and canvas. The stroke engine began as a TypeScript port
of [rough.js](https://roughjs.com) 4.6.6 and has no runtime dependencies. It draws from its own
seeded random generator and its own trigonometry, so its output does not depend on the JavaScript
engine.

```sh
npm install @borrowdale/core
```

```js
import { sketch, toSvgDocument, toSvgPaths } from '@borrowdale/core';

const box = sketch(
  { kind: 'rectangle', x: 10, y: 10, width: 120, height: 60 },
  { fill: '#e76f51', fillStyle: 'hachure' },
);

const svg = toSvgDocument({ width: 140, height: 80, body: [toSvgPaths(box)] });
```

## Same input, same drawing

A sketch is reproducible: the same shape and options produce the same strokes on every render, on
the server and in the browser. Pass `seed` to vary a drawing. Without it, the seed is derived from
the shape itself.

The engine never calls `Math.random`, and computes sine, cosine and arctangent with plain
arithmetic instead of `Math.sin` and friends, whose last bit can differ between JavaScript engines.
The test suite draws every reference drawing of this package in Node.js and in Chromium and
requires identical output. Both run V8, so the test checks the build and the browser environment
rather than a different JavaScript engine; for Firefox and Safari the guarantee rests on the engine
using only exactly specified arithmetic. Coordinates are rounded to two decimals, which keeps the
markup small.

The drawing depends on the exact version of the stroke engine, which ships inside this package.
Use the same `@borrowdale/core` version on the server and in the browser.

## Shapes

| `kind` | Fields |
|---|---|
| `line` | `x1, y1, x2, y2` |
| `rectangle` | `x, y, width, height` |
| `ellipse` | `cx, cy, width, height` |
| `circle` | `cx, cy, diameter` |
| `arc` | `cx, cy, width, height, start, stop, closed?` (radians) |
| `polygon` | `points` |
| `linearPath` | `points` (open polyline) |
| `curve` | `points` (smooth curve through the points) |
| `path` | `d` (SVG path data) |

## Style

| Option | Applies to |
|---|---|
| `stroke`, `strokeWidth` | outline |
| `fill`, `fillStyle` (`hachure`, `solid`, `zigzag`, `cross-hatch`, `dashed`, `zigzag-line`, `dots`) | fill |
| `fillWeight`, `hachureAngle` (default −41°; use 41 to mirror), `hachureGap` | line-based fills; `dots` uses `fillWeight` as the dot size and `hachureGap` as the spacing, and ignores `hachureAngle` |
| `dashOffset`, `dashGap` | `dashed` fill |
| `zigzagOffset` | `zigzag-line` fill |
| `curveTightness` | `curve` shape |
| `curveStepCount`, `curveFitting` | curves, ellipses, circles and arcs |
| `roughness`, `bowing` | everything |

An option set to `undefined` counts as not set. Anything else is checked, and a value that cannot
be drawn throws an error naming the field or option, and the value where one was given:

- Every number a shape needs must be present and finite and within ±1,000,000, including every
  number inside `path` data. Sizes must not be negative. Numbers given as strings are rejected.
- `points` must be an array of `[x, y]` pairs: at least 3 for `polygon`, 2 for `linearPath` and
  `curve`. An arc's `stop` must be greater than its `start`, and `closed`, when given, a boolean.
- Unknown option names are rejected (`Unknown option: roughnes`). `roughness` and `bowing` must be
  from 0 to 10, `curveTightness` and `curveFitting` from 0 to 1, `curveStepCount` an integer from 1
  to 1000, and `hachureAngle` within ±1,000,000.

Valid input can still describe an enormous amount of work, such as a dashed fill with no dash
length or path data with a million segments. Each `sketch` call therefore stops after 200,000
units of drawing work and throws `Drawing too complex (more than 200000 operations)` instead of
hanging or running out of memory. The budget is coarse, with two known limits:

- A drawing just under the budget can still take a few seconds and produce several megabytes of
  path data (for example a fine `zigzag-line` fill over a 3000 × 3000 shape). Set your own time
  and size limits around `sketch` when the input is untrusted.
- A filled shape taller than about 66,000 units can exceed the budget even with a wide
  `hachureGap`, and whether it does depends on the seed. Keep filled shapes smaller, or scale the
  drawing down.

## Seeds and escaping

`toSeed(value)` turns any string or number into the seed a drawing uses, an integer from 1 to
2^31 − 1.

Without a `seed`, the seed comes from `stableKey(shape)`: the shape serialised with its keys sorted.
`{ x: 0, y: 0, … }` and `{ y: 0, x: 0, … }` are therefore drawn identically.

`svgElement(tag, attributes, children?)` builds an SVG element string and escapes every attribute
value. Use it to build your own markup around Borrowdale output:

```js
svgElement('rect', { width: 300, height: 200, fill: '#fdf8ef' });
// <rect width="300" height="200" fill="#fdf8ef"/>
```

`children`, and the `defs` and `body` of `toSvgDocument`, are inserted as markup without escaping.
Only pass markup you built yourself, never text from users.

`escapeAttribute(value)` escapes a single string for use inside a double-quoted attribute.

## Rendering

| Function | Output | Needs |
|---|---|---|
| `toSvgPaths(sketch)` | `<path>` markup string | nothing (SSR-safe) |
| `toSvgDocument({ width, height, defs?, body })` | complete `<svg>` string | nothing |
| `appendSketch(parent, sketch)` | appends `<path>` elements to an SVG element | a DOM |
| `drawSketch(context2d, sketch)` | draws into a canvas | `Path2D` |

The type declarations refer to DOM types (`Element`, `CanvasRenderingContext2D`), so TypeScript
projects need `"dom"` in `compilerOptions.lib`, even when they only render on the server.

## License

MIT. The stroke engine is ported from MIT-licensed code by Preet Shihn, and its trigonometry uses
constants from fdlibm; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
