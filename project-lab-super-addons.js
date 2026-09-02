(()=>{
'use strict';
if(window.__adatacoreProjectLabSuperAddons)return;window.__adatacoreProjectLabSuperAddons=true;
if(!window.__adatacoreProjectAdminAccess?.is_super_admin)return;
for(const src of ['/project-lab-advanced-controls.js?v=1','/project-lab-operations-suite.js?v=1']){
  const s=document.createElement('script');s.src=src;s.async=false;document.body.appendChild(s);
}
})();
