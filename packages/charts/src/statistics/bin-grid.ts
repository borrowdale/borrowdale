// Box and bin boundaries on an exact decimal grid: values are compared as written, so fractions
// such as 0.3 / 0.1 land in the bin they name. At most 324 decimal places occur in a finite double;
// the integer operations are bounded. The decimal text comes from `String(value)` and the edges go
// back through `Number`: every major engine converts both exactly (shortest round trip and correct
// rounding), which the language specification does not require of strings over 20 digits.
function decimal(value: number): { units: bigint; exponent: number } {
  const [mantissa, exponent] = String(value).toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa!.split('.');
  return { units: BigInt(whole! + fraction), exponent: Number(exponent ?? 0) - fraction.length };
}

export function binGrid(origin: number, width: number) {
  const base = decimal(origin), step = decimal(width);
  const exponent = Math.min(base.exponent, step.exponent);
  const power = (n: number) => 10n ** BigInt(n);
  const start = base.units * power(base.exponent - exponent);
  const size = step.units * power(step.exponent - exponent);
  return {
    edge(index: number) {
      return Number(`${start + BigInt(index) * size}e${exponent}`);
    },
    index(value: number, round: 'floor' | 'ceil') {
      const sample = decimal(value);
      const unit = Math.min(exponent, sample.exponent);
      const factor = power(exponent - unit);
      const delta = sample.units * power(sample.exponent - unit) - start * factor;
      const divisor = size * factor;
      let index = delta / divisor;
      if (delta % divisor !== 0n) {
        if (delta < 0n && round === 'floor') index--;
        if (delta > 0n && round === 'ceil') index++;
      }
      return Number(index);
    },
  };
}
