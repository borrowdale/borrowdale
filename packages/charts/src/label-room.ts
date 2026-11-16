// Where labels already placed lie, so a new one can be kept from crossing them: a timeline's event
// labels, a tree's names.
import type { Extent } from './drawing.js';
import type { Rect } from './frame.js';

// The side of a cell of the grid that finds labels near a new one: at least 64 units, and 4 lines,
// so a label is in few cells whatever the font size.
const CELL = 64;
const CELL_LINES = 4;

/** A label's box on the chart, from its extent about the point it is placed at. */
export function boxAt({ left, right, up, down }: Extent, x: number, y: number): Rect {
  return { left: x - left, right: x + right, top: y - up, bottom: y + down };
}

/** The boxes of the labels placed so far, in a grid of cells, so a new one is checked only against those near it. */
export class LabelRoom {
  readonly #cells = new Map<string, Rect[]>();
  readonly #size: number;

  constructor(line: number) {
    this.#size = Math.max(CELL, CELL_LINES * line);
  }

  /** Whether `box` overlaps no box placed so far. A box with no area, as an empty label has, takes no room. */
  clear(box: Rect): boolean {
    return !hasArea(box) || !this.#some(box, (key) => this.#cells.get(key)?.some((other) => overlaps(box, other)) ?? false);
  }

  add(box: Rect): void {
    if (hasArea(box)) {
      this.#some(box, (key) => {
        const cell = this.#cells.get(key) ?? [];
        cell.push(box);
        this.#cells.set(key, cell);
        return false;
      });
    }
  }

  // Whether `found` is true of a cell `box` is in, asked of each in turn until it is.
  #some({ left, top, right, bottom }: Rect, found: (key: string) => boolean): boolean {
    const size = this.#size;
    for (let column = Math.floor(left / size); column <= Math.floor(right / size); column++) {
      for (let row = Math.floor(top / size); row <= Math.floor(bottom / size); row++) {
        if (found(`${column} ${row}`)) return true;
      }
    }
    return false;
  }
}

function hasArea(box: Rect): boolean {
  return box.right > box.left && box.bottom > box.top;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}
