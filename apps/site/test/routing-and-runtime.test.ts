// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeExample } from '../src/playground-runtime';
import { pageHtml, pageTitle, route } from '../src/pages';
import { scrollToFragment } from '../src/routing';
import { bindEditor, stopEditor } from '../src/editor';

// A worker the tests drive by hand: the latest one is kept so a test can send it messages.
class StubWorker {
  static latest: StubWorker;
  static runs = vi.fn();
  postMessage = StubWorker.runs;
  terminate = vi.fn();
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror = null;
  constructor() {
    StubWorker.latest = this;
  }
}
// Renders an example page with the stub worker and binds its editor, as the site does on navigation.
function openEditor() {
  vi.useFakeTimers();
  StubWorker.runs.mockClear();
  vi.stubGlobal('Worker', StubWorker);
  history.replaceState(null, '', '/playground/charts/bars-grouped/');
  document.body.innerHTML = pageHtml(location.pathname).replace(/<iframe[^>]*><\/iframe>/, '<div id="editor-preview"></div>');
  bindEditor();
  return document.getElementById('editor-source') as HTMLTextAreaElement;
}
const auto = () => document.getElementById('editor-auto') as HTMLInputElement;
afterEach(() => {
  stopEditor();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});
describe('playground and routing edge cases', () => {
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
    document.body.innerHTML = '<h2 id="café">Café</h2>';
    const target = document.querySelector('h2')!;
    target.scrollIntoView = vi.fn();
    expect(scrollToFragment('#caf%C3%A9')).toBe(true);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(scrollToFragment('#%ZZ')).toBe(false);
    expect(scrollToFragment('#absent')).toBe(false);
  });
  it('cancels scheduled execution when Auto-run is unchecked and lets Tab leave the editor', () => {
    const input = openEditor();
    expect(StubWorker.runs).toHaveBeenCalledTimes(1);
    input.value = "render('<svg/>')";
    input.dispatchEvent(new Event('input'));
    auto().checked = false;
    auto().dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(700);
    expect(StubWorker.runs).toHaveBeenCalledTimes(1);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    input.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    document.getElementById('editor-run')!.click();
    expect(StubWorker.runs).toHaveBeenCalledTimes(2);
  });
  it('runs the edited code once typing pauses, and again when Auto-run is switched back on', () => {
    const input = openEditor();
    input.value = "render('<svg/>')";
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(649);
    expect(StubWorker.runs).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(StubWorker.runs).toHaveBeenLastCalledWith({ code: "render('<svg/>')" });
    auto().checked = false;
    auto().dispatchEvent(new Event('change'));
    auto().checked = true;
    auto().dispatchEvent(new Event('change'));
    expect(StubWorker.runs).toHaveBeenCalledTimes(3);
  });
  it('stops a run three seconds after the worker has loaded, not before', () => {
    openEditor();
    vi.advanceTimersByTime(5000);
    expect(document.getElementById('editor-error')!.hidden).toBe(true);
    StubWorker.latest.onmessage!({ data: { ready: true } });
    vi.advanceTimersByTime(2999);
    expect(document.getElementById('editor-error')!.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(document.getElementById('editor-error')!.hidden).toBe(false);
    expect(document.getElementById('editor-error')!.textContent).toContain('3 seconds');
    expect(StubWorker.latest.terminate).toHaveBeenCalled();
  });
  it('fits a data-fit drawing to its paths with an 8-unit margin', () => {
    openEditor();
    StubWorker.latest.onmessage!({ data: { ok: true, output: '<svg data-fit viewBox="0 0 300 240"><path d="M10 20 L30 40"/></svg>' } });
    expect((document.getElementById('editor-preview') as HTMLIFrameElement).srcdoc).toContain('viewBox="2 12 36 36"');
    expect(document.getElementById('editor-status')!.textContent).toBe('Up to date');
  });
  it('ignores a message from a worker that a newer run replaced', () => {
    openEditor();
    const stale = StubWorker.latest;
    document.getElementById('editor-run')!.click();
    stale.onmessage!({ data: { ok: false, error: 'stale failure' } });
    expect(document.getElementById('editor-error')!.hidden).toBe(true);
  });
});
