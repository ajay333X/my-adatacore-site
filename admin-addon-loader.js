(()=>{
'use strict';
if(window.__adatacoreAdminAddonLoader)return;window.__adatacoreAdminAddonLoader=true;
const loaded=new Set();
function load(src){if(loaded.has(src)||document.querySelector(`script[src="${src}"]`))return;loaded.add(src);const s=document.createElement('script');s.src=src;s.async=false;document.body.appendChild(s)}
function apply(a){
  if(!a?.allowed)return;
  if(a.is_super_admin){
    [
      '/admin-task-finder.js?v=20260831-2','/admin-global-search.js?v=20260901-1','/admin-done-tasks-link.js?v=1','/admin-project-inventory.js?v=20260902-1','/admin-project-lab-link.js?v=3','/admin-daily-task-limit.js?v=2','/admin-assignment-center-link.js?v=1','/admin-operations-health.js?v=1','/admin-operations-suite.js?v=1','/admin-staff-roles.js?v=4','/admin-finance-ledger.js?v=2','/admin-support-center.js?v=2'
    ].forEach(load);return;
  }
  const caps=new Set(a.capabilities||[]);
  if(caps.has('support'))load('/admin-support-center.js?v=2');
  if(caps.has('finance'))load('/admin-finance-ledger.js?v=2');
}
document.addEventListener('adatacore:admin-access',e=>apply(e.detail));
if(window.__adatacoreAdminAccess)apply(window.__adatacoreAdminAccess);
})();
