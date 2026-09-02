(()=>{
'use strict';
if(window.__adatacoreProjectLabRoleAccess)return;window.__adatacoreProjectLabRoleAccess=true;
const projectId=Number(new URLSearchParams(location.search).get('project')||0);
const a=window.__adatacoreProjectAdminAccess;
if(!a?.allowed||a.is_super_admin)return;
const scoped=(a.projects||[]).find(p=>Number(p.id)===projectId);
if(!scoped)return;
const roles=new Set(scoped.roles||[]),isPM=roles.has('project_manager'),isQA=roles.has('qa_manager');
const allowed=new Set(['overview','people','assignments','reviews','activity']);
const css=document.createElement('style');css.textContent=`.limited-project-note{margin-bottom:14px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--brand-soft);font-size:10px;line-height:1.55}.limited-project-note strong{font-size:11px}.limited-project-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.limited-readonly{pointer-events:none;opacity:.62}`;document.head.appendChild(css);
function apply(){
  document.querySelectorAll('.lab-nav button[data-view]').forEach(b=>{if(!allowed.has(b.dataset.view))b.remove()});
  document.querySelectorAll('.lab-view').forEach(v=>{const name=v.id.replace(/^view-/,'');if(!allowed.has(name))v.remove()});
  document.getElementById('duplicateBtn')?.remove();
  document.getElementById('txLabLink')?.remove();
  if(!isPM){document.getElementById('projectLabAssignmentCenter')?.remove();document.querySelectorAll('.quick[data-jump="assignments"]').forEach(b=>{b.onclick=e=>{e.preventDefault();e.stopImmediatePropagation();document.querySelector('.lab-nav [data-view="assignments"]')?.click()}})}
  document.querySelectorAll('.people-bulk,.assign-bulk,.danger-zone,[data-stock],#bulkAssignBtn,#runTaskActionBtn,#saveTemplateBtn,#deleteProjectBtn,#pauseProjectBtn,#archiveProjectBtn').forEach(el=>el.remove());
  document.querySelectorAll('#view-assignments input[type="checkbox"],#view-assignments .task-check,#view-assignments #selectAllTasks').forEach(el=>{el.disabled=true});
  const main=document.querySelector('.lab-main');
  if(main&&!document.getElementById('limitedProjectNote')){
    const note=document.createElement('div');note.id='limitedProjectNote';note.className='limited-project-note';
    const labels=[];if(isPM)labels.push('Project Manager');if(isQA)labels.push('QA Manager');
    note.innerHTML=`<strong>${labels.join(' + ')} access</strong><br>You can inspect this assigned project without receiving platform-wide Admin permissions.<div class="limited-project-actions">${isPM?`<a class="btn btn-primary" href="/admin/assignments?project=${projectId}">Open Assignment Center</a>`:''}${isQA?`<a class="btn btn-primary" href="/admin/done-tasks?project=${projectId}">Open Done Tasks</a>`:''}<a class="btn btn-secondary" href="/admin">Back to Admin</a></div>`;
    main.prepend(note);
  }
  const current=location.hash.replace(/^#/,'');if(current&&!allowed.has(current))window.history.replaceState(null,'',`/admin/project-lab?project=${projectId}#overview`);
}
apply();
const ob=new MutationObserver(apply);ob.observe(document.body,{childList:true,subtree:true});setTimeout(()=>ob.disconnect(),5000);
})();
