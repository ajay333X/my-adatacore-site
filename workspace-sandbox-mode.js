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

let sandboxAccountId=null,sandboxProjectId=null,opening=false;
async function sandboxTaskOpen(projectId,isReview,claimKind='live'){
 if(opening)return;opening=true;
 try{
  let activeSession=id;
  if(Number(projectId)!==Number(sandboxProjectId)){
    const {data,error}=await client.rpc('admin_sandbox_launch_project',{p_account_id:sandboxAccountId,p_project_id:Number(projectId)});
    if(error)throw error;
    activeSession=data.session_id;
  }
  const {data,error}=await client.rpc('admin_sandbox_real_claim',{p_session_id:activeSession,p_kind:claimKind});
  if(error)throw error;
  if(!data?.claim_id)throw Error('No eligible real task available at this level.');
  location.assign('/admin/test-editor?test_session='+encodeURIComponent(activeSession)+'&item='+encodeURIComponent(data.claim_id));
 }catch(e){
  const sub=document.getElementById('viewSub');
  if(sub)sub.textContent='TEST MODE · '+String(e.message||e);
  alert('Test mode: '+String(e.message||e));
 }finally{opening=false}
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('.project-open');
 if(!b)return;
 e.preventDefault();e.stopImmediatePropagation();
 const review=b.dataset.txReviewProject,produce=b.dataset.txProject;
 if(review||produce){sandboxTaskOpen(Number(review||produce),!!review);return}
 // Block every other production project action for sandbox accounts.
 const sub=document.getElementById('viewSub');
 if(sub)sub.textContent='TEST MODE · This project action needs a sandbox adapter.';
},true);

function renderGrantedProjects(projects){
 const home=document.getElementById('view-overview');
 if(!home)return;
 let section=document.getElementById('sandboxGrantedProjects');
 if(!section){section=document.createElement('section');section.id='sandboxGrantedProjects';section.className='sandbox-granted-projects';home.insertBefore(section,home.firstElementChild)}
 const list=Array.isArray(projects)?projects:[];
 section.innerHTML='<div class="section-title"><div><div class="eyebrow">Project access</div><h2>Assigned projects</h2></div><span class="pill pill-brand">'+list.length+' assigned</span></div>'+
 '<div class="task-grid">'+(list.length?list.map(p=>{
  const supported=p.type==='transcription';
  return '<article class="card card-hover task-card"><div class="task-top"><span class="pill pill-brand">'+safe(p.role)+'</span><span class="pill pill-green"><span class="status-dot"></span>Access granted</span></div>'+
  '<h3>'+safe(p.name)+'</h3><div class="task-public-id">Project '+Number(p.id)+' · '+safe(p.type||'Project')+'</div>'+
  '<div class="task-actions"><span class="muted" style="font-size:11px">'+(supported?'Real source · isolated test claims':'Isolated practice · live submissions disabled')+'</span>'+
  '<button type="button" class="btn btn-primary sandbox-granted-open" data-project="'+Number(p.id)+'" data-type="'+safe(p.type||'custom')+'">'+(supported?'Open isolated task queue →':'Open safe practice workspace →')+'</button>'+'</div></article>';
 }).join(''):'<div class="card empty" style="grid-column:1/-1">No projects assigned. Grant access in Admin → Test Accounts.</div>')+'</div>';
 section.querySelectorAll('.sandbox-granted-open').forEach(b=>b.addEventListener('click',()=>{
  const projectId=Number(b.dataset.project);
  if(b.dataset.type!=='transcription'){
    client.rpc('admin_sandbox_launch_project',{p_account_id:sandboxAccountId,p_project_id:projectId}).then(({data,error})=>{
      if(error)throw error;
      location.assign('/admin/test-workspace?session='+encodeURIComponent(data.session_id));
    }).catch(error=>{const sub=document.getElementById('viewSub');if(sub)sub.textContent='TEST MODE · '+String(error.message||error)});
    return;
  }
  const native=Array.from(document.querySelectorAll('.project-open')).find(x=>Number(x.dataset.txProject||x.dataset.txReviewProject)===projectId);
  if(native){native.scrollIntoView({behavior:'smooth',block:'center'});native.focus();return}
  client.rpc('admin_sandbox_launch_project',{p_account_id:sandboxAccountId,p_project_id:projectId}).then(({data,error})=>{
    if(error)throw error;
    location.assign('/admin/test-workspace?session='+encodeURIComponent(data.session_id));
  }).catch(error=>{const sub=document.getElementById('viewSub');if(sub)sub.textContent=String(error.message||error)});
 }));
}
async function initializeProjectCards(){
 const {data,error}=await client.rpc('admin_sandbox_workspace',{p_session_id:id});
 if(error)throw error;
 sandboxAccountId=data?.sandbox?.account_id;sandboxProjectId=data?.sandbox?.project_id;
 renderGrantedProjects(data?.sandbox?.projects);
 if(data?.sandbox?.level==='L2'){
   const control=document.createElement('button');
   control.id='sandboxReviewL1';control.type='button';
   control.className='sandbox-review-l1';
   control.textContent='Review dummy L1 submission';
   control.title='Review a real audio source submitted by the other dummy, without affecting production';
   const header=banner.querySelector('div');
   if(header)header.append(' · ',control);
   control.onclick=()=>sandboxTaskOpen(Number(sandboxProjectId),true,'test_submission');
 }

 const response=await fetch('/workspace-project-groups.js?v=7',{cache:'no-store'});
 if(!response.ok)throw Error('Project cards could not be loaded');
 let source=await response.text();
 const old="db.rpc('tx_my_transcription_projects')";
 if(!source.includes(old))throw Error('Project card compatibility check failed');
 source=source.replace(old,"db.rpc('admin_sandbox_project_cards',{p_session_id:'"+id+"'})");
 const script=document.createElement('script');script.textContent=source;
 document.body.appendChild(script);
}
initializeProjectCards().catch(error=>{
 const sub=document.getElementById('viewSub');
 if(sub)sub.textContent='Sandbox project cards unavailable: '+String(error.message||error);
 console.error(error);
});
})();
