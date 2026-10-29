import { describe, expect, it } from 'vitest';
import { allPaths, pageHtml, pageTitle, route } from '../src/pages';
import { docs, documentPage } from '../src/documents';
import { legacyPath } from '../src/routing';

describe('static website routes and shared documentation',()=>{
 it('has distinct paths for every example and public page',()=>{
  const paths=allPaths();expect(new Set(paths).size).toBe(paths.length);
  for(const path of paths){expect(path).toMatch(/^\/.*\/$|^\/$/);expect(route(path)).not.toBe('404');}
  expect(paths).toContain('/docs/');expect(paths).toContain('/contributing/');
 });
 it.each(docs)('$title renders its shared Markdown without JavaScript',page=>{
  const html=documentPage(page.url);
  expect(html).toContain('<h1');expect(html).toContain(page.source);
  expect(html).not.toMatch(/href="\.\.?\//);
 });
 it('includes real license texts and third-party credits',()=>{
  const html=documentPage('/license/');
  expect(html).toContain('Permission is hereby granted');expect(html).toContain('SIL OPEN FONT LICENSE');expect(html).toContain('Sun Microsystems');expect(html).toContain('Mike Bostock');
 });
 it('renders whole-card links to static playground pages',()=>{
  const html=pageHtml('/playground/');
  expect(html).toContain('href="/playground/charts/bars-grouped/"');expect(html).not.toContain('href="#example');
  const example=pageHtml('/playground/charts/bars-grouped/');expect(example).toContain('Example JavaScript code');expect(example).toContain('Live preview');
 });
 it('has requested navigation and footer pages',()=>{
  const html=pageHtml('/');for(const text of ['Docs','Playground','Examples','GitHub','About','Contributing','Changelog','License &amp; credits']){
   expect(html).toContain(text==='License &amp; credits'?'License & credits':text);
  }
  expect(html).not.toContain('>Dashboards</a>');expect(html).toContain('Borrowdale<span class="brand-js">JS');
 });
 it('preserves old links and handles missing pages honestly',()=>{
  expect(legacyPath('#gallery?category=text')).toBe('/playground/?category=text');
  expect(legacyPath('#example/charts/bars-grouped')).toBe('/playground/charts/bars-grouped/');
  expect(legacyPath('#main')).toBeUndefined();expect(route('/missing/')).toBe('404');expect(pageTitle('/missing/')).toBe('Page not found');
 });
});

it('emits static-host-safe paths for every playground name',()=>{
 for(const path of allPaths()){expect(path).not.toMatch(/%|\s/);expect(pageTitle(path)).not.toBe('Page not found');}
 expect(allPaths()).toContain('/playground/components/note-disclosure/');
 expect(allPaths()).toContain('/playground/shapes/star-dots-b/');
});
