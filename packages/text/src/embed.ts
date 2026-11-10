import { show } from '@borrowdale/core/internal';
import type { FontFiles } from './types.js';
import {
  checkFontFiles,
  checkText,
  codePointName,
  codePointOf,
  cssFamily,
  IGNORABLE,
  type CheckedFontFile,
  type CheckedFontFiles,
} from './validate.js';

// The file each face `loadFont` made came from, so a later call can tell which files a set has.
const sources = new WeakMap<FontFace, { unicodeRange: string; woff2: string }>();

/**
 * `@font-face` rules that embed a font, for a `<style>` element. With `labels`, only the files that
 * serve them are included; pass every label of the document. The rules hold no caller text, so they
 * are safe to insert as markup.
 */
export function fontFaceCss(fontFiles: FontFiles, labels?: readonly string[]): string {
  // Only the checked copy is read from here on: a getter on the caller's object could otherwise pass
  // the checks and then return markup.
  const checked = checkFontFiles(fontFiles);
  return filesFor(checked, labels)
    .map(
      (file) =>
        `@font-face{font-family:${cssFamily(checked.family)};` +
        `src:url(data:font/woff2;base64,${file.woff2}) format("woff2");` +
        `unicode-range:${unicodeRange(file)}}`,
    )
    .join('');
}

/**
 * Adds every file of a font to a page's fonts (`document.fonts`), except those an earlier call
 * already added, and waits until every face of the font's family there has loaded or failed, or
 * until a face it made fails. Every file, not only those some text needs: `drawText` can only check
 * faces that are in the set, so a face left out would let text in its range draw in a fallback
 * font. Every face of the family, not only these: `drawText` also counts faces from elsewhere, such
 * as those of `fontFaceCss` rules, which stay unloaded until the page draws text with them. Those
 * are fetched if they come from a URL, with no time limit, and one that fails does not fail this
 * call; `drawText` then throws for any text in that face's range, even where this call's faces
 * could draw it. This call fails only if a face that `loadFont` made for the family, in this call
 * or an earlier one, cannot load. Its faces are made from the files' bytes, not fetched from a URL,
 * so no Content-Security-Policy blocks them. Needs `FontFace` and `atob`.
 */
export async function loadFont(fonts: FontFaceSet, fontFiles: FontFiles): Promise<void> {
  const checked = checkFontFiles(fontFiles);
  const faces = facesOf(fonts, checked.family);
  for (const file of checked.files) {
    const source = { unicodeRange: unicodeRange(file), woff2: file.woff2 };
    const added = faces.some((face) => {
      const made = sources.get(face);
      return made?.woff2 === source.woff2 && made.unicodeRange === source.unicodeRange;
    });
    if (!added) {
      // From the bytes just recorded, so the face is made from exactly the file it is recorded as.
      const face = new FontFace(checked.family, Uint8Array.from(atob(source.woff2), codePointOf), {
        unicodeRange: source.unicodeRange,
      });
      sources.set(face, source);
      fonts.add(face);
      faces.push(face);
    }
  }
  await Promise.all(faces.map((face) => (sources.has(face) ? face.load() : face.load().catch(() => face))));
}

/**
 * The faces of a family in a FontFaceSet, whose family the page may report in quotes. CSS matches
 * family names without regard to ASCII case; this ignores all case, which differs only for a
 * page's face with a non-ASCII family name, and checked families are ASCII.
 */
export function facesOf(fonts: FontFaceSet, family: string): FontFace[] {
  const name = family.toLowerCase();
  const faces: FontFace[] = [];
  fonts.forEach((face) => {
    if (face.family.replace(/^"(.*)"$/, '$1').toLowerCase() === name) {
      faces.push(face);
    }
  });
  return faces;
}

function filesFor(fontFiles: CheckedFontFiles, labels: readonly string[] | undefined): readonly CheckedFontFile[] {
  if (labels === undefined) {
    return fontFiles.files;
  }
  if (!Array.isArray(labels)) {
    throw new Error(`Labels must be an array, got ${show(labels)}`);
  }
  // Each label checked as layoutText checks it, and in the form it is drawn, so the files chosen
  // serve exactly the characters that are drawn: spaces at a label's ends and characters drawn as
  // nothing select no file. Each code point once: the labels are every label of a document.
  const unique = new Set<number>();
  for (const label of labels) {
    for (const character of checkText(label)) {
      if (!IGNORABLE.test(character)) {
        unique.add(codePointOf(character));
      }
    }
  }
  const codePoints = [...unique];
  return fontFiles.files.filter((file) =>
    file.ranges.some(([first, last]) => codePoints.some((codePoint) => codePoint >= first && codePoint <= last)),
  );
}

function unicodeRange(file: CheckedFontFile): string {
  return file.ranges
    .map(([first, last]) =>
      first === last ? codePointName(first) : `${codePointName(first)}-${codePointName(last).slice(2)}`,
    )
    .join(',');
}
