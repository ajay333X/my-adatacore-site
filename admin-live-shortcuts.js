(()=>{'use strict';if(window.__adatacoreLiveShortcuts)return;window.__adatacoreLiveShortcuts=true;
const sidebar=document.querySelector('.sidebar');
if(!sidebar)return;
function add(){
 const access=window.__adatacoreAdminAccess;
 if(!access?.allowed)return;
 const nav=document.querySelector('.sidebar .ac-modern-nav')||document.querySelector('.sidebar .nav-group');
 if(!nav)return;
 if(!document.getElementById('liveOpsNav')){
  const link=document.createElement('a');link.id='liveOpsNav';link.href='/admin/live-operations';link.className='nav-link';link.textContent='Live Operations & Quality';link.title='Live queue, throughput, contributor and review statistics';
  nav.appendChild(link);
 }
 if(!document.getElementById('unifiedProjectNav')){
  const link=document.createElement('a');link.id='unifiedProjectNav';link.href='/admin/projects';link.className='nav-link';link.textContent='Unified Project Workspace';link.title='Choose a project to manage tasks, people, quality and settings';
  nav.appendChild(link);
 }
 window.adatacoreModernAdmin?.refresh?.();
}
if(window.__adatacoreAdminAccess?.allowed){add();return}
let tries=0;const timer=setInterval(()=>{tries++;if(window.__adatacoreAdminAccess?.allowed){clearInterval(timer);add()}else if(tries>=40)clearInterval(timer)},200);
})();