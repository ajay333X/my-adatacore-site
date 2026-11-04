(()=>{
'use strict';
// Presentation-only enhancements for the admin project operations page.
// Reuses the existing controllers for every import, queue, assignment and QA action.
const $=id=>document.getElementById(id);
const hero=$('v2HeroProject'),help=document.querySelector('.tx-tab-help');
const projectList=$('projectList');
if(!hero||!projectList)return;
const headings={
 overview:'Overview · pipeline and project health',
 queue:'Live Queue · day-to-day transcription operations',
 queues:'Queue Control · manage L1/L2 pending work and routing',
 intake:'Intake & AI · importing and preparing recordings'
};
function syncTab(){
 const active=document.querySelector('.tx-workspace-tab.active');
 const tab=active?.dataset?.txTab||'overview';
 if(help)help.textContent=headings[tab]||'Project workspace';
}
function syncProjectList(){
 const active=projectList.querySelector('.project-option.active');
 if(!active)return;
 // Keep the active project visible inside the horizontal list without
 // scrolling the whole page (or changing selection).
 const left=active.offsetLeft-projectList.offsetLeft;
 const right=left+active.offsetWidth;
 const visibleLeft=projectList.scrollLeft,visibleRight=visibleLeft+projectList.clientWidth;
 if(left<visibleLeft)projectList.scrollLeft=Math.max(0,left-12);
 else if(right>visibleRight)projectList.scrollLeft=Math.max(0,right-projectList.clientWidth+12);
}
document.addEventListener('txv2:data',event=>{
 const project=String(event.detail?.projectName||'').trim();
 hero.textContent=project||'Project workspace';
 document.title=(project?project+' · ':'')+'Transcription Lab V.2 — Adatacore';
 syncProjectList();
});
projectList.addEventListener('click',()=>requestAnimationFrame(syncProjectList));
new MutationObserver(()=>requestAnimationFrame(syncProjectList)).observe(projectList,{childList:true});
document.querySelectorAll('[data-tx-tab]').forEach(tab=>{
 tab.addEventListener('click',syncTab);
 const view=document.querySelector('[data-tx-view="'+tab.dataset.txTab+'"]');
 if(view){
  const id='txv2-view-'+tab.dataset.txTab;
  view.id=id;
  tab.setAttribute('aria-controls',id);
 }
});
const table=document.querySelector('.tx-queue-card .table-scroll');
if(table){
 table.tabIndex=0;
 table.setAttribute('role','region');
 table.setAttribute('aria-label','Transcription audio queue. Scroll horizontally to see additional columns.');
}
syncTab();
})();