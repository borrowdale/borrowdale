// The 32-bit words of a double, as fdlibm reads them, through one big-endian view, since a typed
// array's byte order is the platform's. Every operation here is exact.

const view = new DataView(new ArrayBuffer(8));

/** The high word of `x`: its sign, exponent and top 20 bits of mantissa, as a signed integer. */
export function highWord(x: number): number {
  view.setFloat64(0, x);
  return view.getInt32(0);
}

/** The low word of `x`: the bottom 32 bits of its mantissa, as an unsigned integer. */
export function lowWord(x: number): number {
  view.setFloat64(0, x);
  return view.getUint32(4);
}

/** `x` with its high word replaced by `high`. */
export function withHighWord(x: number, high: number): number {
  view.setFloat64(0, x);
  view.setInt32(0, high);
  return view.getFloat64(0);
}

/** `x` with its low word cleared. */
export function withoutLowWord(x: number): number {
  view.setFloat64(0, x);
  view.setUint32(4, 0);
  return view.getFloat64(0);
}
