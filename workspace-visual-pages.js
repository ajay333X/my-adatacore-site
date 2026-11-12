(()=>{
'use strict';
if(window.ACProjectVisualPages)return;
const U='https://llmhyezgcnbognmmsnzq.supabase.co',K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const client=window.supabase?.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
const cache=new Map();
const policy="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'";
const sharedCss='*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;background:#f6faf9;color:#233d48}';
async function load(id,refresh=false){
 if(!client)return {};
 if(cache.has(id)&&!refresh)return cache.get(id);
 const {data,error}=await client.rpc('project_visual_published',{p_project_id:Number(id)});
 if(error)throw error;const val=data&&typeof data==='object'?data:{};
 cache.set(id,val);return val;
}
function available(data){return !!(Array.isArray(data?.pages)&&data.pages.length)}
function cleanDoc(html,css){
 const markup=String(html||'').replace(/<script\b[\s\S]*?<\/script\s*>/gi,'').replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,'');
 const styles=String(css||'').replace(/<\/style/gi,'<\\/style');
 return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+policy+'"><style>'+sharedCss+'</style><style>'+styles+'</style></head><body>'+markup+'</body></html>';
}
function initStyle(){
 if(document.getElementById('acVisualPagesStyles'))return;
 const style=document.createElement('style');style.id='acVisualPagesStyles';style.textContent=
 '.ac-visual-pages{display:grid;grid-template-columns:196px minmax(0,1fr);gap:15px;margin:18px 0 0}.ac-visual-page-list{display:grid;align-content:start;gap:7px}.ac-visual-page-list button{border:1px solid #d7e5e6;background:#fff;border-radius:10px;padding:12px 13px;color:#355866;text-align:left;font-size:12px;font-weight:750;cursor:pointer}.ac-visual-page-list button.selected{background:#dff3ec;border-color:#99d2bf;color:#125749}.ac-visual-page-frame{width:100%;height:min(75vh,720px);min-height:360px;border:1px solid #d8e7e6;border-radius:12px;background:#fff}.ac-visual-tip{font-size:11px;color:#7e929c;line-height:1.6;margin-top:9px}@media(max-width:700px){.ac-visual-pages{grid-template-columns:1fr}.ac-visual-page-list{display:flex;gap:7px;overflow:auto}.ac-visual-page-list button{white-space:nowrap}.ac-visual-page-frame{height:66vh}}';
 document.head.append(style);
}
async function render(host,id){
 if(!host)return;host.textContent='Loading published project pages…';
 let data;try{data=await load(id,true)}catch(error){host.textContent='Unable to load project pages: '+error.message;return}
 if(!host.isConnected)return;
 const pages=Array.isArray(data.pages)?data.pages:[];
 if(!pages.length){host.textContent='This project does not have published custom pages yet.';return}
 initStyle();host.replaceChildren();
 const h=document.createElement('h3');h.textContent='Project pages';
 const p=document.createElement('p');p.className='ac-panel-sub';p.textContent='Browse the published pages for this project. Custom task forms require a configured task workflow to submit real work.';
 const wrap=document.createElement('div');wrap.className='ac-visual-pages';
 const list=document.createElement('nav');list.className='ac-visual-page-list';list.setAttribute('aria-label','Project pages');
 const container=document.createElement('div');
 const frame=document.createElement('iframe');frame.className='ac-visual-page-frame';frame.setAttribute('sandbox','allow-top-navigation-by-user-activation');
 frame.setAttribute('title','Project page preview');
 const note=document.createElement('p');note.className='ac-visual-tip';note.textContent='Pages are displayed in an isolated preview. Working recording, transcription, and evaluation tasks continue to open through their dedicated project tools.';
 container.append(frame,note);wrap.append(list,container);host.append(h,p,wrap);
 const change=(page,button)=>{
  list.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===button));
  frame.title=(page.name||'Project page')+' · Project preview';
  frame.srcdoc=cleanDoc(page.html,page.css);
 };
 for(const page of pages.slice(0,40)){
  if(!page||typeof page.html!=='string')continue;
  const button=document.createElement('button');button.type='button';button.textContent=page.name||'Page';
  list.append(button);button.onclick=()=>change(page,button);
 }
 if(list.firstElementChild){
  const page=pages.find(x=>x&&typeof x.html==='string');if(page)change(page,list.firstElementChild);
 }
}
window.ACProjectVisualPages={load,available,render,refresh:id=>{cache.delete(id);return load(id,true)}};
})();