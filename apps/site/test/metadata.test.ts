// @vitest-environment happy-dom
import { it, expect } from 'vitest';
import { allPaths, pageHtml } from '../src/pages';
import { metadata, metadataHtml, applyMetadata } from '../src/metadata';
it('provides specific metadata and valid structured data on every static page',()=>{
 const titles=new Set<string>();const descriptions=new Set<string>();
 for(const path of allPaths()){
  const m=metadata(path,'https://example.test','/borrowdale/');
  expect(m.description.length).toBeGreaterThan(50);expect(m.title).toContain('BorrowdaleJS');
  expect(m.canonical).toBe('https://example.test/borrowdale'+path);
  expect(m.structured?.url).toBe(m.canonical);expect(m.robots).toBeUndefined();
  expect(metadataHtml(path,'https://example.test','/borrowdale/')).toContain('application/ld+json');
  titles.add(m.title);descriptions.add(m.description);
 }
 expect(titles.size).toBe(allPaths().length);expect(descriptions.size).toBe(allPaths().length);
});
it('does not invent a deployment domain and excludes missing pages',()=>{
 expect(metadata('/docs/','').canonical).toBeUndefined();expect(metadata('/missing/','https://example.test').robots).toBe('noindex, follow');
 expect(metadata('/missing/','https://example.test').canonical).toBeUndefined();
 expect(()=>metadata('/','https://user:password@example.test')).toThrow();
});
it('keeps metadata current after client navigation',()=>{
 applyMetadata('/docs/');expect(document.title).toContain('Documentation');
 const first=document.querySelector('meta[name="description"]')!.getAttribute('content');applyMetadata('/examples/climate/');
 expect(document.title).toContain('Climate notebook');expect(document.querySelector('meta[name="description"]')!.getAttribute('content')).not.toBe(first);
 expect(document.querySelector('meta[property="og:title"]')!.getAttribute('content')).toBe(document.title);
 applyMetadata('/missing/');expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow');
 applyMetadata('/');expect(document.querySelector('meta[name="robots"]')).toBeNull();
});
it('links every playground from the HTML directory without requiring filters',()=>{
 const html=pageHtml('/playground/');for(const path of allPaths().filter(p=>p.startsWith('/playground/')&&p!=='/playground/'))expect(html).toContain(`href="${path}"`);
});
