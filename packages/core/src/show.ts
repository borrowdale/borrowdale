/**
 * A rejected value, for an error message. Strings are quoted so `"10"` is visibly not the number 10;
 * a value that cannot become a string, like an object parsed from JSON with a `toString` key, is
 * named by its kind.
 */
export function show(value: unknown): string {
  try {
    return typeof value === 'string' ? JSON.stringify(value) : String(value);
  } catch {
    return typeof value;
  }
}
