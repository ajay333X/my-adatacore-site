(()=>{
'use strict';
if(window.__adatacoreWorkspaceV2Switch)return;
window.__adatacoreWorkspaceV2Switch=true;
const live=location.pathname.replace(/\/$/,'')==='/workspace-v2';
const params=new URLSearchParams(location.search);
const keep=new URLSearchParams();
for(const name of ['test_session','impersonation','project']){
 const value=params.get(name);if(value)keep.set(name,value);
}
const toUrl=(v2)=>{const q=keep.toString();return (v2?'/workspace-v2':'/workspace')+(q?'?'+q:'')+location.hash};
function switchButton(){
 const nav=document.querySelector('.sidebar .nav-group'),header=document.querySelector('.page-header');
 if(!nav&&!header)return false;
 if(document.getElementById('acWorkspaceModeSwitch'))return true;
 const link=document.createElement('a');link.id='acWorkspaceModeSwitch';link.href=toUrl(!live);
 link.className='ac-workspace-mode-switch';link.textContent=live?'← Classic workspace':'✦ Try Workspace 2.0';
 link.setAttribute('aria-label',live?'Switch to the original contributor workspace':'Try the new contributor workspace interface');
 const description=document.createElement('span');description.className='ac-workspace-mode-note';
 description.textContent=live?'Original design is always available.':'Optional preview · Current tasks stay unchanged.';
 const wrap=document.createElement('div');wrap.className='ac-workspace-mode-wrap';wrap.append(link,description);
 if(nav)nav.append(wrap);else header.append(wrap);
 return true;
}
function countReady(){const el=document.getElementById('readyCount');return (el?.textContent||'').trim()||'Loading';}
function statusText(){const rows=document.querySelectorAll('#pastTasks .record-row');return rows.length;}
function mountV2(){
 if(!live)return true;
 if(document.getElementById('acWorkspaceV2Hero'))return true;
 const overview=document.getElementById('view-overview');
 if(!overview)return false;
 document.documentElement.classList.add('ac-workspace-v2');
 const hero=document.createElement('section');hero.id='acWorkspaceV2Hero';hero.className='acv2-hero';
 hero.innerHTML='<div class="acv2-intro"><span class="acv2-eyebrow">CONTRIBUTOR WORKSPACE · 2.0 PREVIEW</span><h1>Everything you need to work.</h1><p>Pick up your next assignment, check project updates and review feedback. Your existing task editors and review flows are unchanged.</p></div><div class="acv2-next"><div class="acv2-next-head"><span>Next up</span><span id="acv2ReadyCount">Loading…</span></div><strong id="acv2NextTitle">Checking assignments…</strong><p id="acv2NextDetail">Your current task queue is the source of truth.</p><div class="acv2-next-actions"><button id="acv2Start" type="button">Open next task →</button><a href="#assignments" data-view-link="assignments" id="acv2AllTasks">View all work</a></div></div>';
 overview.insertBefore(hero,overview.firstChild);
 const ready=document.getElementById('readyTasks');
 const start=hero.querySelector('#acv2Start');
 const update=()=>{
  hero.querySelector('#acv2ReadyCount').textContent=countReady();
  const task=ready?.querySelector('.task-open')||document.querySelector('#overviewTasks .task-open');
  const card=task?.closest('.card')||task?.parentElement;
  hero.querySelector('#acv2NextTitle').textContent=task?(card?.querySelector('h3,.task-title,.record-title,strong')?.textContent?.trim()||'Your next assignment'):'No task selected';
  hero.querySelector('#acv2NextDetail').textContent=task?'Opens your current task editor. No new task is claimed by the dashboard.':'Available work will appear here when assigned.';
  start.disabled=!task;
 };
 start.addEventListener('click',()=>{
  const task=ready?.querySelector('.task-open')||document.querySelector('#overviewTasks .task-open');
  if(task)task.click();
 });
 const observer=new MutationObserver(update);
 if(ready)observer.observe(ready,{childList:true,subtree:true});
 const count=document.getElementById('readyCount');
 if(count)observer.observe(count,{childList:true,characterData:true,subtree:true});
 update();
 const nav=document.querySelector('.sidebar .nav-group');
 if(nav){
  const heading=nav.querySelector('.nav-label');
  if(heading)heading.textContent='Your workspace';
 }
 return true;
}
function boot(){
 let attempts=0;
 const tick=setInterval(()=>{const a=switchButton(),b=mountV2();if((a&&b)||++attempts>80)clearInterval(tick)},150);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
