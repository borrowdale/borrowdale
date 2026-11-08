// The longest colour or paint accepted. Every mark writes its paints into the output, so a long one
// would multiply the size of a drawing.
export const MAX_PAINT = 100;
// What renderers read as a colour: hex codes, names, rgb() and hsl(). Anything else, like a `url(…)`
// naming another file or a `var(…)`, would have an SVG fetch a file or paint with a value the page
// sets. The CSS-wide keywords `inherit`, `initial`, `unset` and `revert` look like names but are
// not colours: SVG takes them from the parent element, and a canvas ignores them.
const COLOR =
  /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?!(?:inherit|initial|unset|revert)$)[a-z]+|(?:rgba?|hsla?)\((?=[^)]*\d)(?:[\d .,%/+-]|deg|g?rad|turn)*\))$/i;
// A pattern or gradient in the same document, like the `fill` that @borrowdale/fills returns.
const LOCAL_PAINT = /^url\(#[A-Za-z][\w-]*\)$/;
// Characters an XML document cannot contain, so SVG markup holding them does not parse: C0 controls
// other than tab, line feed and carriage return, U+FFFE, U+FFFF and unpaired surrogates. With the `u`
// flag a surrogate pair is one character, so the surrogate range matches only unpaired halves.
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿\uD800-\uDFFF]/u;

/** How the error messages of every package describe a colour. */
export const COLOR_RULE = 'a colour (a hex code, a name, rgb() or hsl())';
/** How the error messages of every package describe a colour or a paint in the same document. */
export const PAINT_RULE = `${COLOR_RULE} or url(#id), at most ${MAX_PAINT} characters`;

/** A colour: a hex code, a name, rgb() or hsl(). */
export function isColor(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_PAINT && COLOR.test(value);
}

/** A colour, or a pattern or gradient in the same document, written `url(#id)`. */
export function isPaint(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_PAINT && isPaintForm(value);
}

/**
 * A colour or `url(#id)` of any length. What renderers check of a sketch: its paints are kept out of
 * markup and fetches either way, and a chart's gradients are named with an id prefix of up to 100
 * characters, so the length limit belongs to options rather than to drawing.
 */
export function isPaintForm(value: unknown): value is string {
  return typeof value === 'string' && (COLOR.test(value) || LOCAL_PAINT.test(value));
}

/** The first character of `value` that an XML document cannot hold, written `U+0001`, if any. */
export function notXml(value: string): string | undefined {
  const found = NOT_XML.exec(value);
  return found === null ? undefined : `U+${found[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}
