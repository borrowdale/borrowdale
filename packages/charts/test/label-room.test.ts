import { describe, expect, it } from 'vitest';
import type { Rect } from '../src/frame.js';
import { LabelRoom } from '../src/label-room.js';

// A label placed from (100, 100) to (140, 112), in a room with lines 12 tall.
const PLACED: Rect = { left: 100, top: 100, right: 140, bottom: 112 };

/** A room holding PLACED. */
function roomWithPlaced(): LabelRoom {
  const room = new LabelRoom(12);
  room.add(PLACED);
  return room;
}

describe('the room labels take', () => {
  it.each([
    ['a box over the placed one', { left: 130, top: 105, right: 170, bottom: 117 }, false],
    ['a box inside the placed one', { left: 110, top: 102, right: 120, bottom: 110 }, false],
    ['a box touching its right edge', { left: 140, top: 100, right: 180, bottom: 112 }, true],
    ['a box touching its bottom edge', { left: 100, top: 112, right: 140, bottom: 124 }, true],
    ['a box with no area inside it', { left: 120, top: 104, right: 120, bottom: 108 }, true],
    ['a box far from it, in another cell', { left: 900, top: 900, right: 940, bottom: 912 }, true],
    ['a box across a cell boundary from it', { left: 60, top: 100, right: 101, bottom: 112 }, false],
  ])('find %s clear or not', (_, box, clear) => {
    expect(roomWithPlaced().clear(box)).toBe(clear);
  });

  it('keep no room for a box with no area', () => {
    const room = new LabelRoom(12);
    room.add({ left: 10, top: 10, right: 10, bottom: 20 });

    expect(room.clear({ left: 0, top: 0, right: 20, bottom: 30 })).toBe(true);
  });
});
