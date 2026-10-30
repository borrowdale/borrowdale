export const exampleSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
export const examplePath = (e: { category: string; name: string }) =>
  `/playground/${e.category}/${exampleSlug(e.name)}/`;
export function localPath(path: string) {
  const base = import.meta.env.BASE_URL;
  const value = base !== '/' && path.startsWith(base) ? '/' + path.slice(base.length) : path;
  return value.endsWith('/') ? value : value + '/';
}
export function siteUrl(path: string) {
  return import.meta.env.BASE_URL + path.replace(/^\//, '');
}
export function legacyPath(hash: string): string | undefined {
  const [key = '', query] = hash.replace(/^#/, '').split('?');
  const path =
    key === 'home'
      ? '/'
      : key === 'gallery'
        ? '/playground/'
        : ['world', 'climate', 'earthquakes'].includes(key)
          ? `/examples/${key}/`
          : key.startsWith('example/')
            ? legacyExample(key.slice(8))
            : undefined;
  return path ? path + (query ? '?' + query : '') : undefined;
}
// Pages link to site paths from the root; this puts the base path in front of each. Fragments and
// external links are left alone. Old hash URLs are translated only on arrival (legacyPath).
export function rewriteLinks(html: string) {
  return html.replace(/href="(\/[^/"][^"]*|\/)"/g, (_, href: string) => `href="${siteUrl(href)}"`);
}

export function scrollToFragment(hash: string): boolean {
  if (!hash) return false;
  let id: string;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    return false;
  }
  const target = document.getElementById(id);
  if (!target) return false;
  target.scrollIntoView({ block: 'start' });
  return true;
}

function legacyExample(value: string) {
  const [category = '', ...name] = value.split('/');
  try {
    return examplePath({ category, name: decodeURIComponent(name.join('/')) });
  } catch {
    return undefined;
  }
}
