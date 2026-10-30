// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeExample } from '../src/playground-runtime';
import { pageHtml, pageTitle, route } from '../src/pages';
import { scrollToFragment } from '../src/routing';
import { bindEditor, stopEditor } from '../src/editor';

afterEach(() => {
  stopEditor();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});
describe('site review regressions', () => {
  it.each(['/playground/charts/%/', '/playground/charts/%E0%A4%A/', '/playground/nope/missing/'])(
    'handles invalid example URL %s',
    (path) => {
      expect(pageTitle(path)).toBe('Page not found');
      expect(route(path)).toBe('404');
      expect(pageHtml(path)).toContain('Page not found.');
    },
  );
  it('parses formatted named imports without altering comments or strings', () => {
    expect(
      executeExample(
        "import { sketch as draw, /* style */ toSvgPaths, } from '@borrowdale/core'; render('<svg>'+toSvgPaths(draw({kind:'line',x1:0,y1:0,x2:10,y2:10},{seed:7}))+'</svg>');",
      ),
    ).toContain('<path');
    const literal = "import { missing } from '@borrowdale/core';";
    expect(executeExample(`// ${literal}\nrender(${JSON.stringify(literal)});`)).toBe(literal);
    expect(() => executeExample("import { sketch,, } from '@borrowdale/core';")).toThrow();
  });
  it('supports import hoisting and aliases matching internal implementation names', () => {
    expect(
      executeExample("import { sketch as modules } from '@borrowdale/core'; render(typeof modules);"),
    ).toBe('function');
    expect(executeExample("render(typeof sketch); import { sketch } from '@borrowdale/core';")).toBe(
      'function',
    );
    expect(
      executeExample(
        "const __borrowdaleModules=1; import { sketch } from '@borrowdale/core'; render(typeof sketch);",
      ),
    ).toBe('function');
  });
  it('scrolls decoded heading fragments after rendering and tolerates invalid ones', () => {
    document.body.innerHTML = '<h2 id="your-first-chart">Your first chart</h2>';
    const target = document.querySelector('h2')!;
    target.scrollIntoView = vi.fn();
    expect(scrollToFragment('#your-first-chart')).toBe(true);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(scrollToFragment('#%ZZ')).toBe(false);
    expect(scrollToFragment('#absent')).toBe(false);
  });
  it('cancels scheduled execution when Auto-run is unchecked and lets Tab leave the editor', () => {
    vi.useFakeTimers();
    const runs = vi.fn();
    class WorkerStub {
      postMessage = runs;
      terminate = vi.fn();
      onmessage = null;
      onerror = null;
    }
    vi.stubGlobal('Worker', WorkerStub);
    history.replaceState(null, '', '/playground/charts/bars-grouped/');
    document.body.innerHTML = pageHtml(location.pathname).replace(
      /<iframe[^>]*><\/iframe>/,
      '<div id="editor-preview"></div>',
    );
    bindEditor();
    expect(runs).toHaveBeenCalledTimes(1);
    const input = document.getElementById('editor-source') as HTMLTextAreaElement;
    input.value = "render('<svg/>')";
    input.dispatchEvent(new Event('input'));
    const auto = document.getElementById('editor-auto') as HTMLInputElement;
    auto.checked = false;
    auto.dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(700);
    expect(runs).toHaveBeenCalledTimes(1);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    input.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    document.getElementById('editor-run')!.click();
    expect(runs).toHaveBeenCalledTimes(2);
  });
});
