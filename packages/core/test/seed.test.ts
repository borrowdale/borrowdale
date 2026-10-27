import { describe, expect, it } from 'vitest';
import { stableKey, toSeed } from '@borrowdale/core';
import { seedFromHash } from '../src/seed.js';

describe('toSeed', () => {
  it('hashes the empty string with FNV-1a (0x811c9dc5)', () => {
    expect(toSeed('')).toBe(18652615);
  });

  it('hashes "a" with FNV-1a (0xe40c292c)', () => {
    expect(toSeed('a')).toBe(1678518574);
  });

  it('treats a number like its string form', () => {
    expect(toSeed(7)).toBe(toSeed('7'));
  });
});

describe('stableKey', () => {
  it('sorts object keys at every depth and keeps array order', () => {
    expect(stableKey({ b: 1, a: [{ d: 2, c: 3 }, [2, 1]] })).toBe('{"a":[{"c":3,"d":2},[2,1]],"b":1}');
  });

  it('serialises primitives as JSON', () => {
    expect(stableKey('x')).toBe('"x"');
  });

  it('returns a string for undefined, which JSON.stringify does not', () => {
    expect(stableKey(undefined)).toBe('undefined');
  });
});

describe('seedFromHash', () => {
  it('never returns 0, which the stroke engine would treat as unseeded', () => {
    expect(seedFromHash(0)).toBe(1);
  });

  it('wraps a hash equal to the modulus to 1', () => {
    expect(seedFromHash(2147483647)).toBe(1);
  });

  it('reaches the top of the range', () => {
    expect(seedFromHash(2147483646)).toBe(2147483647);
  });

  it('keeps the largest 32-bit hash in range', () => {
    expect(seedFromHash(4294967295)).toBe(2);
  });
});
