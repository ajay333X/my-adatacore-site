(()=>{'use strict';
if(window.__adatacoreTrustSafetyLink)return;window.__adatacoreTrustSafetyLink=true;
let checking=false;
async function mount(){
  let access=window.__adatacoreAdminAccess||null;
  if(access&&!access.is_super_admin)return;
  if(!access&&typeof db!=='undefined'&&db?.rpc){
    checking=true;
    try{const {data,error}=await db.rpc('get_my_admin_access');if(!error&&data){access=data;window.__adatacoreAdminAccess=window.__adatacoreAdminAccess||data}}
    catch(_){ }
    finally{checking=false}
  }
  if(checking||!access?.is_super_admin)return;
  const groups=[...document.querySelectorAll('.sidebar .nav-group')];
  const control=groups.find(g=>/control center/i.test(g.querySelector('.nav-label')?.textContent||''))||groups[0];
  if(!control)return;
  const staff=control.querySelector('[data-tab="staff"]'),accessTab=control.querySelector('[data-tab="access"]');
  const anchor=staff||accessTab;
  const ensure=(attr,label,href,title)=>{
    if(control.querySelector(`[${attr}]`))return control.querySelector(`[${attr}]`);
    const a=document.createElement('a');a.className='nav-link';a.href=href;a.setAttribute(attr,'1');a.textContent=label;a.title=title;
    if(anchor?.nextSibling)control.insertBefore(a,anchor.nextSibling);else control.appendChild(a);
    return a;
  };
  const trust=ensure('data-trust-safety-link','Trust & Safety','/admin/trust-safety','Review authentication, network and device signals');
  const people=ensure('data-people-360-link','People 360','/admin/people','Open a unified participant profile with work, quality, applications, support and security context');
  if(trust&&people&&trust.previousSibling!==people){control.insertBefore(people,trust)}
}
const start=()=>{mount();let attempts=0;const interval=setInterval(()=>{attempts++;mount();if((document.querySelector('[data-trust-safety-link]')&&document.querySelector('[data-people-360-link]'))||attempts>=20)clearInterval(interval)},250)};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
const observer=new MutationObserver(()=>mount());observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),6000);
})();