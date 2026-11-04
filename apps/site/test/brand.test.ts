import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reseed } from '../src/drawing';
import { pageHtml } from '../src/pages';

const FAVICON = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
// The paths of the mark in a page's header.
const headerMark = (html: string) => html.match(/<span class="brand-symbol"><svg[^>]*>(.*?)<\/svg>/)![1]!;

describe('the header mark', () => {
  it('is drawn as the favicon draws it', () => {
    expect(FAVICON).toContain(headerMark(pageHtml('/')));
  });
  // Re-sketch redraws the page's drawings with a new seed; the mark keeps its own.
  it('keeps its drawing after a re-sketch', () => {
    reseed();
    expect(FAVICON).toContain(headerMark(pageHtml('/')));
  });
});
