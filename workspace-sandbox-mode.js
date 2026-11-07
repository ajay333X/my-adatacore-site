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
async function sandboxTaskOpen(projectId,isReview){
 if(opening)return;opening=true;
 try{
  let activeSession=id;
  if(Number(projectId)!==Number(sandboxProjectId)){
    const {data,error}=await client.rpc('admin_sandbox_launch_project',{p_account_id:sandboxAccountId,p_project_id:Number(projectId)});
    if(error)throw error;
    activeSession=data.session_id;
  }
  const {data,error}=await client.rpc('admin_sandbox_real_claim',{p_session_id:activeSession,p_kind:'live'});
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
async function initializeProjectCards(){
 const {data,error}=await client.rpc('admin_sandbox_workspace',{p_session_id:id});
 if(error)throw error;
 sandboxAccountId=data?.sandbox?.account_id;sandboxProjectId=data?.sandbox?.project_id;
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
