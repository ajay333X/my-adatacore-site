(()=>{
'use strict';
if(window.__adatacoreWorkspaceCleanNavigation)return;window.__adatacoreWorkspaceCleanNavigation=true;
const CORE=new Set(['overview','assignments','activity','earnings','profile']);
const CUSTOM=new Set(['today','notifications','support']);
const ALL=new Set([...CORE,...CUSTOM]);
const BASE='/workspace';
const routeFor=key=>key==='overview'?BASE:`${BASE}/${key}`;
const keyFromLocation=()=>{
  const p=location.pathname.replace(/\/+$/,'');
  if(p===BASE||p==='/dashboard')return 'overview';
  if(p.startsWith(BASE+'/')){const k=decodeURIComponent(p.slice(BASE.length+1).split('/')[0]||'');if(ALL.has(k))return k}
  const h=(location.hash||'').slice(1);return ALL.has(h)?h:'';
};
function remember(key,mode='replace'){
  const state={...(history.state||{}),workspaceView:key};
  try{history[mode+'State'](state,'',routeFor(key)+location.search)}catch(_){ }
}
function openView(key,historyMode='replace'){
  if(!ALL.has(key))key='overview';
  if(CORE.has(key)&&typeof window.setView==='function')window.setView(key);
  else if(CUSTOM.has(key)){
    const link=document.querySelector(`[data-view-link="${CSS.escape(key)}"]`);
    if(link){
      // The add-on owns rendering for these views. Give it the legacy fragment only during the click.
      try{history.replaceState(history.state||{},'',location.pathname+location.search+'#'+key)}catch(_){ }
      link.click();
    }
  }
  setTimeout(()=>remember(key,historyMode),0);
}
function initialise(){
  const key=keyFromLocation()||'overview';
  // Wait for contributor add-ons to mount before selecting their route.
  let tries=0;const run=()=>{tries++;if(CORE.has(key)&&typeof window.setView==='function'){openView(key,'replace');return}if(CUSTOM.has(key)&&document.querySelector(`[data-view-link="${CSS.escape(key)}"]`)){openView(key,'replace');return}if(tries<40)setTimeout(run,75);else remember(key,'replace')};run();
}
document.addEventListener('click',e=>{
  const el=e.target instanceof Element?e.target:null;
  const direct=el?.closest('[data-view-link]');
  let key=direct?.dataset.viewLink||'';
  if(!key){const a=el?.closest('a[href^="#"]');if(a)key=(a.getAttribute('href')||'').slice(1)}
  if(!ALL.has(key))return;
  e.preventDefault();e.stopImmediatePropagation();
  openView(key,'push');
},true);
window.addEventListener('popstate',()=>openView(keyFromLocation()||history.state?.workspaceView||'overview','replace'));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});else initialise();
})();
