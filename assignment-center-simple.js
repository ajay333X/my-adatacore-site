(()=>{
'use strict';
// Three-control Assignment Center. Permissions, daily limits, and allocation
// are authorized and written atomically through the existing Supabase backend.
const $=id=>document.getElementById(id);
if(!$('levelChoice')||!window.supabase)return;
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
const model={projects:[],people:[],access:[],daily_settings:[],review_levels:[],access_limits:[],assigned_today:[]};
const picked=new Set();
let project=null,busy=false,loading=false,started=false,serial=0,formOwner='';
const norm=x=>String(x||'').toLocaleLowerCase();
const num=x=>Number(x)||0;
const tx=()=>project?.project_type==='transcription';
const node=(tag,cls,value)=>{
 const el=document.createElement(tag);if(cls)el.className=cls;
 if(value!==undefined)el.textContent=String(value);return el;
};
const motion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
const rpc=async(name,args)=>{
 const {data,error}=await db.rpc(name,args);
 if(error)throw Error(error.message);
 return data;
};
const selection=()=>[...picked].map(id=>model.people.find(p=>String(p.id)===id)).filter(Boolean);
const membership=p=>model.access.find(a=>num(a.project_id)===num(project?.id)&&String(a.user_id)===String(p.id));
const settings=p=>model.daily_settings.find(a=>num(a.project_id)===num(project?.id)&&String(a.user_id)===String(p.id));
const legacyLevel=p=>model.review_levels.find(a=>num(a.project_id)===num(project?.id)&&String(a.user_id)===String(p.id));
const legacyLimit=p=>model.access_limits.find(a=>num(a.project_id)===num(project?.id)&&String(a.user_id)===String(p.id));
const today=p=>model.assigned_today.find(a=>num(a.project_id)===num(project?.id)&&String(a.user_id)===String(p.id));
const state=p=>membership(p)?.status||'inherited';
const currentLevel=p=>settings(p)?.level||legacyLevel(p)?.level||'L1';
const currentLimit=p=>num(settings(p)?.tasks_per_day||legacyLimit(p)?.tasks_per_day)||5;
const isMember=p=>state(p)==='active';
const labelRole=v=>v==='BOTH'?'L1 + L2':v||'L1';
function status(text,value){
 const el=$('syncStatus');el.dataset.state=value||'busy';
 const span=el.lastChild;if(span)span.textContent=' '+text;
}
function stats(){
 $('statProjects').textContent=model.projects.length;
 $('statPeople').textContent=model.people.length;
 $('statGrants').textContent=model.access.filter(x=>x.status==='active').length;
 $('statRevoked').textContent=model.access.filter(x=>x.status==='revoked').length;
 $('projectCount').textContent=model.projects.length+' projects';
 status('Synced','ready');
}
function renderProjects(){
 const list=$('projectList'),q=norm($('projectSearch').value).trim();
 list.replaceChildren();
 const projects=model.projects.filter(p=>!q||norm(p.project_name+' '+p.project_type+' '+p.id).includes(q));
 if(!projects.length){list.append(node('p','ac-skeleton','No projects match this search.'));return}
 for(const p of projects){
  const row=node('button','ac-project-item');row.type='button';
  row.dataset.projectId=String(p.id);row.setAttribute('role','option');
  row.setAttribute('aria-selected',String(num(project?.id)===num(p.id)));
  const symbol=node('span','ac-project-glyph',p.project_type==='transcription'?'≋':'▦');
  symbol.dataset.type=p.project_type||'general';
  const info=node('span','ac-project-info');
  info.append(node('strong','',p.project_name),node('small','',(p.project_type||'General').replace('_',' ')+' · '+p.lifecycle_status));
  row.append(symbol,info,node('span','ac-project-num','#'+p.id));
  row.addEventListener('click',()=>chooseProject(p));
  list.append(row);
 }
}
function projectSummary(){
 if(!project){$('projectContext').textContent='Choose a project';$('queueStats').textContent='—';return}
 $('projectContext').textContent=project.project_name+' · '+(project.project_type||'General project').replace('_',' ');
 const readyL1=tx()?num(project.tx_l1_ready):num(project.l1_available);
 const readyL2=tx()?num(project.tx_l2_ready):num(project.l2_available);
 $('queueStats').textContent=(project.lifecycle_status==='active'?'':'Archived · ')+readyL1+' L1 ready · '+readyL2+' L2 ready';
}
function chooseProject(next){
 if(busy)return;
 project=next;picked.clear();formOwner='';
 $('peopleSearch').value='';$('peopleFilter').value='all';$('actionResult').hidden=true;
 const url=new URL(location.href);url.searchParams.set('project',String(next.id));
 history.replaceState(null,'',url.pathname+url.search);
 projectSummary();renderProjects();renderRoster();populateForm();renderActions();
}
function matchesPeople(){
 const q=norm($('peopleSearch').value).trim(),filter=$('peopleFilter').value;
 return model.people.filter(p=>{
  if($('activeOnly').checked&&p.account_status!=='active')return false;
  if(filter==='selected'&&!picked.has(String(p.id)))return false;
  if(filter==='active'&&!isMember(p))return false;
  if(filter==='revoked'&&state(p)!=='revoked')return false;
  if(filter==='inherited'&&state(p)!=='inherited')return false;
  return !q||norm([p.full_name,p.email,p.uid,currentLevel(p)].join(' ')).includes(q);
 });
}
function renderRoster(){
 const list=$('peopleList');list.replaceChildren();
 if(!project){list.append(node('div','ac-skeleton','Choose a project to view contributors.'));return}
 const visible=matchesPeople();
 $('visibleCount').textContent=visible.length+' contributors';
 $('selectedInfo').textContent=picked.size+' selected';
 $('rosterDetail').textContent=visible.length+' shown · '+model.people.length+' total';
 $('selectVisible').checked=Boolean(visible.length)&&visible.every(p=>picked.has(String(p.id)));
 $('selectVisible').indeterminate=visible.some(p=>picked.has(String(p.id)))&&!$('selectVisible').checked;
 if(!visible.length){list.append(node('div','ac-skeleton','No contributors match your search.'));return}
 const fragment=document.createDocumentFragment();
 for(const p of visible){
  const checked=picked.has(String(p.id)),row=node('div','ac-member');
  row.dataset.selected=String(checked);row.dataset.inactive=String(p.account_status!=='active');
  const identity=node('div','ac-person-identity'),check=node('input','ac-person-check');
  check.type='checkbox';check.checked=checked;
  check.setAttribute('aria-label','Select '+(p.full_name||p.email));
  check.addEventListener('change',()=>{toggle(p,check.checked)});
  const avatar=node('span','ac-avatar');
  avatar.textContent=(p.full_name||p.email||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
  const who=node('div','ac-member-name');
  who.append(node('strong','',p.full_name||p.email),node('small','',p.email||p.uid||''));
  identity.append(check,avatar,who);
  const access=node('div','ac-access-text');access.dataset.state=state(p);
  access.append(node('i','ac-status-dot'),node('span','',
   isMember(p)?'Added':state(p)==='revoked'?'Removed':tx()?'Not enrolled':'Inherited'));
  const work=node('div','ac-member-work-column');
  const badge=node('span','ac-role',labelRole(currentLevel(p)));
  badge.dataset.role=currentLevel(p);
  const count=num(today(p)?.assigned);
  work.append(node('div','ac-member-role'));
  work.firstChild.append(badge);
  work.append(node('div','ac-member-work',count+' / '+currentLimit(p)+' assigned today'));
  const open=node('button','ac-member-open','›');open.type='button';
  open.title='Manage '+(p.full_name||p.email);open.setAttribute('aria-label',open.title);
  open.addEventListener('click',()=>{
   picked.clear();picked.add(String(p.id));
   formOwner='';populateForm();renderRoster();renderActions();
   $('actionTitle').scrollIntoView({behavior:motion(),block:'nearest'});
  });
  row.append(identity,access,work,open);fragment.append(row);
 }
 list.append(fragment);
}
function toggle(p,checked){
 if(checked)picked.add(String(p.id));else picked.delete(String(p.id));
 formOwner='';populateForm();renderRoster();renderActions();
}
function populateForm(){
 const chosen=selection(),owner=chosen.length===1?String(project?.id)+':'+String(chosen[0].id):'bulk';
 if(owner===formOwner)return;
 formOwner=owner;
 if(chosen.length===1){
  const p=chosen[0];
  $('levelChoice').value=currentLevel(p)==='PAUSED'?'L1':currentLevel(p);
  $('membershipAction').value=state(p)==='revoked'?'revoked':'active';
  $('dailyTasks').value=String(currentLimit(p));
 }else{
  $('levelChoice').value='L1';
  $('membershipAction').value='active';
  $('dailyTasks').value='5';
 }
}
function showResult(message,error=false){
 const box=$('actionResult');
 box.hidden=false;box.dataset.error=error?'true':'false';
 box.dataset.warn='false';box.textContent=message;
}
function renderActions(){
 const chosen=selection(),count=chosen.length;
 const active=$('membershipAction').value==='active',limit=num($('dailyTasks').value);
 const level=$('levelChoice').value;
 $('actionCount').textContent=count+' '+(count===1?'person':'people');
 $('selectedPreview').textContent=count===1?
  (chosen[0].full_name||chosen[0].email)+' · '+(chosen[0].email||''):
  count?count+' contributors selected':'Select a contributor to manage their access.';
 $('levelChoice').disabled=!active||!project;
 $('dailyTasks').disabled=!active||!project;
 $('dailyMinus').disabled=!active||!project;
 $('dailyPlus').disabled=!active||!project;
 $('dailyField').classList.toggle('ac-simple-disabled',!active);
 $('levelHelp').textContent=level==='BOTH'?
  'Both levels share one daily limit. Existing tasks are preserved.':
  level==='L2'?'Reviewer only. Stops new L1 tasks; existing L1 work stays assigned.':
  'Contributor level. Existing assigned review work is preserved.';
 $('accessHelp').textContent=active?'Add this person to the selected project.':'Remove project access. Existing task history is not deleted.';
 $('dailyHelp').textContent='Maximum new tasks each day, shared across levels. Resets 00:00 UTC (5:30 AM IST).';
 const todaySum=chosen.reduce((sum,p)=>sum+num(today(p)?.assigned),0);
 $('dailySummary').textContent=!count?'Select a contributor to see their daily usage.':
  !active?'Removed contributors cannot receive new tasks.':
  count===1?todaySum+' task'+(todaySum===1?'':'s')+' assigned today · Limit: '+limit+'/day':
  count+' contributors selected · '+todaySum+' tasks assigned today across them';
 $('actionNote').textContent=!active?
  'Access is removed immediately. Assigned work is kept but cannot be opened until access is restored.':
  project?.project_type==='transcription'?
  'Tasks will be offered when eligible audio is available. L1 users can claim more as they work; L2 requires submitted audio to review.':
  'Daily limits are enforced per project. New tasks require available project inventory.';
 let issue='';
 if(!project)issue='Select a project.';
 else if(count<1)issue='Select one or more contributors.';
 else if(count>200)issue='Select no more than 200 contributors.';
 else if(loading||busy)issue='Updating…';
 else if(active&&project.lifecycle_status!=='active')issue='This project is paused. You can remove access, but cannot add new members.';
 else if(active&&chosen.some(p=>p.account_status!=='active'))issue='An inactive account cannot receive new project access.';
 else if(active&&(!Number.isInteger(Number($('dailyTasks').value))||limit<1||limit>100))
  issue='Enter a whole number from 1 to 100 for tasks per day.';
 $('applyChanges').disabled=Boolean(issue);
 $('applyChanges').textContent=busy?'Saving…':active?'Save access & daily limit':'Remove from project';
 $('applyChanges').title=issue;
}
async function apply(){
 if(busy||loading||$('applyChanges').disabled||!project)return;
 const payload={
  p_project_id:Number(project.id),
  p_user_ids:selection().map(p=>p.id),
  p_membership:$('membershipAction').value,
  p_level:$('levelChoice').value,
  p_tasks_per_day:num($('dailyTasks').value)
 };
 const savedPeople=[...picked],projectId=Number(project.id);
 busy=true;renderActions();$('actionResult').hidden=true;
 try{
  const response=await rpc('admin_assignment_center_simple_apply',payload);
  const created=num(response?.created_tasks),count=num(response?.updated);
  const added=payload.p_membership==='active';
  const prefix=added?'Added / updated '+count+' contributor'+(count===1?'':'s')+
    ' · '+labelRole(payload.p_level)+' · '+payload.p_tasks_per_day+' tasks/day.':
    'Removed '+count+' contributor'+(count===1?'':'s')+' from the project.';
  const message=!added?prefix:prefix+' '+(created?created+' task'+(created===1?'':'s')+' assigned now.':
   'No new tasks assigned now; available work can be claimed or assigned when ready.');
  await reload(true);
  if(num(project?.id)===projectId){
   picked.clear();for(const id of savedPeople)if(model.people.some(p=>String(p.id)===id))picked.add(id);
   formOwner='';populateForm();renderRoster();renderActions();
  }
  showResult(message);
 }catch(e){showResult('No changes saved: '+e.message,true)}
 finally{busy=false;renderActions()}
}
async function reload(preserve=false){
 if(loading)return;
 loading=true;const sequence=++serial;
 status('Refreshing…','busy');
 try{
  const data=await rpc('admin_assignment_center_simple_snapshot',{});
  if(sequence!==serial)return;
  for(const key of Object.keys(model))model[key]=Array.isArray(data?.[key])?data[key]:[];
  stats();
  const param=new URLSearchParams(location.search);
  const id=preserve?num(project?.id):num(param.get('project'));
  const next=model.projects.find(p=>num(p.id)===id)||
   model.projects.find(p=>p.lifecycle_status==='active')||model.projects[0]||null;
  if(num(next?.id)!==num(project?.id)){picked.clear();formOwner=''}
  project=next;
  projectSummary();renderProjects();renderRoster();renderActions();
 }catch(e){status('Sync failed','error');showResult('Could not refresh assignments: '+e.message,true)}
 finally{loading=false;renderActions()}
}
async function start(){
 try{
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user){location.replace('/auth');return}
  const permission=await rpc('get_my_admin_access',{});
  if(!permission?.allowed||(!permission.is_super_admin&&!permission.capabilities?.includes('assignments'))){
   location.replace('/admin');return;
  }
  await reload();
  const param=new URLSearchParams(location.search),id=param.get('user');
  if(id){
   const p=model.people.find(p=>String(p.id)===id||norm(p.email)===norm(id)||norm(p.uid)===norm(id));
   if(p){picked.add(String(p.id));formOwner='';populateForm();renderRoster();renderActions()}
  }
  started=true;
 }catch(e){status('Connection error','error');showResult(e.message,true)}
}
$('projectSearch').addEventListener('input',renderProjects);
$('peopleSearch').addEventListener('input',renderRoster);
$('peopleFilter').addEventListener('change',renderRoster);
$('activeOnly').addEventListener('change',renderRoster);
$('selectVisible').addEventListener('change',()=>{
 const rows=matchesPeople();
 if($('selectVisible').checked)rows.forEach(p=>picked.add(String(p.id)));
 else rows.forEach(p=>picked.delete(String(p.id)));
 formOwner='';populateForm();renderRoster();renderActions();
});
$('clearSelection').addEventListener('click',()=>{
 picked.clear();formOwner='';populateForm();renderRoster();renderActions()
});
$('levelChoice').addEventListener('change',renderActions);
$('membershipAction').addEventListener('change',renderActions);
$('dailyTasks').addEventListener('input',renderActions);
$('dailyMinus').addEventListener('click',()=>{
 $('dailyTasks').value=String(Math.max(1,num($('dailyTasks').value)-1));renderActions()
});
$('dailyPlus').addEventListener('click',()=>{
 $('dailyTasks').value=String(Math.min(100,num($('dailyTasks').value)+1));renderActions()
});
$('refreshAll').addEventListener('click',()=>{if(!busy&&!loading)void reload(true)});
$('applyChanges').addEventListener('click',()=>{
 if(busy||$('applyChanges').disabled)return;
 if($('membershipAction').value==='revoked'){
  const count=picked.size;
  $('confirmText').textContent='Remove '+count+' contributor'+(count===1?'':'s')+' from '+project.project_name+'? Existing task records will be preserved.';
  $('confirmRevoke').showModal();
 }else void apply();
});
$('revokeCancel').addEventListener('click',()=>$('confirmRevoke').close());
$('revokeConfirm').addEventListener('click',()=>{$('confirmRevoke').close();void apply()});
document.addEventListener('visibilitychange',()=>{if(started&&!document.hidden&&!busy&&!loading)void reload(true)});
setInterval(()=>{if(started&&!document.hidden&&!busy&&!loading)void reload(true)},90000);
start();
})();
