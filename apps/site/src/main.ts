import { applyMetadata } from './metadata';
import { pageHtml, route as resolveRoute } from './pages';
import { legacyPath, siteUrl, scrollToFragment } from './routing';
import { bindDocuments } from './documents';
import { bindEditor, stopEditor } from './editor';
import './style.css';
import { fontFaceCss, loadFont } from '@borrowdale/text';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';
import { escape, hydrateDrawings, reseed, download, textSvg, seed } from './drawing';
import { galleryState, categories, codeBlock } from './gallery';
import { dashboardState } from './dashboards';
import { world, climate, quakes } from './data';
const app=document.querySelector<HTMLDivElement>('#app')!;
const fontStyle=document.createElement('style');fontStyle.textContent=fontFaceCss(excalifontFiles);document.head.append(fontStyle);
await loadFont(document.fonts,excalifontFiles);
const route=()=>resolveRoute(location.pathname);
let toastTimer:ReturnType<typeof setTimeout>;
function toast(message:string){const node=document.getElementById('toast')!;node.textContent=message;node.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('visible'),2400);}
function updateText(){const text=(document.querySelector('#live-text') as HTMLInputElement)?.value??'';const size=Number((document.querySelector('#live-size') as HTMLInputElement)?.value??36);const output=document.getElementById('live-text-output');if(!output)return;const drawn=textSvg(text,{x:0,y:0,fontSize:size});output.innerHTML=`<div style="height:${size+36}px">${drawn.svg}</div><small>${drawn.missing.length?'Fallback glyphs: '+escape(drawn.missing.join(' ')):'All characters covered by Excalifont'}</small>`;document.getElementById('live-text-code')!.innerHTML=codeBlock(`import { layoutText, toSvgText } from '@borrowdale/text';\n\nconst label = layoutText(${JSON.stringify(text)}, { x: 16, y: ${size+8}, fontSize: ${size} });\n// Load Excalifont with fontFaceCss or loadFont before displaying.\nconst fragment = toSvgText(label);\nconsole.log(label.width, label.missing);`);}
function render(){stopEditor();const r=route();applyMetadata(location.pathname);
 app.innerHTML=pageHtml(location.pathname);hydrateDrawings();bind();bindDocuments();
 if(r==='gallery')updateText();if(r==='example'){document.getElementById('resketch')!.hidden=true;bindEditor();}
}
function bind(){document.getElementById('resketch')!.onclick=()=>{reseed();render();toast(`Drawing seed ${seed}`);};
 document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(b=>b.onclick=()=>{galleryState.category=b.dataset.category as typeof galleryState.category;galleryState.tag='all';galleryState.page=0;render();});
 const search=document.getElementById('gallery-search') as HTMLInputElement|null;
 if(search)search.oninput=()=>{galleryState.search=search.value;galleryState.page=0;const position=search.selectionStart;render();const next=document.getElementById('gallery-search') as HTMLInputElement;next.focus();try{next.setSelectionRange(position,position);}catch{/* Search inputs do not support selection in some engines. */}};
 const change=(id:string,fn:(value:string)=>void)=>{const control=document.getElementById(id) as HTMLSelectElement|null;if(control)control.onchange=()=>{fn(control.value);render();};};
 change('gallery-family',v=>{galleryState.tag=v;galleryState.page=0;});change('gallery-renderer',v=>galleryState.renderer=v as 'svg'|'canvas');
 change('world-year',v=>dashboardState.year=Number(v));change('world-country',v=>dashboardState.country=v);change('climate-since',v=>dashboardState.since=Number(v));change('quake-magnitude',v=>dashboardState.magnitude=Number(v));
 document.querySelectorAll<HTMLButtonElement>('[data-page]').forEach(b=>b.onclick=()=>{galleryState.page+=Number(b.dataset.page);render();document.querySelector('.gallery-tools')?.scrollIntoView({block:'start'});});
 const reset=document.getElementById('clear-search');if(reset)reset.onclick=()=>{galleryState.search='';galleryState.tag='all';render();};
 const dataButton=document.getElementById('download-data');if(dataButton)dataButton.onclick=()=>{const r=route();download(`borrowdale-${r}-snapshot.json`,JSON.stringify(r==='world'?world:r==='climate'?climate:quakes,null,2));toast('Snapshot downloaded');};
 ['live-text','live-size'].forEach(id=>{const el=document.getElementById(id);if(el)el.oninput=updateText;});
}
document.querySelector<HTMLAnchorElement>('.skip')!.onclick=event=>{event.preventDefault();document.getElementById('main')!.focus();};
app.addEventListener('click',async event=>{const target=(event.target as Element).closest<HTMLButtonElement>('.copy-code');if(target){const code=target.closest('.code-block')!.querySelector('code')!.textContent!;try{await navigator.clipboard.writeText(code);target.textContent='Copied ✓';toast('Code copied');setTimeout(()=>target.textContent='Copy code',1800);}catch{toast('Clipboard unavailable. Select the code to copy it.');}}
 if((event.target as Element).closest('.recipe-action'))toast('Your idea is ready to sketch.');});
function navigate(resetScroll=true){const params=new URLSearchParams(location.search.slice(1));const category=params.get('category');if(category&&categories.includes(category as typeof galleryState.category)){galleryState.category=category as typeof galleryState.category;galleryState.tag='all';galleryState.page=0;}render();if(!scrollToFragment(location.hash)&&resetScroll)window.scrollTo(0,0);}
// Keep ordinary anchors usable without JavaScript; intercept local pages for draft persistence.
app.addEventListener('click',event=>{
 const a=(event.target as Element).closest<HTMLAnchorElement>('a[href]');
 if(!a||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||a.target||a.hasAttribute('download'))return;
 const url=new URL(a.href);if(url.origin!==location.origin||!url.pathname.startsWith(import.meta.env.BASE_URL))return;
 if(url.pathname===location.pathname&&url.search===location.search&&url.hash)return;
 event.preventDefault();history.pushState(null,'',url);navigate();document.getElementById('main')?.focus({preventScroll:true});
});
window.addEventListener('popstate',()=>navigate(false));
const old=legacyPath(location.hash);if(old)history.replaceState(null,'',siteUrl(old));
navigate();
