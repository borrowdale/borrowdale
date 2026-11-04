/** How many decimals `value` has when written out in full: 3 for 0.125, 7 for 1.5e-6. */
export function decimalsOf(value: number): number {
  const [mantissa = '', exponent] = String(Math.abs(value)).split('e');
  return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent ?? 0));
}
