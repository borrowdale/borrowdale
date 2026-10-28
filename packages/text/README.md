# @borrowdale/text

Hand-written text for SVG and canvas. Labels are measured from the font's own advance widths, with
no DOM, so a chart can size its axes from the labels it is about to draw, on the server or in the
browser, and get the same numbers in both. The default font is
[Excalifont](https://plus.excalidraw.com/excalifont), bundled with the package.

```sh
npm install @borrowdale/text
```

```js
import { svgElement, toSvgDocument } from '@borrowdale/core';
import { fontFaceCss, layoutText, measureText, toSvgText } from '@borrowdale/text';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';

measureText('12,500', { fontSize: 12 });
// { text: '12,500', width: 39.96, ascent: 10.63, descent: 4.49, missing: [] }

const label = layoutText('12,500', { x: 60, y: 40, fontSize: 12, anchor: 'end', baseline: 'middle' });

const svg = toSvgDocument({
  width: 120,
  height: 80,
  defs: [svgElement('style', {}, fontFaceCss(excalifontFiles, [label.text]))],
  body: [toSvgText(label)],
});
```

## Measuring

`measureText(text, { fontSize?, font? })` returns the `width`, `ascent` and `descent` of the text,
rounded to two decimals. `fontSize` defaults to 16 and `font` to Excalifont.

`layoutText(text, options)` measures the text and places it. The renderers only draw what it
returns; they never measure.

| Option | Default | |
|---|---|---|
| `x`, `y` | required | where the text goes |
| `fontSize` | 16 | in user units |
| `anchor` | `start` | which part of the text sits at `x`: `start`, `middle` or `end` |
| `baseline` | `alphabetic` | which line of the text sits at `y`: `alphabetic` (the baseline), `top`, `middle` or `bottom` |
| `rotate` | 0 | clockwise degrees around (`x`, `y`), from −360 to 360 |
| `font` | Excalifont | |

The result holds the drawing position (`x`, `y` of the baseline start), the `width`, `ascent` and
`descent`, the `box` the text takes up before rotation, `rotate`, the rotation `pivot`, and the
`family` and `fontSize` it is drawn in. A layout is plain JSON. The renderers draw a layout as it
is and do not check it again, so draw only layouts that `layoutText` returned.

Both return the text exactly as it will be drawn, which is the text that was measured:

- variation selectors 15 and 16 and bidirectional controls removed, because they switch
  characters to and from emoji and reorder the text in ways a measurement cannot follow;
- accents composed (Unicode NFC), because browsers draw `e` followed by U+0301 as `é`, which can
  have a different width;
- runs of spaces and tabs collapsed to one space, and spaces at either end removed, as SVG does.

A character the font does not cover is measured as 1 em wide and listed in `missing`, with any
combining marks after it (below); `missing` lists each such piece of text once. The browser still
draws it, usually in a fallback font at that font's width (an accented letter may
instead be drawn from its letter and accent in this font), so the measurement is then approximate.
Check `missing` when it matters. Characters browsers draw as nothing, such as the soft hyphen, the
zero-width joiner and the remaining variation selectors, are measured as nothing. The few such
characters Chromium draws with a width (the Hangul fillers U+3164 and U+FFA0, U+180F and
U+1BCA0-U+1BCA3) count as uncovered.

A browser draws a character and the combining marks after it from one font file, or all of them in
a fallback font, so `missing` lists a letter together with its marks. Excalifont keeps most of its
marks in other files than its letters, so a letter with a mark that cannot be composed with it into
one character (a Cyrillic stress mark, for example) is drawn in a fallback font and listed:
`measureText('приве́т').missing` is `['е́']`. It is measured at Excalifont's widths, so the
measurement is then approximate.

Kerning and ligatures are not applied when measuring, and every renderer switches them off, so the
drawn text is as wide as measured. The test suite draws every reference label the font covers in
Chromium, through all three renderers, and requires the drawn width to match the measured width
within 0.05 user units. That is verified in headless Chromium on macOS. Other browsers and
platforms are not tested: a browser that rounds each glyph to whole pixels draws text a little
wider or narrower, and on a canvas other browsers rely on `fontKerning` and `textRendering` where
they support them.

## Rendering

| Function | Output | Needs |
|---|---|---|
| `toSvgText(layout, style?)` | `<text>` markup string | nothing (SSR-safe) |
| `appendText(parent, layout, style?)` | appends a `<text>` element to an SVG element | a DOM |
| `drawText(context2d, layout, style?)` | draws into a canvas or an OffscreenCanvas | the font loaded |

`style` takes `fill` (default `#000`). The text and every attribute are escaped. `fill` is passed
to the browser as it is: a value that is not a colour is ignored, so SVG text then takes its
parent's fill and a canvas keeps the fill it had.

The font has to reach whoever views the drawing:

- **An SVG document** carries it in a `<style>` element: `fontFaceCss(excalifontFiles, labels)`
  returns `@font-face` rules for only the font files that `labels` need. Pass every label of the
  document. Each label counts as it is drawn, so the spaces at either end of a label and characters
  drawn as nothing, such as the soft hyphen, add no file. Latin text needs one file of about 34 KB;
  the whole font is about 88 KB.
- **A page** can use the same rules, or load every file of the font with
  `await loadFont(document.fonts, excalifontFiles)`. A second call adds no file the first one
  added. It hands the browser the font's bytes rather than a URL, so a Content-Security-Policy's
  `font-src` does not block it.
- **A canvas** draws once and never redraws, so text drawn before its font has loaded would keep
  a fallback font. `drawText` throws `Font not loaded` instead. Load the font with `loadFont`
  first, not with `fontFaceCss(files, labels)` alone: the browser only knows about the files those
  rules name, so `drawText` cannot tell that text outside them would fall back. A page can have
  both: `drawText` also counts the faces of `fontFaceCss` rules, which stay unloaded until the page
  draws text with them, so `loadFont` loads every face of the font's family the page already has.
  Call it after adding such rules, and again after adding more. It fetches any of those faces that
  come from a URL and waits for them, with no time limit. One that cannot load, as the rules'
  faces cannot under a `font-src` that blocks `data:` URLs, does not make `loadFont` fail, but
  `drawText` then throws for any text in that face's range, even where `loadFont`'s own faces could
  draw it: on such a page, leave the rules out or allow `data:` fonts. `loadFont` fails only if a
  face it made for the family, in that call or an earlier one, cannot load.

Fonts and font files must come from you, never from chart data: a family name is global to the
page, so a font file named like one of the page's own fonts would redraw the page's text, and
measuring reads every range of a font's files for each label.

SVG text drawn before its font has loaded is redrawn by the browser when the font arrives.

The type declarations refer to DOM types (`Element`, `CanvasRenderingContext2D`, `FontFaceSet`), so
TypeScript projects need `"dom"` in `compilerOptions.lib`, even when they only render on the server.

The measurement assumes nothing around the text changes how it is drawn. Do not apply
`letter-spacing`, `word-spacing`, `font-weight`, `font-style`, `font-stretch`, `font-variant`,
`font-feature-settings`, `text-transform`, `text-anchor`, `dominant-baseline` or
`alignment-baseline` to Borrowdale text through CSS or a parent element, and keep stylesheet rules
that select the text elements themselves (`.tick text { font-size: 10px }`) away from them: such a
rule overrides the font family and size the renderers set. The renderers keep the text left to
right against the page, a parent element and such rules, unless a rule is `!important`, and
except `toSvgText` text under a Content-Security-Policy that blocks its `style` attribute (below):
there only its `direction` attribute remains, and a stylesheet rule overrides that. A page's
`lang` can switch on a language's own letter forms: on a Catalan (`ca`) page, `l·l` draws narrower
than measured.

`toSvgText` sets the direction and switches kerning and ligatures off with a `style` attribute, and
embedded fonts arrive in a `<style>` element. A Content-Security-Policy without `'unsafe-inline'`
in `style-src` blocks both, and the embedded fonts also need `data:` in `font-src`: use
`appendText`, which sets the same properties through the CSSOM, and load the font with `loadFont`.

## Validation

A value that cannot be drawn throws an error naming it:

- Text must be a string of at most 1,000 characters (UTF-16 code units), both as given and with
  its accents composed, on one line: line feed, carriage return, U+0085, U+2028 and U+2029 are
  rejected. Characters an XML document cannot hold (C0 control characters other than tab, U+FFFE,
  U+FFFF, unpaired surrogates) are rejected.
- `fontSize` must be greater than 0 and at most 10,000. `x` and `y` must be within ±1,000,000.
- A `Font`'s `family` must be letters, digits, spaces, hyphens and underscores, starting and ending
  with a letter or digit. `unitsPerEm` must be from 1 to 16,384, `ascender` from 0 to 32,767,
  `descender` from −32,768 to 0, and every advance from 0 to 65,535. Its `files`, when given, must
  be one or more files, each with one or more `[first, last]` ranges of code points, as `FontFiles`
  files must.
- `fill` must be a string without characters an XML document cannot hold.
- `fontFaceCss`'s labels must be an array, and each label must pass the checks for text above.
- Unknown option names are rejected (`Unknown option: fontSzie`). An option set to `undefined`
  counts as not set. Only an options object's own properties are read: inherited values, including
  any on `Object.prototype`, are ignored.

## Fonts

A `Font` holds what measuring needs: `family`, `unitsPerEm`, `ascender`, `descender` and the
`advances` of the code points it covers. A font split into files by Unicode range, as Excalifont
is, also lists its `files`, each with the `ranges` of code points it serves: its `FontFiles` files
without their bytes. Measuring uses them to find a letter and its combining marks that no one
file serves together, or a character no file serves, which the browser draws in a fallback font.
Leave `files` out for a font in one file. `files` is read only as the font's own property: a font
that inherits it, through `Object.create` for example, counts as one file. `excalifont` is the
default. Measurement and rendering both take the family from the `Font`, so a label is always drawn
in the font it was measured with.

`FontFiles` holds a font's woff2 files as base64, each with the code points it serves. Excalifont's
are in `@borrowdale/text/excalifont-files`, a separate entry point, so code that only measures does
not load them.

Excalifont covers printable ASCII, Cyrillic (U+0400 to U+045F) and most of Latin-1, Latin
Extended-A and Greek. It lacks ¤ § ¬ ² ³ µ ¹, ĸ Ŋ ŋ ſ, and Δ Ω, which are measured as 1 em and
listed in `missing`.

## License

The code is MIT. Excalifont is licensed under the SIL Open Font License 1.1; see [OFL.txt](OFL.txt).
Excalifont was designed by Ján Filípek (DizajnDesign), based on Virgil by Your Own Font Foundry.
It is copyright Excalidraw, and "Excalifont" is a trademark of Excalidraw. This package is not
affiliated with Excalidraw. The font files are included unchanged.
