// Trigonometry from + − × ÷, floor, abs and sqrt only. Those are exact or exactly rounded by
// IEEE 754 in every JavaScript engine, while Math.sin and friends may differ in the last bit between
// engines, which can change how many dashes or zigzags a fill draws. Polynomials and constants are
// from fdlibm (Copyright (C) 1993 by Sun Microsystems, Inc.; see THIRD_PARTY_NOTICES.md). For
// |x| < 2^20 · π/2, sin and cos are within 2 units in the last place of Math, except near their
// zeros, where the absolute error stays below 1e-26; tan, a quotient of the two, is within about 3.
// Larger arguments are NOT reduced and give wrong results; validation keeps every angle the engine
// computes within ±MAX_ANGLE. The inverse functions are in inverse-trig.ts.

/**
 * The largest |x|, in radians, that `sin` and `cos` accept. Their argument reduction is exact to
 * about 2^20 · π/2, so every angle core draws with stays within this bound.
 */
export const MAX_ANGLE = 1e6;

const INV_PIO2 = 6.36619772367581382433e-1;
// π/2 split into three parts of 33 bits each, so n · part is exact for n < 2^20 (Cody–Waite).
const PIO2_1 = 1.57079632673412561417;
const PIO2_2 = 6.07710050630396597660e-11;
const PIO2_3 = 2.02226624871116645580e-21;

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

// sin and cos on [-π/4, π/4].
function kernelSin(x: number): number {
  const z = x * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x + z * x * (S1 + z * r);
}

function kernelCos(x: number): number {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  return 1 - (0.5 * z - z * r);
}

// x = n · π/2 + r with |r| ≤ π/4; returns the quadrant n mod 4 and r.
function reduce(x: number): [number, number] {
  const n = Math.floor(x * INV_PIO2 + 0.5);
  const r = x - n * PIO2_1 - n * PIO2_2 - n * PIO2_3;
  return [((n % 4) + 4) % 4, r];
}

/** sin(n · π/2 + r) for the quadrant n mod 4. */
function sinInQuadrant(quadrant: number, r: number): number {
  switch (quadrant) {
    case 0:
      return kernelSin(r);
    case 1:
      return kernelCos(r);
    case 2:
      return -kernelSin(r);
    default:
      return -kernelCos(r);
  }
}

export function sin(x: number): number {
  // Returned as is, which also keeps the sign of −0.
  if (Math.abs(x) < 2 ** -27) {
    return x;
  }
  const [quadrant, r] = reduce(x);
  return sinInQuadrant(quadrant, r);
}

/** cos(x) = sin(x + π/2): one quadrant further on. */
export function cos(x: number): number {
  const [quadrant, r] = reduce(x);
  return sinInQuadrant((quadrant + 1) % 4, r);
}

export function tan(x: number): number {
  return sin(x) / cos(x);
}

// Not Math.pow(x, 2) or x ** 2: both are implementation-approximated and may differ between engines,
// and ** would also slip past the golden test, which makes Math.pow throw.
export function square(x: number): number {
  return x * x;
}
