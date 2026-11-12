/** Whether `value` written with `decimals` decimals reads back as itself: 0.5 to 1 decimal does, to 0 does not. */
export function writesExactly(value: number, decimals: number): boolean {
  return Number(value.toFixed(decimals)) === value;
}

/** How many decimals `value` has when written out in full: 3 for 0.125, 7 for 1.5e-6. */
export function decimalsOf(value: number): number {
  const [mantissa = '', exponent] = String(Math.abs(value)).split('e');
  return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent ?? 0));
}
