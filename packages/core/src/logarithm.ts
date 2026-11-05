// The natural logarithm and exponential from + − × ÷, exact integer operations on the bits of a
// double and exact conversions only, so every JavaScript engine computes the same result, while
// Math.log and Math.exp may differ in the last bit between engines. Ported from fdlibm's e_log.c and
// e_exp.c (Copyright (C) 1993 by Sun Microsystems, Inc.; see THIRD_PARTY_NOTICES.md): both are within
// 1 unit in the last place of the true value. Arguments are checked by math.ts.

const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const TWO54 = 1.80143985094819840000e16;

const TWOM1000 = 9.33263618503218878990e-302;
const INV_LN2 = 1.44269504088896338700;

const LG1 = 6.666666666666735130e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;

const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.65339022054652515390e-6;
const P5 = 4.13813679705723846039e-8;

// The words of a double, through one big-endian view, since a typed array's byte order is the
// platform's.
const view = new DataView(new ArrayBuffer(8));

function highWord(x: number): number {
  view.setFloat64(0, x);
  return view.getInt32(0);
}

function withHighWord(x: number, high: number): number {
  view.setFloat64(0, x);
  view.setInt32(0, high);
  return view.getFloat64(0);
}

/** The natural logarithm of `input`, a finite number above 0. */
export function log(input: number): number {
  let x = input;
  let hx = highWord(x);
  let k = 0;
  if (hx < 0x00100000) {
    // Subnormal: scaled up into the normal range.
    k -= 54;
    x *= TWO54;
    hx = highWord(x);
  }
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  // x is normalised to [sqrt(2)/2, sqrt(2)): x or x/2.
  const i = (hx + 0x95f64) & 0x100000;
  x = withHighWord(x, hx | (i ^ 0x3ff00000));
  k += i >> 20;
  const f = x - 1;
  if ((0x000fffff & (2 + hx)) < 3) {
    // |f| < 2^-20.
    if (f === 0) {
      return k === 0 ? 0 : k * LN2_HI + k * LN2_LO;
    }
    const r = f * f * (0.5 - 0.33333333333333333 * f);
    return k === 0 ? f - r : k * LN2_HI - (r - k * LN2_LO - f);
  }
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const r = t2 + t1;
  if (((hx - 0x6147a) | (0x6b851 - hx)) > 0) {
    const hfsq = 0.5 * f * f;
    return k === 0 ? f - (hfsq - s * (hfsq + r)) : k * LN2_HI - (hfsq - (s * (hfsq + r) + k * LN2_LO) - f);
  }
  return k === 0 ? f - s * (f - r) : k * LN2_HI - (s * (f - r) - k * LN2_LO - f);
}

/** e^x for a finite x within ±709, where the result is finite and above 0. */
export function exp(input: number): number {
  let x = input;
  const hx = highWord(x) & 0x7fffffff;
  const negative = x < 0;
  let k = 0;
  let hi = 0;
  let lo = 0;
  if (hx > 0x3fd62e42) {
    // |x| > ln(2)/2: x = k·ln(2) + r with |r| ≤ ln(2)/2.
    if (hx < 0x3ff0a2b2) {
      hi = negative ? x + LN2_HI : x - LN2_HI;
      lo = negative ? -LN2_LO : LN2_LO;
      k = negative ? -1 : 1;
    } else {
      k = Math.trunc(INV_LN2 * x + (negative ? -0.5 : 0.5));
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    // |x| < 2^-28.
    return 1 + x;
  }
  const t = x * x;
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) {
    return 1 - ((x * c) / (c - 2) - x);
  }
  const y = 1 - (lo - (x * c) / (2 - c) - hi);
  // k is added to y's exponent; below 2^-1021 in two steps, so no step leaves the normal range.
  return k >= -1021 ? withHighWord(y, highWord(y) + (k << 20)) : withHighWord(y, highWord(y) + ((k + 1000) << 20)) * TWOM1000;
}
