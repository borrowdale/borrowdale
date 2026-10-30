import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root = resolve(import.meta.dirname, '../dist');
const base = process.env.SITE_BASE || '/';
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(path)));
    else if (entry.name.endsWith('.html')) result.push(path);
  }
  return result;
}
const files = await walk(root);
const contents = new Map(await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')])));
const errors = [];
let checked = 0;
const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
for (const [file, html] of contents) {
  const pathname = base + file.slice(root.length + 1).replace(/index\.html$/, '');
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const href = decode(match[1]);
    if (/^(?:[a-z]+:|\/\/)/i.test(href)) continue;
    const url = new URL(href, 'https://local.invalid' + pathname);
    if (!url.pathname.startsWith(base)) {
      errors.push(`${file}: outside site base: ${href}`);
      continue;
    }
    let target;
    try {
      target = resolve(
        root,
        decodeURIComponent(url.pathname.slice(base.length)) +
          (url.pathname.endsWith('/') ? 'index.html' : ''),
      );
    } catch {
      errors.push(`${file}: invalid URL: ${href}`);
      continue;
    }
    if (target !== root && !target.startsWith(root + '/')) {
      errors.push(`${file}: outside output: ${href}`);
      continue;
    }
    try {
      if (!(await stat(target)).isFile()) throw new Error('not a file');
    } catch {
      errors.push(`${file}: missing target: ${href}`);
      continue;
    }
    if (url.hash && contents.has(target)) {
      let fragment;
      try {
        fragment = decodeURIComponent(url.hash.slice(1));
      } catch {
        errors.push(`${file}: invalid fragment: ${href}`);
        continue;
      }
      const ids = [...contents.get(target).matchAll(/\bid="([^"]+)"/g)].map((m) => decode(m[1]));
      if (!ids.includes(fragment)) errors.push(`${file}: missing fragment: ${href}`);
    }
    checked++;
  }
}
if (errors.length) throw new Error(errors.join('\n'));
console.log(
  `Checked ${checked} local links/assets across ${files.length} static pages, including fragments.`,
);
