(()=>{'use strict';
const id=new URLSearchParams(location.search).get('test_session')||'';
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return;
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const client=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',{auth:{persistSession:true,autoRefreshToken:true}});
document.body.classList.add('sandbox-workspace');
const banner=document.createElement('div');banner.className='sandbox-workspace-banner';
banner.innerHTML='<div><strong>TEST MODE</strong> · Contributor workspace · Isolated task data · Production payouts and notifications disabled</div><button type="button" id="sandboxExit">Exit to Admin</button>';
document.body.prepend(banner);
async function end(){const b=document.getElementById('sandboxExit');b.disabled=true;b.textContent='Exiting…';try{await client.rpc('admin_sandbox_action',{p_session_id:id,p_action:'end_session'})}catch(_){}location.replace('/admin/test-accounts')}
document.getElementById('sandboxExit').onclick=end;
function disableAccount(){const form=document.getElementById('profileForm');if(form){form.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation()},true);form.querySelectorAll('input,textarea,select,button').forEach(e=>e.disabled=true)}
const reset=document.getElementById('resetBtn');if(reset){reset.onclick=()=>{};reset.disabled=true;reset.textContent='Unavailable in test mode'}
const logout=document.getElementById('logout');if(logout)logout.onclick=e=>{e.preventDefault();e.stopImmediatePropagation();end()};
const adminLink=document.getElementById('adminLink');if(adminLink)adminLink.innerHTML='<a class="nav-link" href="/admin/test-accounts">← Return to Test Accounts</a>';
}
disableAccount();
document.addEventListener('click',e=>{const b=e.target.closest?.('.task-open');if(!b)return;e.preventDefault();e.stopImmediatePropagation();
const task=b.dataset.sandboxId;
if(!/^[0-9a-f-]{36}$/i.test(task||''))return;
location.assign('/admin/test-workspace?session='+encodeURIComponent(id)+'&task='+encodeURIComponent(task));
},true);
async function renderProjects(){
 const {data,error}=await client.rpc('admin_sandbox_workspace',{p_session_id:id});
 if(error){banner.querySelector('div').textContent='TEST MODE · Session expired or access revoked: '+error.message;document.querySelectorAll('.task-open').forEach(b=>b.disabled=true);return}
 const projects=data?.sandbox?.projects||[];
 const home=document.getElementById('view-overview');if(!home)return;
 let el=document.getElementById('sandboxProjects');
 if(!el){el=document.createElement('div');el.id='sandboxProjects';el.className='sandbox-projects';home.prepend(el)}
 el.innerHTML='<div class="section-title"><div><div class="eyebrow">Assigned project access</div><h2>My test projects</h2></div><a href="/admin/test-accounts" class="pill pill-brand">Manage access</a></div><div class="sandbox-project-grid">'+
 (projects.length?projects.map(p=>'<article class="card sandbox-project-card"><div class="task-top"><span class="pill pill-brand">'+safe(p.role)+'</span><span class="pill">Sandbox</span></div><h3>'+safe(p.name)+'</h3><p>Project '+safe(p.id)+' · '+safe(p.type||'Workflow')+' · Access granted by admin</p><button type="button" class="btn btn-secondary sandbox-project-view" data-project="'+safe(p.id)+'">View assigned tasks</button></article>').join(''):'<div class="card empty">No test project access. Ask the project administrator to grant it.</div>')+'</div><div class="sandbox-task-prompt">Practice tasks are isolated. Project assignment and task access are server-validated; non-sandbox actions are unavailable.</div>';
 el.querySelectorAll('.sandbox-project-view').forEach(b=>b.onclick=()=>{const assignments=document.querySelector('[data-view-link="assignments"]');if(assignments)assignments.click();else location.hash='assignments'});
}
renderProjects().catch(console.error);
})();