(()=>{'use strict';
if(window.__adatacoreTrustSafetyLink)return;window.__adatacoreTrustSafetyLink=true;
let checking=false;
async function mount(){
  if(checking||document.querySelector('[data-trust-safety-link]'))return;
  let access=window.__adatacoreAdminAccess||null;
  if(access&&!access.is_super_admin)return;
  if(!access&&typeof db!=='undefined'&&db?.rpc){
    checking=true;
    try{const {data,error}=await db.rpc('get_my_admin_access');if(!error&&data){access=data;window.__adatacoreAdminAccess=window.__adatacoreAdminAccess||data}}
    catch(_){ }
    finally{checking=false}
  }
  if(!access?.is_super_admin)return;
  const groups=[...document.querySelectorAll('.sidebar .nav-group')];
  const control=groups.find(g=>/control center/i.test(g.querySelector('.nav-label')?.textContent||''))||groups[0];
  if(!control||control.querySelector('[data-trust-safety-link]'))return;
  const a=document.createElement('a');a.className='nav-link';a.href='/admin/trust-safety';a.dataset.trustSafetyLink='1';a.textContent='Trust & Safety';a.title='Review authentication, network and device signals';
  const staff=control.querySelector('[data-tab="staff"]'),accessTab=control.querySelector('[data-tab="access"]');
  const anchor=staff||accessTab;if(anchor?.nextSibling)control.insertBefore(a,anchor.nextSibling);else control.appendChild(a);
}
const start=()=>{mount();let attempts=0;const interval=setInterval(()=>{attempts++;mount();if(document.querySelector('[data-trust-safety-link]')||attempts>=20)clearInterval(interval)},250)};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
const observer=new MutationObserver(()=>mount());observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),6000);
})();