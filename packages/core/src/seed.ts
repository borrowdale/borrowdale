import type { Seed } from './types.js';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const MAX_SEED = 2 ** 31 - 1;

/**
 * Maps any seed to an integer in [1, 2^31 - 1].
 *
 * Never 0: rough.js treats a seed of 0 as "unseeded" and falls back to Math.random(),
 * which would make the output differ on every render.
 */
export function toSeed(seed: Seed): number {
  return seedFromHash(fnv1a(String(seed)));
}

/**
 * Serialises a value with object keys sorted, so objects that differ only in key order produce
 * the same key and therefore the same default seed.
 */
export function stableKey(value: unknown): string {
  // JSON.stringify returns undefined for undefined, functions and symbols.
  const key: string | undefined = JSON.stringify(value, (_key, item: unknown) =>
    isPlainObject(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  );
  return key ?? 'undefined';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function seedFromHash(hash: number): number {
  return (hash % MAX_SEED) + 1;
}

function fnv1a(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash;
}
