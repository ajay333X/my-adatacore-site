(()=>{
  'use strict';
  const CORE_SRC='/project-lab-core.js?v=20260902-live-sync-1';
  const U='https://llmhyezgcnbognmmsnzq.supabase.co';
  const K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
  const projectId=Number(new URLSearchParams(location.search).get('project')||0);
  const syncDb=window.supabase?.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
  let baselineSettings='',lastDigest='',checking=false,lastCheckAt=0,initialReady=false,access=null,projectRoles=[];
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function settingsSnapshot(){const ids=['setName','setType','setL1Rate','setL2Rate','setLifecycle','setPublished','setDescription','setConfig','setStyle'];return JSON.stringify(ids.map(id=>document.getElementById(id)?.value??''))}
  function settingsDirty(){return initialReady&&access?.is_super_admin&&!!baselineSettings&&settingsSnapshot()!==baselineSettings}
  function digest(d){const p=d?.project||{},i=d?.inventory||{},m=d?.metrics||{},a=d?.activity?.[0]||{};return JSON.stringify([p.updated_at,p.name,p.type,p.lifecycle_status,p.published,p.l1_rate,p.l2_rate,p.description,p.config,p.style_config,i.l1_available,i.l2_available,m.tasks_total,m.tasks_pending,m.tasks_submitted,m.tasks_cancelled,m.people,m.submissions,m.pending_reviews,m.approved,m.rejected,m.approved_earnings,m.paid,m.reviews,a.id,a.created_at,a.action])}
  function readRpc(){return access?.is_super_admin?'admin_get_project_lab':'staff_get_project_lab'}
  async function readDigest(){if(!projectId||!syncDb)return '';const {data,error}=await syncDb.rpc(readRpc(),{p_project_id:projectId});if(error)return '';return digest(data)}

  async function initializeBaseline(){for(let attempt=0;attempt<80;attempt++){const title=document.getElementById('topTitle')?.textContent||'';if(title&&title!=='Project Lab')break;await sleep(100)}baselineSettings=settingsSnapshot();lastDigest=await readDigest();initialReady=true}
  async function checkForExternalChanges(force=false){if(!initialReady||checking||document.hidden||settingsDirty())return;const now=Date.now();if(!force&&now-lastCheckAt<5000)return;checking=true;lastCheckAt=now;try{const next=await readDigest();if(next&&lastDigest&&next!==lastDigest){location.reload();return}if(next)lastDigest=next}finally{checking=false}}

  function scopedViews(){
    if(access?.is_super_admin)return null;
    const pm=projectRoles.includes('project_manager'),qa=projectRoles.includes('qa_manager');
    const views=new Set(['overview','reviews','activity']);
    if(pm){views.add('people');views.add('assignments')}
    if(!pm&&qa){/* QA stays read/review focused. */}
    return views;
  }
  function forceView(id){const views=scopedViews();if(!views||!views.has(id))id=views?.has('reviews')&&projectRoles.includes('qa_manager')&&!projectRoles.includes('project_manager')?'reviews':'overview';document.querySelectorAll('.lab-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===id));document.querySelectorAll('.lab-view').forEach(v=>v.classList.toggle('active',v.id===`view-${id}`));try{history.replaceState(null,'',`/admin/project-lab?project=${projectId}#${id}`)}catch(_){}}
  function applyScopedUi(){
    const views=scopedViews();if(!views)return;
    document.documentElement.dataset.projectStaffScope='1';
    document.querySelectorAll('.lab-nav button').forEach(b=>{b.style.display=views.has(b.dataset.view)?'':'none'});
    document.querySelectorAll('.lab-view').forEach(v=>{const name=v.id.replace(/^view-/,'');if(!views.has(name)){v.classList.remove('active');v.style.setProperty('display','none','important')}});
    document.querySelectorAll('[data-jump]').forEach(b=>{if(!views.has(b.dataset.jump))b.style.display='none'});
    ['duplicateBtn','saveSettingsBtn','pauseProjectBtn','archiveProjectBtn','deleteProjectBtn','txLabLink'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none'});
    document.querySelectorAll('[data-stock],.tpl-edit,.tpl-delete').forEach(e=>e.style.display='none');
    const metrics=document.querySelectorAll('#metricGrid .metric');if(metrics[5])metrics[5].style.display='none';
    const current=location.hash.slice(1);forceView(views.has(current)?current:(projectRoles.includes('qa_manager')&&!projectRoles.includes('project_manager')?'reviews':'overview'));
    const label=projectRoles.includes('project_manager')&&projectRoles.includes('qa_manager')?'Project Manager + QA Manager':projectRoles.includes('project_manager')?'Project Manager':'QA Manager';
    const sub=document.getElementById('topSub');if(sub)sub.textContent=`Scoped ${label} access · Project #${projectId}`;
  }

  async function loadCore(){
    if(access.is_super_admin){const core=document.createElement('script');core.src=CORE_SRC;core.onload=afterCore;core.onerror=coreError;document.body.appendChild(core);return}
    const response=await fetch(CORE_SRC,{cache:'no-store'});if(!response.ok)throw new Error('Project Lab core returned '+response.status);let source=await response.text();
    const guardPattern=/async function guard\(\)\{if\(!projectId\).*?await load\(\)\}/;
    const guardReplacement="async function guard(){if(!projectId){document.body.innerHTML='<div class=\"empty\">Project ID is missing.</div>';return}const {data:{user}}=await db.auth.getUser();if(!user)return location.replace('/auth');const scoped=window.__adatacoreProjectAccess;if(!scoped?.allowed||!Array.isArray(scoped.project_roles)||!scoped.project_roles.length)return location.replace('/admin');const h=location.hash.slice(1);if(h&&document.getElementById(`view-${h}`))setView(h);await load()}";
    if(!guardPattern.test(source))throw new Error('Project Lab guard signature changed');source=source.replace(guardPattern,guardReplacement);
    const oldRead="const {data:d,error}=await db.rpc('admin_get_project_lab',{p_project_id:projectId});";
    const newRead="const {data:d,error}=await db.rpc(window.__adatacoreProjectAccess?.is_super_admin?'admin_get_project_lab':'staff_get_project_lab',{p_project_id:projectId});";
    if(!source.includes(oldRead))throw new Error('Project Lab read signature changed');source=source.replace(oldRead,newRead);
    const core=document.createElement('script');core.textContent=source;document.body.appendChild(core);afterCore();
  }
  function afterCore(){initializeBaseline();if(access?.is_super_admin){document.getElementById('saveSettingsBtn')?.addEventListener('click',()=>{let tries=0;const watch=setInterval(()=>{tries++;const toast=document.getElementById('labToast');if(toast?.textContent?.includes('Project settings saved')){clearInterval(watch);baselineSettings=settingsSnapshot();readDigest().then(v=>{if(v)lastDigest=v})}else if(tries>=20)clearInterval(watch)},150)})}else{applyScopedUi();const observer=new MutationObserver(()=>requestAnimationFrame(applyScopedUi));observer.observe(document.body,{childList:true,subtree:true});setTimeout(applyScopedUi,400)}}
  function coreError(){const main=document.querySelector('.lab-main');if(main)main.innerHTML='<div class="card empty">Project Lab failed to load. Please refresh the page.</div>'}

  async function boot(){
    if(!projectId||!syncDb)return coreError();
    const {data:{user}}=await syncDb.auth.getUser();if(!user)return location.replace('/auth');
    const {data:a,error}=await syncDb.rpc('get_my_admin_access');if(error||!a?.allowed)return location.replace('/dashboard');access=a;
    const projectAccess=(a.projects||[]).find(p=>Number(p.id)===projectId);projectRoles=Array.isArray(projectAccess?.roles)?projectAccess.roles:[];
    if(!a.is_super_admin&&!projectRoles.some(r=>r==='project_manager'||r==='qa_manager'))return location.replace('/admin');
    window.__adatacoreProjectAccess={allowed:true,is_super_admin:!!a.is_super_admin,project_id:projectId,project_roles:projectRoles};
    try{await loadCore()}catch(e){console.error(e);coreError()}
  }

  window.addEventListener('focus',()=>checkForExternalChanges(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkForExternalChanges(true)});
  setInterval(()=>checkForExternalChanges(false),30000);
  boot();
})();
