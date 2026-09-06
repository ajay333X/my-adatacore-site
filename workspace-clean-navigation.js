(()=>{
'use strict';
if(window.__adatacoreWorkspaceCleanNavigation)return;window.__adatacoreWorkspaceCleanNavigation=true;
const CORE=new Set(['overview','assignments','activity','earnings','profile']);
const CUSTOM=new Set(['today','notifications','support']);
const cleanUrl=()=>location.pathname+location.search;
function remember(key,mode='replace'){
  const state={...(history.state||{}),workspaceView:key};
  try{history[mode+'State'](state,'',cleanUrl())}catch(_){ }
}
function normalizeLegacyHash(){
  const key=(location.hash||'').slice(1);
  if(!CORE.has(key)&&!CUSTOM.has(key))return;
  // Let the existing workspace modules consume old bookmarked hashes once, then hide the fragment.
  setTimeout(()=>remember(key,'replace'),0);
}
document.addEventListener('click',e=>{
  const el=e.target instanceof Element?e.target:null;
  const direct=el?.closest('[data-view-link]');
  let key=direct?.dataset.viewLink||'';
  if(!key){
    const a=el?.closest('a[href^="#"]');
    if(a)key=(a.getAttribute('href')||'').slice(1);
  }
  if(!CORE.has(key)&&!CUSTOM.has(key))return;
  if(CUSTOM.has(key)){
    // The Today module owns these views. Allow it to switch the panel, then remove its temporary hash.
    setTimeout(()=>remember(key,'replace'),0);
    return;
  }
  e.preventDefault();
  e.stopImmediatePropagation();
  if(typeof window.setView==='function')window.setView(key);
  remember(key,'push');
},true);
window.addEventListener('popstate',e=>{
  const key=e.state?.workspaceView;
  if(CORE.has(key)&&typeof window.setView==='function')window.setView(key);
  else if(CUSTOM.has(key)){
    const link=document.querySelector(`[data-view-link="${CSS.escape(key)}"]`);
    if(link){
      // Custom module still uses its internal router; use a temporary in-memory fragment and immediately clean it.
      try{history.replaceState(e.state||{},'',cleanUrl()+'#'+key)}catch(_){ }
      link.click();
      setTimeout(()=>remember(key,'replace'),0);
    }
  }
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',normalizeLegacyHash,{once:true});else normalizeLegacyHash();
})();
