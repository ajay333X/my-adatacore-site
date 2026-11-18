(()=>{
'use strict';
if(window.__finance2NavAddon)return;
window.__finance2NavAddon=true;
function inject(){
 const access=window.__adatacoreAdminAccess;
 if(access && !access.is_super_admin && !(access.capabilities||[]).includes('finance'))return;
 if(document.getElementById('finance2Link'))return;
 const anchor=document.querySelector('a[href="/admin/finance"],[data-tab="finance-ledger"],[data-tab="payments"],a[href="/admin"]');
 if(!anchor)return;
 const a=document.createElement('a');
 a.id='finance2Link';a.href='/admin/finance-2';
 a.textContent='Finance 2.0 — Payment eligibility';
 a.title='Project rates and independent reviewer payment decisions';
 a.className=anchor.className||'nav-link';
 if(anchor.parentElement){anchor.insertAdjacentElement('afterend',a)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);
else inject();
let tries=0;
const timer=setInterval(()=>{inject();if(++tries>=20||document.getElementById('finance2Link'))clearInterval(timer)},250);
})();