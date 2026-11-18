(()=>{
'use strict';
if(window.__finance2NavAddon)return;
window.__finance2NavAddon=true;
function inject(){
 const access=window.__adatacoreAdminAccess;
 if(!access || (!access.is_super_admin && !(access.capabilities||[]).includes('finance')))return;
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
async function check(){
 if(!window.__adatacoreAdminAccess && window.supabase?.createClient){
 try{const db=window.supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',{auth:{persistSession:true,autoRefreshToken:true}});
 const {data,error}=await db.rpc('get_my_admin_access');if(!error && data?.allowed)window.__adatacoreAdminAccess=data;}catch(_){ }
 }
 inject();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',check);
else check();
let tries=0;
const timer=setInterval(()=>{inject();if(++tries>=20||document.getElementById('finance2Link'))clearInterval(timer)},250);
})();