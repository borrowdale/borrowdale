# @borrowdale/core

Deterministic hand-drawn shapes for SVG and canvas, built on [rough.js](https://roughjs.com).

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
the server and in the browser, with the exceptions listed below. Pass `seed` to vary a drawing. Without it, the seed is derived from
the shape itself.

Coordinates are rounded to two decimals. JavaScript engines, and even different V8 versions, can
disagree in the last bit of `Math.sin` and `Math.cos`. Rounding hides that difference in the
coordinates, but it can still change how many dashes or zigzags a fill draws.

In a comparison between Node.js and Chrome, output was byte-identical for unfilled shapes and for
the `hachure`, `cross-hatch`, `zigzag` and `solid` fills on every shape kind tested. It was **not**
identical for the `dashed` and `zigzag-line` fills on ellipses, circles and `path` shapes containing
arc (`A`) commands: about 2–5% of those drawings had a dash or zigzag more or fewer. This is a
measurement, not a guarantee.

The drawing depends on the exact version of the stroke engine and its dependencies. Use the same
`@borrowdale/core` version, installed from the same lockfile, on the server and in the browser.

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
| `fill`, `fillStyle` (`hachure`, `solid`, `zigzag`, `cross-hatch`, `dashed`, `zigzag-line`) | fill |
| `fillWeight`, `hachureAngle` (default −41°; use 41 to mirror), `hachureGap` | line-based fills |
| `dashOffset`, `dashGap` | `dashed` fill |
| `zigzagOffset` | `zigzag-line` fill |
| `curveTightness` | `curve` shape |
| `curveStepCount`, `curveFitting` | curves, ellipses, circles and arcs |
| `roughness`, `bowing` | everything |

An option set to `undefined` counts as not set. Basic checks reject common mistakes with an error:
non-finite numbers, coordinates or sizes beyond ±1,000,000, negative sizes, an arc whose `stop` is
not after its `start`, too few points, and `curveStepCount` outside 1–1000.

These checks do **not** make `sketch` safe for untrusted input. Some values that pass them, such
as `dashGap: 0` together with `dashOffset: 0`, `zigzagOffset: 0`, very large filled shapes, or
large coordinates inside a filled `path`, can make drawing extremely slow or exhaust memory. Validate untrusted data before passing it in.

## Seeds and escaping

`toSeed(value)` turns any string or number into the seed a drawing uses. It never returns 0,
because rough.js treats 0 as "unseeded" and would draw differently each time.

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

MIT
