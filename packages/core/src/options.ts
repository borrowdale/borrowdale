import { show } from './show.js';

/**
 * The options a caller passed, each read once into a copy without a prototype, which is then all that
 * is used: a getter or an inherited value cannot change between the check and the drawing. Throws for
 * something that is not an object, and for an option `names` does not list, which would otherwise be
 * ignored without a word. An option set to `undefined` counts as not set and is left out.
 */
export function ownOptions<T extends object>(options: T, names: Readonly<Record<string, true>>): T {
  if (typeof options !== 'object' || options === null) {
    throw new Error(`Options must be an object, got ${show(options)}`);
  }
  const copy = Object.create(null) as Record<string, unknown>;
  for (const [name, value] of Object.entries(options)) {
    if (value === undefined) {
      continue;
    }
    if (!Object.hasOwn(names, name)) {
      throw new Error(`Unknown option: ${show(name)}`);
    }
    copy[name] = value;
  }
  return copy as T;
}
