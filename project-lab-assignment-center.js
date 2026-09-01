(()=>{'use strict';
const params=new URLSearchParams(location.search),pid=Number(params.get('project')||0),center=()=>`/admin/assignments${pid?`?project=${pid}`:''}`;
function wire(){
  const actions=document.querySelector('.lab-actions');
  if(actions&&!document.getElementById('projectLabAssignmentCenter')){const a=document.createElement('a');a.id='projectLabAssignmentCenter';a.className='btn btn-primary';a.href=center();a.textContent='Assignment Center';actions.prepend(a)}
  const quick=[...document.querySelectorAll('.quick')].find(b=>b.dataset.jump==='assignments');
  if(quick){quick.innerHTML='<strong>Assign work</strong><span>Open the single Assignment Center for project access, people and task limits.</span>';quick.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();location.href=center()},true)}
  const view=document.getElementById('view-assignments'),bulk=view?.querySelector('.assign-bulk');
  if(bulk&&!document.getElementById('assignmentCenterProjectCard')){
    const legacy=document.getElementById('bulkAssignBtn')?.closest('.card');
    if(legacy){legacy.style.display='none';legacy.setAttribute('aria-hidden','true')}
    const card=document.createElement('div');card.id='assignmentCenterProjectCard';card.className='card lab-card';card.innerHTML=`<div class="eyebrow">Unified assignment</div><h3 style="margin-top:7px">Create new work in Assignment Center</h3><p>New assignments are managed from one page. Choose this project, select one or hundreds of people, restore project access automatically, and set the target task limit without creating duplicate batches.</p><a class="btn btn-primary" href="${center()}">Open Assignment Center →</a><p class="muted tiny" style="margin-top:10px">The task registry and selected-task maintenance tools below remain here for existing work.</p>`;bulk.prepend(card)
  }
  const head=view?.querySelector('.view-head');if(head){const p=head.querySelector('p');if(p)p.textContent='Create new work in the unified Assignment Center. Use this page to inspect existing tasks and safely maintain selected assignments.'}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire);else wire();
})();