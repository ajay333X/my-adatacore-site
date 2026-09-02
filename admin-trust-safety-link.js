(()=>{'use strict';
if(window.__adatacoreTrustSafetyLink)return;window.__adatacoreTrustSafetyLink=true;
async function mount(){
  const access=window.__adatacoreAdminAccess||null;
  if(access&&!access.is_super_admin)return;
  let allowed=access?.is_super_admin;
  if(allowed==null&&window.db?.rpc){try{const {data}=await db.rpc('get_my_admin_access');allowed=!!data?.is_super_admin}catch(_){allowed=false}}
  if(!allowed)return;
  const groups=[...document.querySelectorAll('.sidebar .nav-group')];
  const control=groups.find(g=>/control center/i.test(g.querySelector('.nav-label')?.textContent||''))||groups[0];
  if(!control||control.querySelector('[data-trust-safety-link]'))return;
  const a=document.createElement('a');a.className='nav-link';a.href='/admin/trust-safety';a.dataset.trustSafetyLink='1';a.textContent='Trust & Safety';a.title='Review authentication, network and device signals';
  const staff=control.querySelector('[data-tab="staff"]'),accessTab=control.querySelector('[data-tab="access"]');
  const anchor=staff||accessTab;if(anchor?.nextSibling)control.insertBefore(a,anchor.nextSibling);else control.appendChild(a);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,0));else setTimeout(mount,0);
const observer=new MutationObserver(()=>mount());observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),5000);
})();