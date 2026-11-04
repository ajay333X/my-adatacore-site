(()=>{
'use strict';
/* Adatacore Unified Assignment Center
 * The read model comes from authorized database RPCs, not cached role labels.
 * Access, reviewer permissions, and assignments are applied atomically by the
 * backend; no direct client-side updates to privileged tables or task records.
 */
const $=id=>document.getElementById(id);
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
const model={projects:[],people:[],access:[],review_levels:[],synced_at:null};
const selected=new Set();
const previews={L1:new Map(),L2:new Map()};
let project=null,busy=false,loading=false,refreshSerial=0,previewSerial=0,initialized=false,lastLimitOwner='';
const create=(tag,cls,text)=>{
 const el=document.createElement(tag);if(cls)el.className=cls;
 if(text!==undefined)el.textContent=String(text);return el;
};
const n=value=>Number(value)||0;
const normalize=x=>String(x||'').toLocaleLowerCase();
const tx=()=>project?.project_type==='transcription';
const activePeople=()=>model.people.filter(p=>p.account_status==='active');
const member=(p)=>model.access.find(a=>Number(a.project_id)===Number(project?.id)&&String(a.user_id)===String(p.id));
const role=(p)=>model.review_levels.find(r=>Number(r.project_id)===Number(project?.id)&&String(r.user_id)===String(p.id));
const status=(p)=>member(p)?.status||'inherited';
const roleName=(p)=>role(p)?.level||'L1';
const activeProject=()=>Boolean(project&&project.lifecycle_status==='active');
const allSelected=()=>[...selected].map(id=>model.people.find(p=>String(p.id)===String(id))).filter(Boolean);
const rpc=async(name,args)=>{
 const {data,error}=await db.rpc(name,args);
 if(error)throw new Error(error.message);
 return data;
};
function syncing(label,state){
 const el=$('syncStatus');el.dataset.state=state||'busy';
 el.lastChild.textContent=' '+label;
}
function summary(){
 $('statProjects').textContent=model.projects.length;
 $('statPeople').textContent=model.people.length;
 $('statGrants').textContent=model.access.filter(a=>a.status==='active').length;
 $('statRevoked').textContent=model.access.filter(a=>a.status==='revoked').length;
 $('projectCount').textContent=model.projects.length+' projects';
 const at=model.synced_at?new Date(model.synced_at):null;
 syncing(at&&!Number.isNaN(at.valueOf())?'Synced '+at.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Synced','ready');
}
function renderProjects(){
 const list=$('projectList');
 list.replaceChildren();
 const q=normalize($('projectSearch').value).trim();
 const matches=model.projects.filter(p=>!q||normalize(p.project_name+' '+(p.project_type||'')+' '+p.id).includes(q));
 if(!matches.length){list.append(create('div','ac-skeleton','No matching projects.'));return}
 for(const p of matches){
  const row=create('button','ac-project-item');row.type='button';row.setAttribute('role','option');
  row.setAttribute('aria-selected',String(Number(project?.id)===Number(p.id)));
  row.dataset.projectId=String(p.id);
  const icon=create('span','ac-project-glyph',p.project_type==='transcription'?'≋':p.project_type==='voice_recording'?'◖':'▦');
  icon.dataset.type=p.project_type||'general';
  const info=create('span','ac-project-info'),name=create('strong','',p.project_name);
  const infoLine=create('small','',(p.project_type||'General').replace('_',' ')+' · '+p.lifecycle_status);
  info.append(name,infoLine);
  const suffix=create('span','ac-project-num','#'+p.id);
  row.append(icon,info,suffix);
  row.addEventListener('click',()=>chooseProject(p));
  list.append(row);
 }
}
function chooseProject(next){
 if(busy)return;
 project=next;
 selected.clear();
 $('peopleSearch').value='';
 $('peopleFilter').value='all';
 $('accessAction').value='keep';
 $('reviewLevel').value='KEEP';
 $('taskLayer').value='';
 $('taskTarget').value='1';
 $('actionResult').hidden=true;
 $('projectContext').textContent=next.project_name+' · '+(next.project_type||'General project').replace('_',' ');
 const cap1=tx()?n(next.tx_l1_ready):n(next.l1_available);
 const cap2=tx()?n(next.tx_l2_ready):n(next.l2_available);
 $('queueStats').textContent=(activeProject()?'':'Archived · ')+cap1+' L1 ready · '+cap2+' L2 ready';
 const url=new URL(location.href);url.searchParams.set('project',String(next.id));
 history.replaceState(null,'',url.pathname+url.search);
 renderProjects();renderRoster();renderActions();void refreshPreviews();
}
function filteredPeople(){
 const q=normalize($('peopleSearch').value).trim(),scope=$('peopleFilter').value;
 return model.people.filter(p=>{
  if($('activeOnly').checked&&p.account_status!=='active')return false;
  if(scope==='selected'&&!selected.has(String(p.id)))return false;
  if(scope==='active'&&status(p)!=='active')return false;
  if(scope==='revoked'&&status(p)!=='revoked')return false;
  if(scope==='inherited'&&status(p)!=='inherited')return false;
  return !q||normalize([p.full_name,p.email,p.uid,p.id,roleName(p)].join(' ')).includes(q);
 });
}
function accessLabel(p){
 const state=status(p);
 if(state==='active')return 'Granted';
 if(state==='revoked')return 'Revoked';
 return tx()?'Not enrolled':'Inherited';
}
function makeRole(p){
 const container=create('div','ac-member-work-column');
 const accessRole=create('div','ac-member-role');
 const stage=tx()?roleName(p):'Project member';
 const badge=create('span','ac-role',stage==='BOTH'?'L1 + L2':stage);
 badge.dataset.role=tx()?stage:'GENERAL';accessRole.append(badge);
 const l1=previews.L1.get(String(p.id)),l2=previews.L2.get(String(p.id));
 const work=tx()?(
  l1||l2?('L1 '+n(l1?.open_work)+' · L2 '+n(l2?.open_work)):('L1 / L2 workload pending')
 ):(
  l1||l2?('L1 '+n(l1?.open_work)+' · L2 '+n(l2?.open_work)):'Workload pending'
 );
 container.append(accessRole,create('div','ac-member-work',work));
 return container;
}
function renderRoster(){
 const list=$('peopleList');list.replaceChildren();
 if(!project){list.append(create('div','ac-skeleton','Choose a project on the left.'));return}
 const rows=filteredPeople();
 $('visibleCount').textContent=rows.length+' contributors';
 $('selectedInfo').textContent=selected.size+' selected';
 $('rosterDetail').textContent=rows.length+' shown · '+model.people.length+' in directory';
 $('selectVisible').checked=rows.length>0&&rows.every(p=>selected.has(String(p.id)));
 $('selectVisible').indeterminate=rows.some(p=>selected.has(String(p.id)))&&!$('selectVisible').checked;
 if(!rows.length){list.append(create('div','ac-skeleton','No contributors match these filters.'));return}
 const fragment=document.createDocumentFragment();
 for(const p of rows){
  const checked=selected.has(String(p.id));
  const row=create('div','ac-member');
  row.dataset.selected=String(checked);row.dataset.inactive=String(p.account_status!=='active');
  const identity=create('div','ac-person-identity');
  const check=create('input','ac-person-check');check.type='checkbox';check.checked=checked;
  check.setAttribute('aria-label','Select '+(p.full_name||p.email));
  check.addEventListener('change',()=>togglePerson(p,check.checked));
  const avatar=create('span','ac-avatar');
  const label=(p.full_name||p.email||'?').trim();
  avatar.textContent=label.split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
  const personInfo=create('div','ac-member-name');
  personInfo.append(create('strong','',p.full_name||p.email),create('small','',p.email||p.uid||''));
  identity.append(check,avatar,personInfo);
  const access=create('div','ac-access-text');access.dataset.state=status(p);
  access.append(create('i','ac-status-dot'),create('span','',accessLabel(p)));
  const work=makeRole(p);
  const open=create('button','ac-member-open','›');open.type='button';
  open.title='Manage '+(p.full_name||p.email);open.setAttribute('aria-label',open.title);
  open.addEventListener('click',()=>{selected.clear();selected.add(String(p.id));renderRoster();renderActions();
   $('actionTitle').scrollIntoView({behavior:motion(),block:'nearest'})});
  row.append(identity,access,work,open);fragment.append(row);
 }
 list.append(fragment);
}
function togglePerson(p,checked){
 if(checked)selected.add(String(p.id));else selected.delete(String(p.id));
 renderRoster();renderActions();
}
function motion(){return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}
async function refreshPreviews(){
 const serial=++previewSerial,forProject=project;
 previews.L1.clear();previews.L2.clear();
 renderRoster();renderActions();
 if(!forProject)return;
 const keys=activePeople().map(p=>p.email).filter(Boolean);
 if(!keys.length)return;
 const results=await Promise.allSettled(['L1','L2'].map(layer=>rpc('admin_assignment_center_preview',{
   p_project_id:Number(forProject.id),p_layer:layer,p_user_keys:keys
 })));
 if(serial!==previewSerial||project!==forProject)return;
 for(const [i,layer] of ['L1','L2'].entries()){
  if(results[i].status!=='fulfilled')continue;
  for(const row of results[i].value||[])if(row.found)previews[layer].set(String(row.user_id),row);
 }
 renderRoster();renderActions();
}
function renderActions(){
 const chosen=allSelected(),quantity=chosen.length,stage=$('taskLayer').value,access=$('accessAction').value;
 const singleOwner=quantity===1?(String(project?.id)+':'+String(chosen[0].id)):'';
 if(singleOwner!==lastLimitOwner){
  $('reviewLimit').value=String(singleOwner?(n(role(chosen[0])?.l2_limit)||10):10);
  lastLimitOwner=singleOwner;
 }
 const level=$('reviewLevel').value;
 const transcription=tx(),isRevoke=access==='revoked';
 $('actionCount').textContent=quantity+' '+(quantity===1?'person':'people');
 $('selectedPreview').textContent=quantity?
  (quantity===1?((chosen[0].full_name||chosen[0].email)+' · '+chosen[0].email):quantity+' contributors selected')+
  ' · '+(project?.project_name||'No project'):
  'Select one or more contributors from this project’s directory.';
 $('reviewField').hidden=!transcription;
 if(!transcription){$('reviewLevel').value='KEEP';}
 $('reviewLimitField').hidden=!transcription||!['L2','BOTH'].includes($('reviewLevel').value);
 $('targetField').hidden=!stage;
 $('capacityField').hidden=!stage||transcription;
 $('accessHelp').textContent=transcription?
  'Transcription tasks require an explicit project grant. “Not enrolled” does not include a claim allowance.':
  '“Inherited” is the legacy default: an active account may already have access without an explicit grant.';
 $('reviewHelp').textContent=level==='L2'?
  'L2 only prevents new L1 transcription claims. Existing assigned L1 work remains visible until completed.':
  level==='BOTH'?'Both levels allow new L1 and L2 work. Reviewers cannot review their own transcripts.':
  'Changing roles affects NEW tasks. Existing tasks, scripts, and history are preserved.';
 if(isRevoke){
  $('taskLayer').value='';$('reviewLevel').value='KEEP';
  $('targetField').hidden=true;$('reviewLimitField').hidden=true;$('capacityField').hidden=true;
 }
 const actionStage=$('taskLayer').value,actionLevel=$('reviewLevel').value;
 let problem='',warnings=[];
 if(!project)problem='Choose a project.';
 else if(!quantity)problem='Select at least one contributor.';
 else if(busy||loading)problem='Live data is updating.';
 else if(quantity>200)problem='Select no more than 200 contributors at once.';
 else if(!chosen.every(p=>p.account_status==='active')&&(access!=='revoked'||actionStage||actionLevel!=='KEEP'))
  problem='Inactive or unverified accounts cannot receive new access or tasks.';
 else if(actionStage&&!activeProject())problem='This project is not active. New assignments are disabled.';
 else if(access==='keep'&&actionLevel==='KEEP'&&!actionStage)
  problem='Choose a change to apply: grant/revoke access, set a review level, or assign tasks.';
 else if(transcription&&['L2','BOTH'].includes(actionLevel)&&
  (!Number.isInteger(Number($('reviewLimit').value))||n($('reviewLimit').value)<1||n($('reviewLimit').value)>100)){
  problem='The L2 active task limit must be a whole number between 1 and 100.';
 }
 else if(actionStage){
  const target=n($('taskTarget').value);
  if(!Number.isInteger(target)||target<1||target>100)problem='Task target must be between 1 and 100.';
 }
 if(actionStage&&access==='keep'&&chosen.some(p=>status(p)!=='active')&&actionLevel==='KEEP'){
  problem='Select “Grant / restore access” before assigning tasks to contributors without an explicit project grant.';
 }
 if(transcription&&actionStage==='L2'&&actionLevel==='KEEP'&&chosen.some(p=>!['L2','BOTH'].includes(roleName(p))))
  problem='Grant L2 or L1 + L2 reviewer permission before assigning transcription audits.';
 if(transcription&&actionStage==='L1'&&actionLevel==='KEEP'&&chosen.some(p=>['L2','PAUSED'].includes(roleName(p))))
  problem='L2-only or paused contributors need L1 or both-level permission before assigning L1 tasks.';
 if(transcription&&actionStage==='L2'&&['L1','PAUSED'].includes(actionLevel))
  problem='Choose L2 or L1 + L2 to assign review tasks.';
 if(transcription&&actionStage==='L1'&&['L2','PAUSED'].includes(actionLevel))
  problem='Choose L1 or L1 + L2 to assign transcription tasks.';
 if(transcription&&actionStage==='L2'&&['L2','BOTH'].includes(actionLevel)&&n($('reviewLimit').value)<n($('taskTarget').value))
  problem='The L2 active-task limit must be at least as high as the requested task target.';
 if(transcription&&actionStage==='L2'&&actionLevel==='KEEP'){
  const limited=chosen.find(p=>n(role(p)?.l2_limit||10)<n($('taskTarget').value));
  if(limited)problem='The reviewer’s existing L2 limit is lower than the requested target. Increase it by selecting L2 or L1 + L2.';
 }
 const capacity=project?(transcription?
  n(actionStage==='L1'?project.tx_l1_ready:project.tx_l2_ready):
  n(actionStage==='L1'?project.l1_available:project.l2_available)):0;
 if(actionStage&&capacity===0)warnings.push(transcription?
  'No eligible audio is queued for this level right now. Permissions can be saved, but zero new tasks may be assigned.':
  $('autoCapacity').checked?'Inventory can be added automatically for this non-transcription project.':
  'No task inventory is available; enable automatic capacity or add project inventory.');
 if(access==='revoked')warnings.push('Project access is revoked for contributors. Existing assignments remain recorded, and separate administrator permissions may still provide management access.');
 if(transcription&&actionLevel==='L2')warnings.push('Changing review level explicitly enrolls the person in the project. New L1 claims are blocked; previously assigned L1 tasks remain available to finish.');
 if(actionStage&&selected.size){
  const open=chosen.reduce((sum,p)=>sum+n(previews[actionStage].get(String(p.id))?.open_work),0);
  $('previewSummary').textContent='Currently open '+actionStage+' tasks for selected people: '+open+
    ' · Available to assign in project: '+capacity+'.';
 }else $('previewSummary').textContent='';
 $('impactText').textContent=problem||warnings.join(' ')||
  (actionStage?'Assign '+actionStage+' work up to the target per person. Existing work will not be removed.':
  actionLevel!=='KEEP'?'Update review permissions for this project.':
  access==='active'?'Explicitly grant project access to the selected contributors.':
  access==='revoked'?'Revoke project access without destroying existing work.':
  'Choose the changes you want to make.');
 $('applyChanges').disabled=Boolean(problem);
 $('applyChanges').textContent=busy?'Applying changes…':
  access==='revoked'?'Revoke project access':
  actionStage?('Apply access & '+actionStage+' assignments'):'Apply changes';
}
function selectionChanges(){
 renderActions();
}
function showResult(message,style){
 const box=$('actionResult');box.textContent=message;
 box.dataset.error=String(style==='error');box.dataset.warn=String(style==='warn');
 box.hidden=false;
}
function applyPayload(){
 return {
  p_project_id:Number(project.id),
  p_user_ids:allSelected().map(p=>p.id),
  p_access:$('accessAction').value,
  p_review_level:tx()?$('reviewLevel').value:'KEEP',
  p_l2_limit:n($('reviewLimit').value)||10,
  p_assign_layer:$('taskLayer').value||null,
  p_target_limit:$('taskLayer').value?n($('taskTarget').value):0,
  p_auto_capacity:!tx()&&$('autoCapacity').checked
 };
}
async function execute(){
 if(busy||$('applyChanges').disabled||!project)return;
 const payload=applyPayload(),projectBefore=project;
 busy=true;renderActions();$('actionResult').hidden=true;
 try{
  const data=await rpc('admin_assignment_center_v2_apply',payload);
  const rows=data?.results||[],created=n(data?.created_tasks);
  const assigned=Boolean(payload.p_assign_layer);
  const notes=rows.map(x=>String(x.note||'').trim()).filter(Boolean);
  const already=assigned&&rows.length&&rows.every(x=>n(x.assignment?.open_before)>=n(payload.p_target_limit));
  const accessText=payload.p_access==='active'?'Project access granted/restored. ':
   payload.p_access==='revoked'?'Project access revoked. ':'';
  const roleText=payload.p_review_level!=='KEEP'?'Review level '+payload.p_review_level+' saved. ':'';
  let statusText=accessText+roleText;
  let tone='success';
  if(assigned&&created>0)statusText+=created+' new '+payload.p_assign_layer+' task'+(created===1?'':'s')+' assigned. ';
  else if(assigned&&already)statusText+='Existing active work already meets the target. No extra tasks were created. ';
  else if(assigned){statusText+='Zero new tasks assigned. ';tone='warn'}
  if(notes.length){statusText+='Details: '+[...new Set(notes)].slice(0,4).join(' · ');if(!created&&assigned)tone='warn'}
  if(!statusText)statusText='Updated '+rows.length+' contributor'+(rows.length===1?'':'s')+'.';
  const preserved=[...selected];
  await reload(true);
  // Preserve selection for review or another operation, but only if the
  // contributor still exists in the refreshed directory.
  selected.clear();
  for(const id of preserved)if(model.people.some(p=>String(p.id)===id))selected.add(id);
  renderRoster();renderActions();
  showResult(statusText,tone);
 }catch(e){
  showResult('No changes were confirmed: '+e.message,'error');
 }finally{
  busy=false;renderActions();
  if(project!==projectBefore&&projectBefore)renderProjects();
 }
}
async function reload(preserveProject=false){
 if(loading)return;
 loading=true;const serial=++refreshSerial;
 syncing('Syncing live data…','busy');
 try{
  const fresh=await rpc('admin_assignment_center_v2_snapshot',{});
  if(serial!==refreshSerial)return;
  for(const key of ['projects','people','access','review_levels']){
   model[key]=Array.isArray(fresh?.[key])?fresh[key]:[];
  }
  model.synced_at=fresh.synced_at||null;
  summary();
  const previousId=preserveProject?project?.id:undefined;
  const params=new URLSearchParams(location.search);
  const target=Number(previousId||params.get('project')||0);
  const next=model.projects.find(p=>Number(p.id)===target)||
    model.projects.find(p=>p.lifecycle_status==='active')||model.projects[0]||null;
  if(next){
   const changed=Number(next.id)!==Number(project?.id);
   if(changed)lastLimitOwner='';
   project=next;
   if(changed)selected.clear();
   $('projectContext').textContent=next.project_name+' · '+(next.project_type||'General project').replace('_',' ');
   const cap1=tx()?n(next.tx_l1_ready):n(next.l1_available);
   const cap2=tx()?n(next.tx_l2_ready):n(next.l2_available);
   $('queueStats').textContent=(activeProject()?'':'Archived · ')+cap1+' L1 ready · '+cap2+' L2 ready';
   $('reviewField').hidden=!tx();
   const url=new URL(location.href);url.searchParams.set('project',String(next.id));
   history.replaceState(null,'',url.pathname+url.search);
  }else{
   project=null;$('projectContext').textContent='No manageable projects in your admin scope';
   $('queueStats').textContent='No project';
  }
  renderProjects();renderRoster();renderActions();void refreshPreviews();
 }catch(e){syncing('Sync failed','error');showResult('Unable to synchronize: '+e.message,'error')}
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
  const params=new URLSearchParams(location.search);
  const layer=params.get('layer');
  if(['L1','L2'].includes(layer))$('taskLayer').value=layer;
  const userId=params.get('user');
  if(userId){
   const p=model.people.find(p=>String(p.id)===userId||normalize(p.email)===normalize(userId)||normalize(p.uid)===normalize(userId));
   if(p)selected.add(String(p.id));
  }
  renderRoster();renderActions();
  initialized=true;
 }catch(e){syncing('Connection error','error');showResult(e.message,'error')}
}
$('projectSearch').addEventListener('input',renderProjects);
$('peopleSearch').addEventListener('input',renderRoster);
$('peopleFilter').addEventListener('change',renderRoster);
$('activeOnly').addEventListener('change',renderRoster);
$('selectVisible').addEventListener('change',()=>{
 const visible=filteredPeople();
 if($('selectVisible').checked)visible.forEach(p=>selected.add(String(p.id)));
 else visible.forEach(p=>selected.delete(String(p.id)));
 renderRoster();renderActions();
});
$('clearSelection').addEventListener('click',()=>{selected.clear();renderRoster();renderActions()});
$('accessAction').addEventListener('change',()=>{
 if($('accessAction').value==='revoked'){$('taskLayer').value='';$('reviewLevel').value='KEEP'}
 renderActions();
});
$('reviewLevel').addEventListener('change',renderActions);
$('reviewLimit').addEventListener('input',renderActions);
$('taskLayer').addEventListener('change',()=>{
 if($('taskLayer').value&&allSelected().some(p=>status(p)!=='active')&&$('accessAction').value==='keep')
   $('accessAction').value='active';
 renderActions();
});
$('taskTarget').addEventListener('input',renderActions);
$('autoCapacity').addEventListener('change',renderActions);
$('targetDown').addEventListener('click',()=>{
 $('taskTarget').value=String(Math.max(1,n($('taskTarget').value)-1));renderActions();
});
$('targetUp').addEventListener('click',()=>{
 $('taskTarget').value=String(Math.min(100,n($('taskTarget').value)+1));renderActions();
});
$('refreshAll').addEventListener('click',()=>{if(!busy&&!loading)void reload(true)});
$('applyChanges').addEventListener('click',()=>{
 if(busy||$('applyChanges').disabled)return;
 if($('accessAction').value==='revoked'){
  const people=allSelected();
  $('confirmText').textContent='Revoke '+project.project_name+' access for '+people.length+
    ' selected contributor'+(people.length===1?'':'s')+'? They will no longer be able to open or claim work in this project. Existing tasks and transcripts will remain recorded.';
  $('confirmRevoke').showModal();
 }else void execute();
});
$('revokeCancel').addEventListener('click',()=>$('confirmRevoke').close());
$('revokeConfirm').addEventListener('click',()=>{$('confirmRevoke').close();void execute()});
window.addEventListener('focus',()=>{if(initialized&&!busy&&!loading)void reload(true)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&initialized&&!busy&&!loading)void reload(true)});
setInterval(()=>{if(initialized&&!document.hidden&&!busy&&!loading)void reload(true)},90000);
start();
})();
