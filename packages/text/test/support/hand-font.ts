import type { Font, FontFiles } from '@borrowdale/text';

/** Small enough to check by hand: a width is the sum of the advances × fontSize / 10. */
export const handFont: Font = {
  family: 'Hand Test',
  unitsPerEm: 10,
  ascender: 8,
  descender: -2,
  advances: { 0x20: 3, 0x41: 5, 0x42: 7, 0x0301: 0 },
};

/** Two files: one serving A, B and D, one serving the Cyrillic block. */
export const handFiles: FontFiles = {
  family: 'Hand Test',
  files: [
    { ranges: [[0x41, 0x42], [0x44, 0x44]], woff2: 'QUJD' },
    { ranges: [[0x400, 0x45f]], woff2: 'REVG' },
  ],
};

/** Where most tests lay text out: at (100, 50), 20 units high, in the hand font. */
export const at = { x: 100, y: 50, fontSize: 20, font: handFont };
