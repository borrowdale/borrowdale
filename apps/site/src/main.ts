import { applyMetadata } from './metadata';
import { pageHtml, route as resolveRoute, loadDashboards, loadedDashboards, isDashboard } from './pages';
import { legacyPath, siteUrl, scrollToFragment } from './routing';
import { bindDocuments } from './documents';
import { bindEditor, stopEditor } from './editor';
import './style.css';
import { fontFaceCss, loadFont } from '@borrowdale/text';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';
import { escape, hydrateDrawings, reseed, download, textSvg, seed } from './drawing';
import { galleryState, categories, codeBlock } from './gallery';
const app = document.querySelector<HTMLDivElement>('#app')!;
// Prerendered pages link the font stylesheet; only the development server needs it added here.
if (!document.querySelector('link[data-font-css]')) {
  const fontStyle = document.createElement('style');
  fontStyle.textContent = fontFaceCss(excalifontFiles);
  document.head.append(fontStyle);
}
await loadFont(document.fonts, excalifontFiles);
const route = () => resolveRoute(location.pathname);
// The toast and the announcer live outside #app, so a re-render never replaces a live region mid-message.
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string) {
  const node = document.getElementById('toast')!;
  node.textContent = message;
  node.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove('visible');
    node.textContent = '';
  }, 2400);
}
function announce(message: string) {
  document.getElementById('announcer')!.textContent = message;
}
// The control that had focus, as a selector that finds its replacement after a re-render.
function focusedControl() {
  const active = document.activeElement as HTMLElement | null;
  if (!active || !app.contains(active)) return undefined;
  if (active.id) return `#${CSS.escape(active.id)}`;
  if (active.dataset.category) return `[data-category="${CSS.escape(active.dataset.category)}"]`;
  if (active.dataset.page) return `[data-page="${CSS.escape(active.dataset.page)}"]`;
  return undefined;
}
// Re-renders after a control changed state, and puts focus back on that control (or on the page when
// it is now disabled, like Next on the last page), so keyboard users keep their place.
function refresh() {
  const selector = focusedControl();
  render();
  if (route() === 'gallery') announce(document.querySelector('.pagination > span')?.textContent ?? '');
  if (!selector) return;
  const next = document.querySelector<HTMLElement>(selector);
  if (next && !(next as HTMLButtonElement).disabled) next.focus({ preventScroll: true });
  else document.getElementById('main')?.focus({ preventScroll: true });
}
// After moving to another page, focus its heading so screen readers announce where the reader is.
function focusPage() {
  const heading = app.querySelector<HTMLElement>('main h1');
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}
function updateText() {
  const text = (document.querySelector('#live-text') as HTMLInputElement)?.value ?? '';
  const size = Number((document.querySelector('#live-size') as HTMLInputElement)?.value ?? 36);
  const output = document.getElementById('live-text-output');
  if (!output) return;
  const drawn = textSvg(text, { x: 0, y: 0, fontSize: size });
  output.innerHTML = `<div style="height:${size + 36}px">${drawn.svg}</div><small>${drawn.missing.length ? 'Fallback glyphs: ' + escape(drawn.missing.join(' ')) : 'All characters covered by Excalifont'}</small>`;
  document.getElementById('live-text-code')!.innerHTML = codeBlock(
    `import { layoutText, toSvgText } from '@borrowdale/text';\n\nconst label = layoutText(${JSON.stringify(text)}, { x: 16, y: ${size + 8}, fontSize: ${size} });\n// Load Excalifont with fontFaceCss or loadFont before displaying.\nconst fragment = toSvgText(label);\nconsole.log(label.width, label.missing);`,
  );
}
function render() {
  stopEditor();
  const r = route();
  applyMetadata(location.pathname);
  app.innerHTML = pageHtml(location.pathname);
  hydrateDrawings();
  bind();
  bindDocuments();
  if (r === 'gallery') updateText();
  if (r === 'example') {
    document.getElementById('resketch')!.hidden = true;
    bindEditor();
  }
}
function bind() {
  document.getElementById('resketch')!.onclick = () => {
    reseed();
    refresh();
    toast(`Drawing seed ${seed}`);
  };
  document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(
    (b) =>
      (b.onclick = () => {
        galleryState.category = b.dataset.category as typeof galleryState.category;
        galleryState.tag = 'all';
        galleryState.page = 0;
        refresh();
      }),
  );
  const search = document.getElementById('gallery-search') as HTMLInputElement | null;
  if (search) {
    const update = () => {
      galleryState.search = search.value;
      galleryState.page = 0;
      const position = search.selectionStart;
      refresh();
      const next = document.getElementById('gallery-search') as HTMLInputElement;
      try {
        next.setSelectionRange(position, position);
      } catch {
        /* Search inputs do not support selection in some engines. */
      }
    };
    // Re-rendering replaces the input, which would end an IME composition after its first keystroke.
    search.oninput = (event) => {
      if (!(event as InputEvent).isComposing) update();
    };
    search.addEventListener('compositionend', update);
  }
  const change = (id: string, fn: (value: string) => void) => {
    const control = document.getElementById(id) as HTMLSelectElement | null;
    if (control)
      control.onchange = () => {
        fn(control.value);
        refresh();
      };
  };
  change('gallery-family', (v) => {
    galleryState.tag = v;
    galleryState.page = 0;
  });
  change('gallery-renderer', (v) => (galleryState.renderer = v as 'svg' | 'canvas'));
  const dashboards = loadedDashboards();
  if (dashboards) {
    const state = dashboards.dashboardState;
    change('world-year', (v) => (state.year = Number(v)));
    change('world-country', (v) => (state.country = v));
    change('climate-since', (v) => (state.since = Number(v)));
    change('quake-magnitude', (v) => (state.magnitude = Number(v)));
  }
  document.querySelectorAll<HTMLButtonElement>('[data-page]').forEach(
    (b) =>
      (b.onclick = () => {
        galleryState.page += Number(b.dataset.page);
        refresh();
        document.querySelector('.gallery-tools')?.scrollIntoView({ block: 'start' });
      }),
  );
  const reset = document.getElementById('clear-search');
  if (reset)
    reset.onclick = () => {
      galleryState.search = '';
      galleryState.tag = 'all';
      refresh();
      document.getElementById('gallery-search')?.focus();
    };
  const dataButton = document.getElementById('download-data');
  if (dataButton && dashboards)
    dataButton.onclick = () => {
      const { world, climate, quakes } = dashboards;
      const r = route();
      download(
        `borrowdale-${r}-snapshot.json`,
        JSON.stringify(r === 'world' ? world : r === 'climate' ? climate : quakes, null, 2),
      );
      toast('Snapshot downloaded');
    };
  ['live-text', 'live-size'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.oninput = updateText;
  });
}
document.querySelector<HTMLAnchorElement>('.skip')!.onclick = (event) => {
  event.preventDefault();
  document.getElementById('main')!.focus();
};
app.addEventListener('click', async (event) => {
  const target = (event.target as Element).closest<HTMLButtonElement>('.copy-code');
  if (target) {
    const code = target.closest('.code-block')!.querySelector('code')!.textContent!;
    try {
      await navigator.clipboard.writeText(code);
      target.textContent = 'Copied ✓';
      toast('Code copied');
      setTimeout(() => (target.textContent = 'Copy code'), 1800);
    } catch {
      toast('Clipboard unavailable. Select the code to copy it.');
    }
  }
});
// The page currently rendered, so a Back or Forward that only changes the fragment just scrolls.
let shown = '';
async function navigate(fromHistory = false) {
  if (isDashboard(route())) await loadDashboards();
  const params = new URLSearchParams(location.search.slice(1));
  const category = params.get('category');
  // Back and Forward keep the gallery as the reader left it; only a followed link or a fresh load picks
  // the category from the URL.
  if (!fromHistory && category && categories.includes(category as typeof galleryState.category)) {
    galleryState.category = category as typeof galleryState.category;
    galleryState.tag = 'all';
    galleryState.page = 0;
  }
  shown = location.pathname + location.search;
  render();
  if (!scrollToFragment(location.hash) && !fromHistory) window.scrollTo(0, 0);
}
// Keep ordinary anchors usable without JavaScript; intercept local pages for draft persistence.
app.addEventListener('click', (event) => {
  const a = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
  if (
    !a ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    a.target ||
    a.hasAttribute('download')
  )
    return;
  const url = new URL(a.href);
  if (url.origin !== location.origin || !url.pathname.startsWith(import.meta.env.BASE_URL)) return;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
  event.preventDefault();
  if (url.href === location.href) {
    window.scrollTo(0, 0);
    return;
  }
  history.pushState(null, '', url);
  void navigate().then(() => {
    if (!url.hash) focusPage();
  });
});
window.addEventListener('popstate', () => {
  if (location.pathname + location.search === shown) {
    scrollToFragment(location.hash);
    return;
  }
  void navigate(true).then(focusPage);
});
const old = legacyPath(location.hash);
if (old) history.replaceState(null, '', siteUrl(old));
await navigate();
