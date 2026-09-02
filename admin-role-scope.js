(()=>{
  'use strict';
  if(window.__adatacoreAdminRoleScope)return;
  window.__adatacoreAdminRoleScope=true;
  if(!window.supabase?.createClient)return;

  const U='https://llmhyezgcnbognmmsnzq.supabase.co';
  const K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
  const client=window.supabase.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const roleLabel={project_manager:'Project Manager',qa_manager:'QA Manager',finance:'Finance',support:'Support'};
  let access=window.__adatacoreAdminAccess||null;
  let allowedTabs=new Set();
  let applying=false,scheduled=false,initialOpened=false;

  function capabilities(){return new Set(Array.isArray(access?.capabilities)?access.capabilities:[])}
  function roles(){return [...new Set((access?.roles||[]).map(r=>r?.role).filter(Boolean))]}
  function assignedProjects(){return Array.isArray(access?.projects)?access.projects:[]}
  function can(tab){return allowedTabs.has(tab)}

  function computeAllowed(){
    const c=capabilities();
    allowedTabs=new Set();
    if(c.has('support'))allowedTabs.add('support-center');
    if(c.has('finance'))allowedTabs.add('finance-ledger');
    if(c.has('projects')||c.has('qa_review'))allowedTabs.add('projects');
    if(c.has('assignments'))allowedTabs.add('tasks');
  }

  function firstTab(){
    const r=roles();
    if(r.length===1&&r[0]==='support')return 'support-center';
    if((r.includes('project_manager')||r.includes('qa_manager'))&&can('projects'))return 'projects';
    if(can('support-center'))return 'support-center';
    if(can('finance-ledger'))return 'finance-ledger';
    if(can('tasks'))return 'tasks';
    return [...allowedTabs][0]||'';
  }

  function setHeader(){
    const labels=roles().filter(r=>roleLabel[r]).map(r=>roleLabel[r]);
    const badge=document.querySelector('.admin-header-actions .pill');
    if(badge){badge.textContent=labels.length?`Scoped admin · ${labels.join(' + ')}`:'Scoped admin';badge.className='pill pill-brand'}
    const finder=document.getElementById('finderTrigger');if(finder)finder.style.display='none';
  }

  function renderScopedProjects(){
    if(!can('projects'))return;
    const panel=document.getElementById('projects');if(!panel)return;
    if(panel.querySelector('#scopedProjectRegistry'))return;
    const ps=assignedProjects();
    panel.innerHTML=`<div id="scopedProjectRegistry"><div class="section-title"><div><div class="eyebrow">Scoped project access</div><h2>Your assigned projects</h2><div class="page-sub">Only projects covered by your staff role are available here.</div></div></div><div class="admin-grid" id="scopedProjectCards"></div></div>`;
    const cards=panel.querySelector('#scopedProjectCards');
    cards.innerHTML=ps.length?ps.map(p=>{
      const pr=Array.isArray(p.roles)?p.roles:[];
      const pm=pr.includes('project_manager'),qa=pr.includes('qa_manager');
      const primary=qa&&!pm?`/admin/project-lab?project=${encodeURIComponent(p.id)}#reviews`:`/admin/project-lab?project=${encodeURIComponent(p.id)}`;
      const primaryLabel=qa&&!pm?'Open QA view':'Open Project Lab';
      return `<article class="card" style="padding:18px"><div class="eyebrow">Project #${esc(p.id)}</div><h3 style="margin:7px 0 5px">${esc(p.name||'Project')}</h3><div class="page-sub">${pr.map(x=>esc(roleLabel[x]||x)).join(' · ')}</div><div class="toolbar" style="margin-top:14px"><a class="btn btn-primary" href="${primary}">${primaryLabel}</a>${pm?`<a class="btn btn-secondary" href="/admin/assignments?project=${encodeURIComponent(p.id)}">Assignments</a>`:''}</div></article>`;
    }).join(''):'<div class="card empty">No project-scoped role is currently assigned to this account.</div>';
  }

  function enforceVisibility(){
    if(!access||access.is_super_admin)return;
    document.documentElement.dataset.adminScope='staff';
    document.querySelectorAll('[data-tab]').forEach(el=>{
      const id=el.dataset.tab||'';
      el.style.display=can(id)?'':'none';
      el.setAttribute('aria-hidden',can(id)?'false':'true');
    });
    document.querySelectorAll('.panel').forEach(panel=>{
      if(!can(panel.id)){panel.classList.remove('active');panel.style.setProperty('display','none','important');panel.setAttribute('aria-hidden','true')}
    });
    ['transcriptionLabNav','platformTools'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none'});
    document.querySelectorAll('a[href^="/admin/done"],a[href="/admin/recordings"],a[href="/admin/reviews"]').forEach(a=>a.style.display='none');
    setHeader();renderScopedProjects();
  }

  function forcePanel(id){
    if(!id||!can(id))return false;
    if(id==='tasks'){location.assign('/admin/assignments');return true}
    const panel=document.getElementById(id);if(!panel)return false;
    document.querySelectorAll('[data-tab]').forEach(tab=>tab.classList.toggle('active',tab.dataset.tab===id));
    document.querySelectorAll('.panel').forEach(p=>{
      const active=p.id===id&&can(p.id);
      p.classList.toggle('active',active);
      p.style.setProperty('display',active?'block':'none','important');
      p.setAttribute('aria-hidden',active?'false':'true');
    });
    const tab=document.querySelector(`[data-tab="${CSS.escape(id)}"]`);
    const heading=document.querySelector('.page-header h1'),sub=document.querySelector('.page-header .page-sub');
    if(heading&&tab)heading.textContent=tab.textContent.trim();
    if(sub)sub.textContent='Scoped staff access · only authorized Admin tools are available.';
    try{history.replaceState(null,'',`/admin#${encodeURIComponent(id)}`)}catch(_){ }
    if(id==='support-center')document.getElementById('supportRefresh')?.click();
    if(id==='finance-ledger')document.getElementById('ledgerRefresh')?.click();
    return true;
  }

  function openInitial(){
    if(initialOpened)return;
    const wanted=location.hash.replace(/^#/,'');
    const target=can(wanted)?wanted:firstTab();
    if(!target)return location.replace('/dashboard');
    if(target==='tasks'){initialOpened=true;location.replace('/admin/assignments');return}
    if(!document.getElementById(target))return;
    initialOpened=true;forcePanel(target);
  }

  function scheduleApply(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;if(applying)return;applying=true;try{enforceVisibility();openInitial()}finally{applying=false}})}

  document.addEventListener('click',e=>{
    if(!access||access.is_super_admin)return;
    const target=e.target instanceof Element?e.target:null;
    const tab=target?.closest('[data-tab]');
    if(tab&&!can(tab.dataset.tab)){
      e.preventDefault();e.stopImmediatePropagation();return;
    }
    const a=target?.closest('a[href]');if(!a)return;
    const href=a.getAttribute('href')||'';
    if(href.startsWith('/admin/assignments')&&!capabilities().has('assignments')){e.preventDefault();e.stopImmediatePropagation();return}
    const m=href.match(/^\/admin\/project-lab\?project=(\d+)/);
    if(m&&!assignedProjects().some(p=>Number(p.id)===Number(m[1]))){e.preventDefault();e.stopImmediatePropagation()}
  },true);

  async function init(){
    if(!access){const {data,error}=await client.rpc('get_my_admin_access');if(error||!data?.allowed)return location.replace('/dashboard');access=data;window.__adatacoreAdminAccess=data}
    if(access.is_super_admin)return;
    computeAllowed();
    if(!allowedTabs.size)return location.replace('/dashboard');
    const observer=new MutationObserver(scheduleApply);observer.observe(document.body,{childList:true,subtree:true});
    scheduleApply();setTimeout(scheduleApply,250);setTimeout(scheduleApply,900);
  }
  init();
})();
