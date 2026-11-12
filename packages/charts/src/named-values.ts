// The named values a pie, a unit chart or a funnel shows: read alike, coloured alike by name, and
// written alike as labels and tooltips.
import { MAX_CATEGORIES, MAX_NAME } from './check-axis.js';
import { color, fail, fields, list, MAX_VALUE, number, show, text, unique, type Fields } from './read.js';
import { formatNumber, formatValue, PLAIN_FORMAT } from './scale.js';

export interface NamedValue {
  name: string;
  value: number;
  color: string | undefined;
}

/**
 * A series' `data`: 1 to 1,000 items, each with a unique name of at most 100 characters, a value
 * from 0 to 1e15 and an optional colour, and at least one value above 0. `more` reads the keys a type
 * adds, which `keys` lists.
 */
export function readNamedValues<X extends object>(
  r: Fields, path: string, reserve: (count: number) => void, keys: readonly string[], more: (item: Fields) => X,
): (NamedValue & X)[] {
  const data = r.required('data', list(1, MAX_CATEGORIES, (itemPath, raw) => {
    const item = fields(itemPath, raw);
    item.allow(['name', 'value', 'color', ...keys]);
    return {
      name: item.required('name', text(MAX_NAME)),
      value: item.required('value', number(0, MAX_VALUE)),
      color: item.optional('color', color),
      ...more(item),
    };
  }, reserve));
  unique(data.map((item) => item.name), (i) => `${path}.data[${i}].name`);
  if (!data.some((item) => item.value > 0)) {
    fail(`${path}.data`, 'has no value above 0, so there is nothing to draw');
  }
  return data;
}

/** A name in several series is one legend entry with one colour, so its colours must agree. */
export function checkNameColors(series: readonly { path: string; data: readonly NamedValue[] }[]): void {
  const colors = new Map<string, { color: string | undefined; path: string }>();
  for (const entry of series) {
    entry.data.forEach((item, i) => {
      const seen = colors.get(item.name);
      if (seen && item.color !== undefined && item.color !== seen.color) {
        const given = seen.color === undefined ? 'none' : show(seen.color);
        fail(`${entry.path}.data[${i}].color`, `is ${show(item.color)}, but ${seen.path}, of the same name, gives ${given}`);
      }
      if (!seen) {
        colors.set(item.name, { color: item.color, path: `${entry.path}.data[${i}].color` });
      }
    });
  }
}

/** A named value's data label: its name and value. */
export function valueLabel({ name, value }: { name: string; value: number }): string {
  return `${name}: ${formatValue(value)}`;
}

/** A named value's tooltip: its label, then its share of `total` to one decimal place, after `prefix`. */
export function shareTitle(item: { name: string; value: number }, total: number, prefix = ''): string {
  return `${prefix}${valueLabel(item)} (${formatNumber((item.value / total) * 100, 1, PLAIN_FORMAT)}%)`;
}
