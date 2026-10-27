import type { FontFile, FontFiles } from './types.js';
import { checkFontFiles, codePointName, codePointOf, cssFamily, drawnForm, show } from './validate.js';

/**
 * `@font-face` rules that embed a font, for a `<style>` element. With `text`, only the files that
 * serve its characters are included; pass every label of the document, joined with spaces.
 * The rules hold no caller text, so they are safe to insert as markup.
 */
export function fontFaceCss(fontFiles: FontFiles, text?: string): string {
  return filesFor(fontFiles, text)
    .map(
      (file) =>
        `@font-face{font-family:${cssFamily(fontFiles.family)};` +
        `src:url(data:font/woff2;base64,${file.woff2}) format("woff2");` +
        `unicode-range:${unicodeRange(file)}}`,
    )
    .join('');
}

/**
 * Adds every file of a font to a page's fonts (`document.fonts`) and waits until they have loaded.
 * Every file, not only those some text needs: `drawText` can only check faces that are in the set,
 * so a face left out would let text in its range draw in a fallback font. The faces are made from
 * the files' bytes, not fetched from a URL, so no Content-Security-Policy blocks them. Needs
 * `FontFace` and `atob`.
 */
export async function loadFont(fonts: FontFaceSet, fontFiles: FontFiles): Promise<void> {
  checkFontFiles(fontFiles);
  const faces = fontFiles.files.map(
    (file) =>
      new FontFace(fontFiles.family, Uint8Array.from(atob(file.woff2), codePointOf), {
        unicodeRange: unicodeRange(file),
      }),
  );
  for (const face of faces) {
    fonts.add(face);
  }
  await Promise.all(faces.map((face) => face.load()));
}

function filesFor(fontFiles: FontFiles, text: string | undefined): readonly FontFile[] {
  checkFontFiles(fontFiles);
  if (text === undefined) {
    return fontFiles.files;
  }
  if (typeof text !== 'string') {
    throw new Error(`Text must be a string, got ${show(text)}`);
  }
  // The drawn form, so the files chosen serve the characters that are drawn. Each code point once:
  // the text is every label of a document, and may be long.
  const unique = new Set<number>();
  for (const character of drawnForm(text)) {
    unique.add(codePointOf(character));
  }
  const codePoints = [...unique];
  return fontFiles.files.filter((file) =>
    file.ranges.some(([first, last]) => codePoints.some((codePoint) => codePoint >= first && codePoint <= last)),
  );
}

function unicodeRange(file: FontFile): string {
  return file.ranges
    .map(([first, last]) =>
      first === last ? codePointName(first) : `${codePointName(first)}-${codePointName(last).slice(2)}`,
    )
    .join(',');
}
