import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reseed } from '../src/drawing';
import { pageHtml } from '../src/pages';

const asset = (name: string) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
// The mark's paths: in a page's header, after the favicon's paper square, and in the logo's group.
const headerMark = (html: string) => html.match(/<span class="brand-symbol"><svg[^>]*>(.*?)<\/svg>/)![1]!;
const faviconMark = (svg: string) => svg.match(/<rect[^>]*\/>(.*)<\/svg>/)![1]!;
const logoMark = (svg: string) => svg.match(/<g transform="[^"]*">(.*?)<\/g>/)![1]!;
// The dark logo outlines the mark in the paper colour instead of the ink.
const onDark = (paths: string) => paths.replaceAll('stroke="#263b33"', 'stroke="#f7f5ef"');

describe('the header mark', () => {
  it('is drawn', () => {
    expect(headerMark(pageHtml('/'))).toContain('<path d="M');
  });
  it('is drawn as the favicon draws it', () => {
    expect(headerMark(pageHtml('/'))).toBe(faviconMark(asset('favicon.svg')));
  });
  it('is drawn as the logo draws it', () => {
    expect(headerMark(pageHtml('/'))).toBe(logoMark(asset('borrowdale-logo.svg')));
  });
  it('is drawn as the dark logo draws it, outlined in the paper colour', () => {
    expect(onDark(headerMark(pageHtml('/')))).toBe(logoMark(asset('borrowdale-logo-dark.svg')));
  });
  // Re-sketch redraws the page's drawings with a new seed; the mark keeps its own.
  it('keeps its drawing after a re-sketch', () => {
    reseed();
    expect(headerMark(pageHtml('/'))).toBe(faviconMark(asset('favicon.svg')));
  });
});
