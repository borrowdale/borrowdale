// The inverse trigonometric functions from + − × ÷, sqrt and exact operations on the words of a
// double only, so every JavaScript engine computes the same result, while Math.atan, Math.acos and
// friends may differ in the last bit between engines. From fdlibm (Copyright (C) 1993 by Sun
// Microsystems, Inc.; see THIRD_PARTY_NOTICES.md): atan uses the polynomial and constants of
// s_atan.c, acos is a port of e_acos.c, and atan2 of e_atan2.c with FreeBSD's correction below. asin
// is atan of x / √(1 − x²), not fdlibm's e_asin.c. acos and atan2 arguments are checked by math.ts,
// so neither handles NaN or an infinity.
import { highWord, lowWord, withoutLowWord } from './words.js';

const ATAN_HI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800] as const;
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17] as const;
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.11111104054623557880e-1,
  9.09088713343650656196e-2, -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2,
  4.97687799461593236017e-2, -3.65315727442169155270e-2, 1.62858201153657823623e-2,
] as const;

const PI = 3.14159265358979311600;
const PIO2_HI = 1.57079632679489655800;
const PIO2_LO = 6.12323399573676603587e-17;
const PI_LO = 1.2246467991473531772e-16;

const PS0 = 1.66666666666666657415e-1;
const PS1 = -3.25565818622400915405e-1;
const PS2 = 2.01212532134862925881e-1;
const PS3 = -4.00555345006794114027e-2;
const PS4 = 7.91534994289814532176e-4;
const PS5 = 3.47933107596021167570e-5;
const QS1 = -2.40339491173441421878;
const QS2 = 2.02094576023350569471;
const QS3 = -6.88283971605453293030e-1;
const QS4 = 7.70381505559019352791e-2;

// The rational approximation of (asin(√z) − √z) / √z that e_acos.c shares with e_asin.c.
function ratio(z: number): number {
  const p = z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))));
  const q = 1 + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)));
  return p / q;
}

/** The arc cosine of `x`, a number from -1 to 1, in radians from 0 to π. */
export function acos(x: number): number {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {
    // |x| = 1.
    return hx > 0 ? 0 : PI + 2 * PIO2_LO;
  }
  if (ix < 0x3fe00000) {
    // |x| < 0.5.
    if (ix <= 0x3c600000) {
      // |x| < 2^-57.
      return PIO2_HI + PIO2_LO;
    }
    return PIO2_HI - (x - (PIO2_LO - x * ratio(x * x)));
  }
  if (hx < 0) {
    // x < -0.5.
    const z = (1 + x) * 0.5;
    const s = Math.sqrt(z);
    const w = ratio(z) * s - PIO2_LO;
    return PI - 2 * (s + w);
  }
  // x > 0.5.
  const z = (1 - x) * 0.5;
  const s = Math.sqrt(z);
  const df = withoutLowWord(s);
  const c = (z - df * df) / (s + df);
  const w = ratio(z) * s + c;
  return 2 * (df + w);
}

/** The angle of the point (`x`, `y`) from the positive x-axis, finite numbers, in radians from -π to π. */
export function atan2(y: number, x: number): number {
  if (x === 1) {
    return atan(y);
  }
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  const hy = highWord(y);
  const iy = hy & 0x7fffffff;
  // 2 · sign of x + sign of y, from their sign bits, so -0 counts as negative.
  let m = (hy < 0 ? 1 : 0) | (hx < 0 ? 2 : 0);
  if ((iy | lowWord(y)) === 0) {
    // y = ±0.
    return m === 0 || m === 1 ? y : m === 2 ? PI : -PI;
  }
  if ((ix | lowWord(x)) === 0) {
    // x = ±0.
    return hy < 0 ? -PIO2_HI : PIO2_HI;
  }
  const k = (iy - ix) >> 20;
  let z: number;
  if (k > 60) {
    // |y / x| > 2^60: ±π/2 whatever the sign of x. fdlibm 5.3 corrects the quadrant here too and is
    // then 1 unit in the last place out when x < 0; this is FreeBSD's fix to e_atan2.c, which V8 uses.
    z = PIO2_HI + 0.5 * PI_LO;
    m &= 1;
  } else if (hx < 0 && k < -60) {
    // 0 > |y| / x > −2^-60: x is negative and far larger than y.
    z = 0;
  } else {
    z = atan(Math.abs(y / x));
  }
  switch (m) {
    case 0:
      return z;
    case 1:
      return -z;
    case 2:
      return PI - (z - PI_LO);
    default:
      return z - PI_LO - PI;
  }
}

/** The arc tangent of `x`, in radians from -π/2 to π/2; NaN for NaN. */
export function atan(x: number): number {
  if (Number.isNaN(x)) {
    return x;
  }
  const negative = x < 0;
  let t = Math.abs(x);
  if (t >= 2 ** 66) {
    const z = ATAN_HI[3] + ATAN_LO[3];
    return negative ? -z : z;
  }
  if (t < 2 ** -27) {
    return x;
  }
  let id: number;
  if (t < 0.4375) {
    id = -1;
  } else if (t < 0.6875) {
    id = 0;
    t = (2 * t - 1) / (2 + t);
  } else if (t < 1.1875) {
    id = 1;
    t = (t - 1) / (t + 1);
  } else if (t < 2.4375) {
    id = 2;
    t = (t - 1.5) / (1 + 1.5 * t);
  } else {
    id = 3;
    t = -1 / t;
  }
  const z = t * t;
  const w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) {
    const result = t - t * (s1 + s2);
    return negative ? -result : result;
  }
  const result = ATAN_HI[id]! - (t * (s1 + s2) - ATAN_LO[id]! - t);
  return negative ? -result : result;
}

/**
 * The arc sine of `x`, from -1 to 1, in radians from -π/2 to π/2. (1 − x)(1 + x) rather than 1 − x²,
 * which loses precision as |x| approaches 1.
 */
export function asin(x: number): number {
  return atan(x / Math.sqrt((1 - x) * (1 + x)));
}
