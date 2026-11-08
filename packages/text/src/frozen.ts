/**
 * Freezes `value` and every object and array inside it, so a constant the package shares with every
 * caller cannot be changed by one of them for all the others.
 */
export function frozen<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.freeze(value);
    for (const inner of Object.values(value)) {
      frozen(inner);
    }
  }
  return value;
}
