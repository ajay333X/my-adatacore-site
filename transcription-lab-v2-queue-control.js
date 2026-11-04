(()=>{
'use strict';
// Project-scoped Queue Control. Read and mutation authorization is enforced
// by the database; this panel does not update task tables from the browser.
const $=id=>document.getElementById(id);
if(!document.body.classList.contains('tx-v2')||!$('txqRows')||!window.supabase)return;
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
const els={
 rows:$('txqRows'),search:$('txqSearch'),filter:$('txqFilter'),
 target:$('txqTarget'),assignee:$('txqAssignee'),apply:$('txqApply'),
 impact:$('txqImpact'),notice:$('txqNotice'),dialog:$('txqConfirmDialog')
};
let projectId=null,board=null,selectedId=null,loading=false,busy=false,sequence=0,pendingAction=null;
const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=String(text);return el};
const number=v=>Number(v)||0,normal=v=>String(v||'').toLocaleLowerCase();
const rpc=async(name,args)=>{const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data};
const selected=()=>board?.items?.find(x=>String(x.id)===selectedId)||null;
function stage(row){
 if(row.queue_state!=='queued')return 'blocked';
 if(['approved','reviewed'].includes(row.status))return 'done';
 if(row.status==='in_review'&&row.review_status==='pending')return 'l2_assigned';
 if(['submitted','in_review'].includes(row.status)&&(!row.review_status||row.review_status==='cancelled'))return 'l2_waiting';
 if(row.status==='unassigned'&&(!row.task_status||row.task_status==='cancelled'))return 'l1_ready';
 if(['assigned','in_progress','changes_requested'].includes(row.status)&&row.task_status==='pending')return 'l1_assigned';
 return 'blocked';
}
const statusLabel={
 l1_ready:'L1 · Ready',l1_assigned:'L1 · Assigned',
 l2_waiting:'L2 · Waiting',l2_assigned:'L2 · Reviewing',
 done:'Approved',blocked:'Requires attention'
};
const statusDescription={
 l1_ready:'Ready for a contributor to transcribe.',
 l1_assigned:'An L1 contributor has this task, or has corrections to complete.',
 l2_waiting:'L1 has submitted a transcript. Assign an eligible L2 reviewer, or leave it available in the L2 queue.',
 l2_assigned:'An L2 reviewer already has the task. Active reviews cannot be taken away here.',
 done:'Final reviewed work is protected. Reopening requires a separate audited workflow.',
 blocked:'This task has an exceptional state. Check the main Live Queue or task history.'
};
function show(message,error=false){
 els.notice.textContent=message||'';
 els.notice.dataset.error=error?'true':'false';
}
function totals(){
 const s=board?.summary||{};
 const figures=[
  ['txqL1Ready',s.l1_ready],['txqL1Assigned',s.l1_assigned],
  ['txqL2Waiting',s.l2_waiting],['txqL2Assigned',s.l2_assigned],
  ['txqApproved',s.approved],['txqOther',number(s.other)+number(s.vaulted)]
 ];
 for(const [id,value] of figures)$(id).textContent=value===undefined?'—':String(number(value));
 $('txqTabBadge').textContent=String(number(s.l2_waiting));
}
function renderList(){
 els.rows.replaceChildren();
 if(!board){els.rows.append(node('p','txq-empty',loading?'Loading live project tasks…':'Select a project to inspect task queues.'));$('txqCount').textContent='No project selected';return}
 const q=normal(els.search.value).trim(),filter=els.filter.value;
 const list=board.items.filter(a=>(filter==='all'||stage(a)===filter)&&
  (!q||normal([a.name,a.id,a.assignee,a.reviewer,a.status].join(' ')).includes(q)));
 $('txqCount').textContent=list.length+' shown · '+board.items.length+' in live queue';
 if(!list.length){els.rows.append(node('p','txq-empty','No audio items match this filter.'));return}
 const fragment=document.createDocumentFragment();
 for(const a of list){
  const kind=stage(a),active=String(a.id)===selectedId;
  const btn=node('button','txq-row');btn.type='button';btn.dataset.stage=kind;btn.dataset.selected=String(active);
  btn.setAttribute('role','option');btn.setAttribute('aria-selected',String(active));
  btn.setAttribute('aria-label',(a.name||'Audio')+', '+statusLabel[kind]+', select for queue operations');
  const body=node('span','txq-row-main');
  body.append(node('strong','',a.name||'Audio '+String(a.id).slice(0,8)),
    node('small','',a.assignee?'L1: '+a.assignee:(kind==='l1_ready'?'No contributor assigned':'L1 not assigned')));
  const more=node('span','txq-row-meta');
  const kindText=node('span','txq-stage',statusLabel[kind]);kindText.dataset.stage=kind;
  more.append(kindText,node('small','',
   a.reviewer?'L2: '+a.reviewer:(kind==='l2_waiting'?'Awaiting reviewer':'Updated '+new Date(a.updated_at).toLocaleDateString())));
  btn.append(body,more,node('span','txq-row-chevron','›'));
  btn.addEventListener('click',()=>{
   selectedId=String(a.id);
   els.target.value=kind==='l2_waiting'||kind==='l2_assigned'||kind==='done'?'L2':'L1';
   renderList();renderSelection();
  });
  fragment.append(btn);
 }
 els.rows.append(fragment);
}
function fillAssignees(){
 const target=els.target.value,current=els.assignee.value;
 els.assignee.replaceChildren();
 const empty=node('option','','No one — queue only');empty.value='';els.assignee.append(empty);
 const members=(board?.members||[]).filter(m=>target==='L1'?m.l1===true:m.l2===true);
 for(const person of members){
  const option=node('option','',(person.name||person.email||'Contributor')+' · '+person.email);
  option.value=String(person.id);els.assignee.append(option);
 }
 if(members.some(m=>String(m.id)===current))els.assignee.value=current;
 else els.assignee.value='';
 if(!members.length&&board){
  const unavailable=node('option','',target==='L1'?'No active L1 contributors — grant access first':'No active L2 reviewers — grant access first');
  unavailable.value='';unavailable.disabled=true;els.assignee.append(unavailable);
 }
}
function renderSelection(){
 const a=selected(),target=els.target.value;
 fillAssignees();
 const stageName=a?stage(a):null;
 $('txqSelectedName').textContent=a?a.name||'Audio '+String(a.id).slice(0,8):'Choose an audio task';
 $('txqSelectedDetail').textContent=a?
  (statusLabel[stageName]+' · '+number(a.submitted_segments)+' submitted segments · '+number(a.draft_segments)+' live segments') :
  'Pick a row from the project queue to manage it.';
 if(!a){els.impact.textContent='Select a task first. The server checks every transition before saving it.';els.apply.disabled=true;return}
 let restriction='';
 const allowed=target==='L1'?a.route_l1:a.route_l2;
 if(!allowed){
  if(stageName==='l2_assigned')restriction='An L2 reviewer is already assigned. This tool will not take away an active review.';
  else if(stageName==='done')restriction='Approved work is locked to protect the original review and payment history.';
  else if(target==='L2'&&number(a.submitted_segments)===0)restriction='L2 needs an actual submitted L1 transcript. Complete L1 first.';
  else if(target==='L1')restriction='Cannot requeue active or saved L1 work. The contributor must finish or an administrator must resolve it through the original task workflow.';
  else restriction='This item is not eligible for this queue. Its active task and saved work are protected.';
 }else if(els.assignee.value){
  const person=board?.members?.find(m=>String(m.id)===els.assignee.value);
  if(!person)restriction='Selected contributor no longer has project access.';
  else if(target==='L2'&&normal(a.assignee)===normal(person.email))restriction='Reviewers cannot review their own L1 submissions. Select another reviewer.';
 }
 if(!restriction&&allowed&&!els.assignee.value&&
    ((stageName==='l1_ready'&&target==='L1')||(stageName==='l2_waiting'&&target==='L2'&&a.review_status!=='cancelled'))){
  restriction='This task is already waiting in the selected queue. Choose a contributor to assign it directly.';
 }
 els.impact.textContent=restriction||
  (els.assignee.value?
   'Direct assignment: the selected person receives one '+target+' task. Their project permissions and daily limit will be checked.':
   'Queue only: prepare the task for the selected level without assigning it to a person.');
 els.apply.disabled=Boolean(restriction||!board?.can_assign||busy||loading);
 if(!board?.can_assign)els.impact.textContent='You can inspect queues, but you need project assignment permission to change them.';
 els.apply.textContent=busy?'Applying…':els.assignee.value?'Assign '+target+' task':'Move to '+target+' queue';
}
async function reload(){
 if(!projectId)return;
 const requested=projectId,call=++sequence;loading=true;
 els.notice.dataset.error='false';
 try{
  const incoming=await rpc('tx_admin_queue_board',{p_project_id:requested});
  if(call!==sequence||requested!==projectId)return;
  board=incoming;
  if(selectedId&&!selected())selectedId=null;
  totals();renderList();renderSelection();
  show('Updated from the project database. L1 and L2 counts are separate from each reviewer’s personal eligibility.');
 }catch(e){
  if(call!==sequence)return;
  board=null;selectedId=null;totals();renderList();renderSelection();
  show('Queue data could not be loaded: '+e.message,true);
 }finally{if(call===sequence){loading=false;renderSelection()}}
}
function closeConfirm(){
 if(!busy&&$('txqConfirmDialog').open)$('txqConfirmDialog').close();
}
async function confirmRoute(){
 const action=pendingAction;if(!action||busy)return;
 busy=true;els.apply.disabled=true;$('txqConfirm').disabled=true;
 show('Checking project permissions and routing task…');
 try{
  const result=await rpc('tx_admin_queue_route',action);
  pendingAction=null;
  $('txqConfirmDialog').close();
  await reload();
  show(result.message||('Task moved to '+action.p_target+' successfully.'));
  // Refresh the existing Live Queue table, counters and QA panel.
  $('queueRefresh')?.click();
 }catch(e){show('No task moved: '+e.message,true)}
 finally{busy=false;$('txqConfirm').disabled=false;renderSelection()}
}
els.apply.addEventListener('click',()=>{
 const a=selected();
 if(!a||els.apply.disabled||busy)return;
 const target=els.target.value,person=board?.members?.find(m=>String(m.id)===els.assignee.value);
 pendingAction={p_item:a.id,p_target:target,p_assignee:person?.id||null};
 let words='Prepare this audio for '+target+' with no reviewer/contributor assigned.';
 if(person)words='Assign this '+target+' task directly to '+(person.name||person.email)+'. Daily limits and self-review rules still apply.';
 if(target==='L1'&&a.status==='assigned')words+=' This also cancels an existing untouched, unstarted L1 assignment.';
 $('txqConfirmText').textContent=words+' No transcript edits or review history will be deleted.';
 $('txqConfirmDialog').showModal();
});
$('txqConfirm').addEventListener('click',()=>void confirmRoute());
$('txqCancel').addEventListener('click',closeConfirm);
$('txqCancelTop').addEventListener('click',closeConfirm);
els.search.addEventListener('input',renderList);
els.filter.addEventListener('change',renderList);
els.target.addEventListener('change',()=>{els.assignee.value='';renderSelection()});
els.assignee.addEventListener('change',renderSelection);
$('txqRefresh').addEventListener('click',()=>{if(!busy)void reload()});
$('txqOpenPeople').addEventListener('click',()=>document.querySelector('[data-tx-tab="people"]')?.click());
document.addEventListener('txv2:data',event=>{
 const id=Number(event.detail?.projectId)||null;
 if(!id)return;
 if(id!==projectId){projectId=id;board=null;selectedId=null;els.search.value='';els.filter.value='all';els.target.value='L1';els.assignee.value='';}
 void reload();
});
document.querySelector('[data-tx-tab="queues"]')?.addEventListener('click',()=>{if(projectId&&!busy)void reload()});
const initial=Number(new URLSearchParams(location.search).get('project'));
if(Number.isInteger(initial)&&initial>0){projectId=initial;void reload()}
})();
