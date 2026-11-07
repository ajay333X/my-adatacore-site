(()=>{'use strict';
if(window.__adatacoreContributorProjectHub)return;
window.__adatacoreContributorProjectHub=true;
document.documentElement.classList.add('ac-contributor-simple');
const U='https://llmhyezgcnbognmmsnzq.supabase.co',K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const client=supabase.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const date=v=>{if(!v)return '—';const d=new Date(v);return isNaN(d.getTime())?'—':d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})};
const projectLink=id=>'/workspace?project='+encodeURIComponent(id);
const isUUID=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s||''));
let projects=[],current=null,detail=null,tab='instructions',requestSeq=0,originalHomeTitle=null;
const sandboxSession=new URLSearchParams(location.search).get('test_session')||'';
const isSandbox=isUUID(sandboxSession);
function initElements(){
 const overview=$('view-overview'),main=document.querySelector('.app-main');
 if(!overview||!main)return false;
 if(!$('acHomeProjects')){
  const home=document.createElement('section');home.id='acHomeProjects';
  home.innerHTML='<div class="ac-home-intro"><h2>Your projects</h2><p>Open a project for its instructions, resources, feedback, and announcements. Start work from Assignments.</p></div><div class="ac-home-empty" id="acHomeProjectCards">Loading your assigned projects…</div>';
  overview.insertBefore(home,overview.firstElementChild);
 }
 if(!$('view-project')){
  const section=document.createElement('section');section.id='view-project';section.className='workspace-view';
  section.innerHTML='<a class="ac-project-back" href="#overview" id="acProjectBack">← Back to projects</a><div class="ac-project-head"><h2 id="acProjectTitle">Project</h2><span id="acProjectRate" class="ac-project-rate" hidden></span></div><p id="acProjectSub" class="ac-project-sub"></p><nav id="acProjectTabs" class="ac-detail-tabs" aria-label="Project sections"><button class="ac-detail-tab" data-project-tab="instructions" role="tab" aria-selected="true">Instructions</button><button class="ac-detail-tab" data-project-tab="library" role="tab" aria-selected="false">Library</button><button class="ac-detail-tab" data-project-tab="feedback" role="tab" aria-selected="false">Feedback</button><button class="ac-detail-tab" data-project-tab="announcements" role="tab" aria-selected="false">Announcements</button></nav><div id="acProjectContent" class="ac-detail-panel" role="tabpanel"><div class="ac-detail-loading">Loading project information…</div></div>';
  main.appendChild(section);
  section.querySelector('#acProjectBack').addEventListener('click',e=>{e.preventDefault();closeProject()});
  section.querySelector('#acProjectTabs').addEventListener('click',e=>{const b=e.target.closest('[data-project-tab]');if(!b)return;changeTab(b.dataset.projectTab)});
  section.querySelector('#acProjectContent').addEventListener('click',async e=>{
   const b=e.target.closest('[data-guideline-ack]');
   if(b){b.disabled=true;try{const {error}=await client.rpc('acknowledge_project_guideline',{p_guideline:b.dataset.guidelineAck});if(error)throw error;detail=null;await readProject(current.id);changeTab('instructions')}catch(error){b.disabled=false;alert('Unable to acknowledge guideline: '+error.message)}return}
   const feedback=e.target.closest('[data-feedback-id]');if(feedback){const item=feedback.dataset.item,review=feedback.dataset.feedbackId;if(isUUID(item)&&Number.isInteger(Number(review))&&Number(review)>0)location.assign('/transcription-v2?item='+encodeURIComponent(item)+'&review='+encodeURIComponent(review))}
  });
 }
 return true;
}
function setHeader(name,sub){
 const h=$('viewHeading'),s=$('viewSub'),eye=$('viewEyebrow');
 if(h)h.textContent=name;if(s)s.textContent=sub;if(eye)eye.textContent=current?'Project workspace':'Contributor workspace';
}
function renderProjects(){
 const host=$('acHomeProjectCards');if(!host)return;
 host.className=projects.length?'ac-project-grid':'ac-home-empty';
 host.innerHTML=projects.length?projects.map(p=>
 '<article class="ac-project-card"><div class="ac-pr-top"><span class="ac-pr-type">'+esc(p.type==='transcription'?'Transcription':p.type==='voice_recording'?'Voice recording':p.type||'Project')+'</span><span class="pill pill-green">Assigned</span></div><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||'Project instructions, feedback and updates are available inside.')+'</p><div class="ac-pr-action"><span>Project #'+Number(p.id)+'</span><a href="'+projectLink(p.id)+'" data-project-id="'+Number(p.id)+'">View project →</a></div></article>').join(''):'No active project access appears on this account. Your available task assignments remain accessible under Assignments.';
}
async function readList(){
 try{
  let result;
  if(isSandbox){const {data,error}=await client.rpc('admin_sandbox_workspace',{p_session_id:sandboxSession});if(error)throw error;result=(data?.sandbox?.projects||[]).map(p=>({...p,lifecycle:'active'}))}
  else{const {data,error}=await client.rpc('contributor_my_project_hubs');if(error)throw error;result=data}
  projects=Array.isArray(result)?result:[];renderProjects();
  const query=new URLSearchParams(location.search),p=Number(query.get('project')||0);
  if(p&&projects.some(x=>Number(x.id)===p))openProject(p,false);
 }catch(error){const host=$('acHomeProjectCards');if(host){host.className='ac-home-empty';host.textContent='Unable to load assigned projects: '+error.message}}
}
function returnOverview(){
 document.querySelectorAll('.workspace-view').forEach(v=>v.classList.toggle('active',v.id==='view-overview'));
 document.querySelectorAll('[data-view-link]').forEach(x=>x.classList.toggle('active',x.dataset.viewLink==='overview'));
 current=null;detail=null;tab='instructions';
 setHeader('Overview','Your assigned projects and available work.');
}
function closeProject(){
 returnOverview();
 const u=new URL(location.href);u.searchParams.delete('project');u.hash='overview';
 history.pushState({workspaceView:'overview'},'',u.pathname+u.search+u.hash);
}
function openProject(id,updateUrl=true){
 const project=projects.find(p=>Number(p.id)===Number(id));if(!project)return;
 current=project;detail=null;tab='instructions';requestSeq++;
 document.querySelectorAll('.workspace-view').forEach(v=>v.classList.toggle('active',v.id==='view-project'));
 document.querySelectorAll('[data-view-link]').forEach(x=>x.classList.toggle('active',x.dataset.viewLink==='overview'));
 $('acProjectTitle').textContent=project.name||'Project';
 $('acProjectSub').textContent=project.description||'Project instructions, resources and feedback.';
 $('acProjectRate').hidden=true;
 setHeader('Project details','Instructions, library, feedback and announcements');
 changeTab('instructions');
 if(updateUrl){const u=new URL(location.href);u.searchParams.set('project',String(project.id));u.hash='';history.pushState({project:project.id},'',u.pathname+u.search)}
 readProject(project.id);
 window.scrollTo({top:0,behavior:'smooth'});
}
async function readProject(id){
 const seq=++requestSeq;
 if(isSandbox){detail={project:current,guidelines:[],library:[],feedback:[],announcements:[]};$('acProjectContent').innerHTML='<div class="ac-tab-empty">Test identities can access project task queues. Contributor-specific published content is not available in sandbox mode.</div>';return}
 try{
 const {data,error}=await client.rpc('contributor_project_hub',{p_project_id:id});
 if(error)throw error;if(seq!==requestSeq||Number(current?.id)!==Number(id))return;
 detail=data||{};if(detail.project?.hourly_rate!=null){const rate=$('acProjectRate');rate.textContent=(detail.project.currency==='USD'?'$':String(detail.project.currency||'')+' ')+Number(detail.project.hourly_rate).toFixed(2)+'/audio hour';rate.hidden=false}
 renderTab();
 }catch(error){if(seq!==requestSeq)return;$('acProjectContent').innerHTML='<div class="ac-tab-empty">Unable to load project information: '+esc(error.message)+'</div>'}
}
function changeTab(next){
 if(!['instructions','library','feedback','announcements'].includes(next))return;
 tab=next;
 document.querySelectorAll('[data-project-tab]').forEach(b=>{const active=b.dataset.projectTab===tab;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1});
 renderTab();
}
const empty=(title,desc)=>'<div class="ac-tab-empty"><strong>'+esc(title)+'</strong><div style="margin-top:8px">'+esc(desc)+'</div></div>';
function renderTab(){
 const host=$('acProjectContent');if(!host)return;
 if(!detail){host.innerHTML='<div class="ac-detail-loading">Loading project information…</div>';return}
 const h={instructions:['Instructions','Read the published requirements before starting work.'],library:['Library','Reference materials and published project guides.'],feedback:['Feedback received','Select a row to inspect reviewer feedback and transcript changes.'],announcements:['Announcements','Updates shared for this project.']}[tab];
 let body='<h3>'+h[0]+'</h3><p class="ac-panel-sub">'+h[1]+'</p>';
 if(tab==='instructions'){
  const entries=detail.guidelines||[];
  body+=entries.length?'<div class="ac-instructions-list">'+entries.map(g=>'<article class="ac-rule-card"><strong>'+esc(g.title||'Project guide')+' · v'+Number(g.version||1)+'</strong><p>'+esc(g.body||'')+'</p>'+(g.required&&!g.acknowledged?'<button class="btn btn-secondary" type="button" data-guideline-ack="'+esc(g.id)+'">Mark as read</button>':g.acknowledged?'<span class="pill pill-green">Acknowledged</span>':'')+'</article>').join('')+'</div>':empty('No published instructions yet','The project administrator has not published instructions here.');
  if(detail.project?.description)body+='<article class="ac-detail-entry"><h4>Project overview</h4><p>'+esc(detail.project.description)+'</p></article>';
 }else if(tab==='library'){
  const entries=detail.library||[];
  body+=entries.length?entries.map(g=>'<article class="ac-detail-entry"><h4>'+esc(g.title||'Resource')+'</h4><time>Version '+Number(g.version||1)+' · '+date(g.published_at)+'</time><p>'+esc(g.body||'')+'</p></article>').join(''):empty('No resources published','When guidelines or reference documents are published for this project, they will appear here.');
 }else if(tab==='feedback'){
  const entries=detail.feedback||[];
  body+=entries.length?'<div style="overflow-x:auto"><table class="ac-feedback-table"><thead><tr><th>Audio / task</th><th>Review date</th><th>Decision</th><th>Avg score</th></tr></thead><tbody>'+entries.map(f=>{const scores=Object.values(f.ratings||{}).map(Number).filter(x=>Number.isFinite(x)&&x>=0);const overall=Number(f.ratings?.overall);const score=Number.isFinite(overall)&&f.ratings?.overall!=null?overall:(scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null);return '<tr data-feedback-id="'+Number(f.history_id)+'" data-item="'+esc(f.audio_item_id)+'" tabindex="0" title="Open feedback detail"><td>'+esc(f.audio_name||'Audio task')+'</td><td>'+date(f.reviewed_at)+'</td><td>'+esc(f.decision==='approve'?'Approved':'Changes requested')+'</td><td>'+(score!=null?'<span class="ac-feedback-score">'+score.toFixed(1)+'</span>':'—')+'</td></tr>'}).join('')+'</tbody></table></div>':empty('No feedback yet','Your reviewed transcription submissions will appear here after a reviewer has completed the review.');
 }else{
  const entries=detail.announcements||[];
  body+=entries.length?entries.map(a=>'<article class="ac-detail-entry"><h4>'+esc(a.title||'Update')+'</h4><time>'+date(a.published_at)+'</time><p>'+esc(a.body||'')+'</p>'+(a.requires_ack?'<span class="pill '+(a.acknowledged?'pill-green':'')+'">'+(a.acknowledged?'Acknowledged':'Please review')+'</span>':'')+'</article>').join(''):empty('No announcements','Project announcements and important changes will show up here.');
 }
 host.innerHTML=body;
}
document.addEventListener('click',e=>{
 const l=e.target.closest('[data-project-id]');if(l){e.preventDefault();e.stopImmediatePropagation();openProject(Number(l.dataset.projectId));return}
 if(current&&e.target.closest('[data-view-link]')){const a=e.target.closest('[data-view-link]');if(a.dataset.viewLink!=='overview'){current=null;detail=null;const u=new URL(location.href);u.searchParams.delete('project');history.replaceState({workspaceView:a.dataset.viewLink},'',u.pathname+u.search+u.hash)}else{e.preventDefault();e.stopImmediatePropagation();closeProject()}}
},true);
document.addEventListener('keydown',e=>{const row=e.target.closest?.('[data-feedback-id]');if(row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();row.click()}});
window.addEventListener('popstate',()=>{const p=Number(new URLSearchParams(location.search).get('project')||0);if(p&&projects.some(x=>Number(x.id)===p))openProject(p,false);else if(current)returnOverview()});
function boot(){if(!initElements())return;readList()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();