import { Marked } from 'marked';
import { escape } from './drawing';
import { codeBlock } from './gallery';
import introduction from '../content/README.md?raw';
import gettingStarted from '../content/getting-started.md?raw';
import rendering from '../content/rendering.md?raw';
import accessibility from '../content/accessibility.md?raw';
import about from '../content/about.md?raw';
import contributing from '../../../CONTRIBUTING.md?raw';
import changelog from '../../../CHANGELOG.md?raw';
import license from '../content/license.md?raw';
import charts from '../../../packages/charts/README.md?raw';
import core from '../../../packages/core/README.md?raw';
import text from '../../../packages/text/README.md?raw';
import fills from '../../../packages/fills/README.md?raw';
import mit from '../../../LICENSE?raw';
import ofl from '../../../packages/text/OFL.txt?raw';
import coreNotices from '../../../packages/core/THIRD_PARTY_NOTICES.md?raw';
import chartNotices from '../../../packages/charts/THIRD_PARTY_NOTICES.md?raw';
import siteNotices from '../THIRD_PARTY_NOTICES.md?raw';
// Each notices file opens with its own "# Third-party notices"; the license page supplies that heading once.
const notices = [coreNotices, chartNotices, siteNotices].map((n) => n.replace(/^# .*\n/, '')).join('\n');
export const docs = [
  {
    url: '/docs/',
    title: 'Documentation',
    source: 'apps/site/content/README.md',
    body: introduction,
    group: 'Start here',
  },
  {
    url: '/docs/getting-started/',
    title: 'Getting started',
    source: 'apps/site/content/getting-started.md',
    body: gettingStarted,
    group: 'Start here',
  },
  {
    url: '/docs/rendering/',
    title: 'Rendering and fonts',
    source: 'apps/site/content/rendering.md',
    body: rendering,
    group: 'Guides',
  },
  {
    url: '/docs/accessibility/',
    title: 'Accessibility and limitations',
    source: 'apps/site/content/accessibility.md',
    body: accessibility,
    group: 'Guides',
  },
  ...[
    { name: 'charts', body: charts, title: 'Charts' },
    { name: 'core', body: core, title: 'Shapes' },
    { name: 'text', body: text, title: 'Text' },
    { name: 'fills', body: fills, title: 'Fills' },
  ].map((p) => ({
    url: `/docs/${p.name}/`,
    title: p.title,
    source: `packages/${p.name}/README.md`,
    body: p.body,
    group: 'Package reference',
  })),
  {
    url: '/about/',
    title: 'About BorrowdaleJS',
    source: 'apps/site/content/about.md',
    body: about,
    group: 'Project',
  },
  {
    url: '/contributing/',
    title: 'Contributing',
    source: 'CONTRIBUTING.md',
    body: contributing,
    group: 'Project',
  },
  { url: '/changelog/', title: 'Changelog', source: 'CHANGELOG.md', body: changelog, group: 'Project' },
  {
    url: '/license/',
    title: 'License & credits',
    source: 'apps/site/content/license.md',
    body: license,
    group: 'Project',
  },
];
export function documentPage(path: string) {
  const page = docs.find((d) => d.url === path)!;
  const headings: { id: string; text: string }[] = [];
  // The license page writes its own section headings, so their ids are taken before any Markdown heading.
  const used = new Map<string, number>(
    path === '/license/' ? ['mit-license', 'font-license', 'third-party-notices'].map((id) => [id, 1]) : [],
  );
  // Headings of the embedded notices sit one level below the page's "Third-party notices" section.
  let shift = 0;
  const markdown = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const slug = text
          .replace(/<[^>]+>/g, '')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, '-')
          .replace(/^-|-$/g, '');
        const count = used.get(slug) ?? 0;
        used.set(slug, count + 1);
        const id = slug + (count ? `-${count}` : '');
        const level = Math.min(depth + shift, 6);
        if (level === 2) headings.push({ id, text });
        return `<h${level} id="${id}">${text}</h${level}>`;
      },
      // The Markdown is trusted repository content, but raw HTML in it is shown as text, never as markup.
      html({ text }) {
        return escape(text);
      },
      code({ text }) {
        return codeBlock(text);
      },
    },
    walkTokens(token) {
      if (token.type !== 'link' && token.type !== 'image') return;
      if (/^(https?:|mailto:|#)/.test(token.href)) return;
      const url = new URL(token.href, `https://repo.invalid/${page.source}`);
      const source = url.pathname.slice(1);
      const internal = docs.find((d) => d.source === source);
      token.href = internal
        ? internal.url + url.hash
        : `https://github.com/borrowdale/borrowdale/blob/main/${source}${url.hash}`;
    },
  });
  let body = markdown.parse(page.body, { async: false });
  const related: Record<string, string> = {
    '/docs/getting-started/': '/playground/charts/bars-grouped/',
    '/docs/charts/': '/playground/?category=charts',
    '/docs/core/': '/playground/?category=shapes',
    '/docs/text/': '/playground/?category=text',
    '/docs/fills/': '/playground/?category=patterns',
  };
  if (related[path])
    body += `<p class="docs-playground"><a href="${related[path]}">Try these APIs in the playground ↗</a></p>`;
  if (path === '/license/') {
    headings.push(
      { id: 'mit-license', text: 'MIT license' },
      { id: 'font-license', text: 'Font license' },
      { id: 'third-party-notices', text: 'Third-party notices' },
    );
    shift = 1;
    body += `<h2 id="mit-license">MIT license</h2><pre class="license-text">${escape(mit)}</pre><h2 id="font-license">Font license</h2><pre class="license-text">${escape(ofl)}</pre><h2 id="third-party-notices">Third-party notices</h2>${markdown.parse(notices, { async: false })}`;
  }
  const sidebar = [...new Set(docs.map((d) => d.group))]
    .map(
      (group) =>
        `<section><p class="docs-group">${group}</p>${docs
          .filter((d) => d.group === group)
          .map(
            (d) =>
              `<a data-doc-link="${d.url}" href="${d.url}" ${d === page ? 'aria-current="page"' : ''}>${escape(d.title)}</a>`,
          )
          .join('')}</section>`,
    )
    .join('');
  return `<div class="docs-layout"><aside class="docs-sidebar" aria-label="Documentation pages"><label for="docs-search">Find a topic</label><input id="docs-search" type="search" placeholder="Search documentation…"><nav aria-label="Documentation">${sidebar}</nav><p id="docs-no-results" role="status"></p></aside><article class="docs-article"><p class="eyebrow">BORROWDALEJS / ${page.group.toUpperCase()}</p>${body}<div class="docs-source"><a href="https://github.com/borrowdale/borrowdale/blob/main/${page.source}">View Markdown on GitHub ↗</a><a href="https://github.com/borrowdale/borrowdale/edit/main/${page.source}">Edit this page ↗</a></div></article><nav class="docs-toc" aria-labelledby="docs-toc-title"><p id="docs-toc-title">ON THIS PAGE</p>${headings.map((h) => `<a href="#${h.id}">${h.text}</a>`).join('')}</nav></div>`;
}
export function bindDocuments() {
  const input = document.getElementById('docs-search') as HTMLInputElement | null;
  if (!input) return;
  input.oninput = () => {
    const term = input.value.toLowerCase().trim();
    let count = 0;
    document.querySelectorAll<HTMLAnchorElement>('[data-doc-link]').forEach((a) => {
      const doc = docs.find((d) => d.url === a.dataset.docLink)!;
      a.hidden = !`${doc.title} ${doc.body}`.toLowerCase().includes(term);
      if (!a.hidden) count++;
    });
    // A group whose pages are all filtered out loses its label too.
    document.querySelectorAll<HTMLElement>('.docs-sidebar section').forEach((section) => {
      section.hidden = !section.querySelector('[data-doc-link]:not([hidden])');
    });
    document.getElementById('docs-no-results')!.textContent = count ? '' : 'No matching pages.';
  };
}
