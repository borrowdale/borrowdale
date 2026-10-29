import { fail } from './read.js';

/** Space around the whole chart. */
export const PAD = 8;
/** Space between a label and what it labels, and between parts of the chart. */
export const GAP = 6;
/** The share of each band's step left as a gap between bands. */
export const BAND_PADDING = 0.2;
/** The length of a tick mark. */
export const TICK = 5;

/** A box in the chart, by its four edges. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Throws when titles, legends and labels have left no room for the plot itself. */
export function assertRoom({ left, top, right, bottom }: Rect, width: number, height: number): void {
  if (right - left < 1 || bottom - top < 1) {
    fail(`a ${width} × ${height} chart`, 'leaves no room for the plot after its title, legend and labels');
  }
}
