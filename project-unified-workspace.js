(()=>{'use strict';
if(window.__adatacoreUnifiedProjectWorkspace)return;
window.__adatacoreUnifiedProjectWorkspace=true;
const projectId=Number(new URLSearchParams(location.search).get('project'));
if(!projectId)return;
const U='https://llmhyezgcnbognmmsnzq.supabase.co',K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const db=supabase.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const $=id=>document.getElementById(id);
const metric=(label,val,sub)=>'<div class="lab-workspace-kpi"><span>'+esc(label)+'</span><strong>'+Number(val||0).toLocaleString()+'</strong><small>'+esc(sub)+'</small></div>';
const link=(href,title,detail,badge)=>'<a class="lab-workspace-link" href="'+href+'"><div><span class="lab-workspace-badge">'+esc(badge)+'</span><strong style="display:block;margin-top:11px">'+esc(title)+'</strong><small>'+esc(detail)+'</small></div><span style="color:var(--brand);font-size:11px;font-weight:800">Open tool ↗</span></a>';
const allowed=window.__adatacoreProjectAccess;
let access=null,stats=null,inProgress=false;
const qualityView=document.createElement('section');qualityView.id='view-quality';qualityView.className='lab-view';
qualityView.innerHTML='<div class="view-head"><div><div class="eyebrow">Live quality & throughput</div><h1>Project quality</h1><p>Real review queues, contributor activity, submissions and decision outcomes for this project.</p></div><a class="btn btn-secondary" href="/admin/live-operations?project='+projectId+'">Full dashboard ↗</a></div><div id="unifiedQualityBody"><div class="card lab-card">Loading quality metrics…</div></div>';
const toolsView=document.createElement('section');toolsView.id='view-workspace-tools';toolsView.className='lab-view';
toolsView.innerHTML='<div class="view-head"><div><div class="eyebrow">Project-specific tools</div><h1>Project workspace</h1><p>Open the existing production tools with this project already selected. No duplicate management flows or permissions.</p></div></div><div id="unifiedToolsBody"></div>';
const navLinks=[
 {id:'overview',label:'Overview'},
 {id:'assignments',label:'Tasks'},
 {id:'people',label:'Contributors'},
 {id:'reviews',label:'Reviews'},
 {id:'quality',label:'Quality'},
 {id:'settings',label:'Settings'},
 {id:'workspace-tools',label:'All tools'}
];
function scopeCan(id){
 const scope=window.__adatacoreProjectAccess;
 if(!scope)return false;
 if(scope.is_super_admin)return true;
 const roles=scope.project_roles||[];
 const pm=roles.includes('project_manager'),qa=roles.includes('qa_manager');
 if(id==='quality')return pm||qa;
 if(id==='workspace-tools')return pm;
 if(['overview','reviews','activity'].includes(id))return pm||qa;
 return pm;
}
function renderQuality(d){
 const item=(d.projects||[]).find(p=>Number(p.id)===projectId);
 if(!item){$('unifiedQualityBody').innerHTML='<div class="card lab-card">No project data is available for this account.</div>';return}
 const accepted=Number(item.approvals||0),rejected=Number(item.rejections||0);
 const rate=accepted+rejected?(100*accepted/(accepted+rejected)).toFixed(1)+'%':'Not yet available';
 $('unifiedQualityBody').innerHTML='<div class="lab-workspace-kpis">'+
 metric('Pending L1',item.l1_pending,'Assigned work not yet submitted')+
 metric('Pending L2',item.l2_pending,'Reviewer assignments still pending')+
 metric('L1 audio ready',item.l1_audio_available,'Unclaimed real audio tasks')+
 metric('L2 audio ready',item.l2_audio_available,'Eligible transcripts for review')+
 '</div><div class="lab-grid-2 lab-workspace-snapshot"><div class="card lab-card"><h3>Submission outcomes</h3><div style="font-size:29px;font-weight:850;letter-spacing:-.04em;color:var(--brand)">'+rate+'</div><p>Approval rate: '+accepted+' approved decisions and '+rejected+' rejected decisions, across available records.</p><p>Decision approval rate is not the same as transcription word-accuracy or a reviewer quality score.</p></div><div class="card lab-card"><h3>Contributor activity</h3><div class="lab-workspace-kpis" style="grid-template-columns:1fr 1fr">'+metric('Recent assignees',item.contributors_active,'Based on tasks created in '+d.days+' days')+metric('Submissions',item.submissions_window,'Submitted during selected period')+'</div><p>These figures use production records and update when the dashboard is refreshed.</p></div></div><div class="lab-workspace-note" style="margin-top:12px">Open the full Operations Dashboard for date filters, a multi-project comparison, trends, current bottlenecks and queue-level reporting.</div>';
}
function renderTools(project){
 const isTx=(project?.type==='transcription');
 const paths=[
  link('/admin/live-operations?project='+projectId,'Live Operations','Monitor workload, queue bottlenecks and review throughput.','ANALYTICS'),
  link('/admin/assignments?project='+projectId,'Assignment Center','Use the existing production task-assignment controls.','TASKS'),
  link('/admin/test-accounts','Test Accounts','Grant project permissions to internal dummy contributors and test reversible claims.','TEST MODE'),
  link('/admin/reviews?project='+projectId,'Review Console','Review assigned quality work using the existing review interface.','QUALITY'),
  link('/admin/contributor-ops?project='+projectId,'Contributor Operations','Manage project participants and operational changes.','PEOPLE')
 ];
 if(isTx)paths.splice(1,0,link('/admin/transcription-v2?project='+projectId,'Transcription Lab','Production audio inventory, review queues and transcription controls.','AUDIO'));
 $('unifiedToolsBody').innerHTML='<div class="lab-workspace-links">'+paths.join('')+'</div><div class="lab-workspace-note" style="margin-top:17px">Project Lab remains the authoritative place for settings, members, assignments, templates, payments and audit history. External tools enforce their own admin permissions.</div>';
}
async function loadQuality(){
 if(inProgress)return;inProgress=true;
 try{
  const {data,error}=await db.rpc('admin_live_operations_dashboard',{p_project_id:projectId,p_days:7});
  if(error)throw Error(error.message);stats=data;renderQuality(data);
 }catch(e){$('unifiedQualityBody').innerHTML='<div class="card lab-card" style="color:var(--red)">Unable to load project quality: '+esc(e.message)+'</div>'}
 finally{inProgress=false}
}
function openTab(id){
 if(!scopeCan(id))return;
 const target=$('view-'+id);
 if(!target)return;
 if(id==='quality'&&!stats)loadQuality();
 if(id==='workspace-tools'&&!toolsView.dataset.rendered){renderTools({type:document.getElementById('setType')?.value});toolsView.dataset.rendered='1'}
 if(id==='quality'||id==='workspace-tools'){
  document.querySelectorAll('.lab-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  document.querySelectorAll('.lab-view').forEach(v=>v.classList.toggle('active',v.id==='view-'+id));
  try{history.replaceState(null,'','/admin/project-lab?project='+projectId+'#'+id)}catch(_){}
 }else{
  const native=document.querySelector('.lab-nav [data-view="'+id+'"]');
  native?.click();
 }
 updateContext();
}
function updateContext(){
 const active=document.querySelector('.lab-nav button.active')?.dataset.view||'overview';
 document.querySelectorAll('[data-unified-view]').forEach(b=>b.classList.toggle('active',b.dataset.unifiedView===active));
}
function mount(){
 const nav=document.querySelector('.lab-nav'),main=document.querySelector('.lab-main'),top=document.querySelector('.lab-actions');
 if(!nav||!main||!top||!window.__adatacoreProjectAccess)return false;
 if(!document.getElementById('view-quality'))main.appendChild(qualityView);
 if(!document.getElementById('view-workspace-tools'))main.appendChild(toolsView);
 if(!nav.querySelector('[data-view="quality"]')&&scopeCan('quality')){const b=document.createElement('button');b.dataset.view='quality';b.textContent='Quality insights';b.onclick=()=>openTab('quality');nav.appendChild(b)}
 if(!nav.querySelector('[data-view="workspace-tools"]')&&scopeCan('workspace-tools')){const b=document.createElement('button');b.dataset.view='workspace-tools';b.textContent='Project tools';b.onclick=()=>openTab('workspace-tools');nav.appendChild(b)}
 if(!document.getElementById('unifiedTopLink')){const a=document.createElement('a');a.id='unifiedTopLink';a.className='btn btn-secondary';a.href='/admin/live-operations?project='+projectId;a.textContent='Live metrics ↗';top.prepend(a)}
 if(!document.getElementById('unifiedProjectSelect')){
  const select=document.createElement('select');select.id='unifiedProjectSelect';select.className='lab-project-switch';select.title='Switch to another authorized project';select.setAttribute('aria-label','Switch project');
  select.innerHTML='<option value="'+projectId+'">Current project</option>';
 const refreshLabel=()=>{
  const code=window.AdProjectCodes?.get(projectId);
  if(code&&select.options.length===1)select.options[0].textContent=code;
 };
 refreshLabel();document.addEventListener('adatacore:project-codes-ready',refreshLabel);
  select.onchange=()=>{const id=Number(select.value);if(id&&id!==projectId)location.assign('/admin/project-lab?project='+id)};
  top.prepend(select);
 }
 if(!document.getElementById('unifiedContextNav')){
  const wrapper=document.createElement('nav');wrapper.id='unifiedContextNav';wrapper.className='lab-unified-nav';wrapper.setAttribute('aria-label','Project workspace sections');
  wrapper.innerHTML=navLinks.filter(v=>scopeCan(v.id)).map(v=>'<button type="button" data-unified-view="'+v.id+'">'+esc(v.label)+'</button>').join('')+
    '<a href="/admin/live-operations?project='+projectId+'">Live Analytics ↗</a>';
  main.prepend(wrapper);
  wrapper.addEventListener('click',e=>{const b=e.target.closest('[data-unified-view]');if(b)openTab(b.dataset.unifiedView)});
 }
 document.querySelectorAll('.lab-nav [data-view]').forEach(b=>b.addEventListener('click',()=>requestAnimationFrame(updateContext)));
 updateContext();
 const initial=location.hash.slice(1);
 if(initial==='quality'||initial==='workspace-tools')openTab(initial);
 return true;
}
async function boot(){
 for(let i=0;i<60;i++){if(mount())break;await new Promise(r=>setTimeout(r,150))}
 if(!document.getElementById('unifiedContextNav'))return;
 const select=$('unifiedProjectSelect');
 renderTools({type:document.getElementById('setType')?.value});toolsView.dataset.rendered='1';
 // Project names are useful for switching projects, but should not block the first paint.
 let projectListRequested=false;
 const populateProjects=async()=>{
  if(projectListRequested)return;projectListRequested=true;
  try{
   const res=await db.rpc('admin_live_operations_dashboard',{p_project_id:null,p_days:7});
   if(res.error)throw res.error;
   const list=res.data?.projects||[];
   if(select){select.innerHTML=list.map(x=>'<option value="'+Number(x.id)+'">'+esc(x.name)+' (#'+Number(x.id)+')</option>').join('');select.value=String(projectId)}
   const current=list.find(p=>Number(p.id)===projectId);
   if(current&&toolsView.dataset.rendered==='1')renderTools(current);
  }catch(e){console.warn('Project switcher list unavailable:',e.message);projectListRequested=false}
 };
 if(select){select.addEventListener('focus',populateProjects);select.addEventListener('pointerdown',populateProjects)}
 if('requestIdleCallback' in window)requestIdleCallback(populateProjects,{timeout:4500});
 else setTimeout(populateProjects,2000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.getElementById('view-quality')?.classList.contains('active'))loadQuality()});
}
boot().catch(console.error);
})();