import type { FontFile, FontFiles } from './types.js';
import { checkFontFiles, codePointName, codePointOf, cssFamily, drawnForm, isFamily, show } from './validate.js';

type FaceSource = { family: string; unicodeRange: string; woff2: string };

// What each face `loadFont` made was made from, so a later call can tell which files a set has.
const sources = new WeakMap<FontFace, FaceSource>();

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
 * Adds every file of a font to a page's fonts (`document.fonts`), except those an earlier call
 * already added, and waits until every face of the font's family there has loaded. Every file, not
 * only those some text needs: `drawText` can only check faces that are in the set, so a face left
 * out would let text in its range draw in a fallback font. Every face of the family, not only these:
 * `drawText` also counts faces from elsewhere, such as those of `fontFaceCss` rules, which stay
 * unloaded until the page draws text with them. The faces are made from the files' bytes, not
 * fetched from a URL, so no Content-Security-Policy blocks them. Needs `FontFace` and `atob`.
 */
export async function loadFont(fonts: FontFaceSet, fontFiles: FontFiles): Promise<void> {
  checkFontFiles(fontFiles);
  const { family } = fontFiles;
  const faces: FontFace[] = [];
  fonts.forEach((face) => {
    if (isFamily(face, family)) {
      faces.push(face);
    }
  });
  for (const file of fontFiles.files) {
    const source = { family, unicodeRange: unicodeRange(file), woff2: file.woff2 };
    if (!faces.some((face) => isSource(sources.get(face), source))) {
      const face = new FontFace(family, Uint8Array.from(atob(file.woff2), codePointOf), {
        unicodeRange: source.unicodeRange,
      });
      sources.set(face, source);
      fonts.add(face);
      faces.push(face);
    }
  }
  await Promise.all(faces.map((face) => face.load()));
}

function isSource(made: FaceSource | undefined, wanted: FaceSource): boolean {
  return (
    made !== undefined &&
    made.family === wanted.family &&
    made.unicodeRange === wanted.unicodeRange &&
    made.woff2 === wanted.woff2
  );
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
