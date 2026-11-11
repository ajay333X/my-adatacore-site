(()=>{
'use strict';
// Task archival is authorized and executed only by database RPCs.
// Do not mutate tasks, submissions, or audio records from browser state.
const $=id=>document.getElementById(id),root=document.body;
if(!root.classList.contains('tx-v2')||!$('txArchiveTaskKey')||!window.supabase)return;
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
const el={key:$('txArchiveTaskKey'),inspect:$('txArchiveInspect'),preview:$('txArchivePreview'),
 reason:$('txArchiveReason'),submit:$('txArchiveSubmit'),msg:$('txArchiveMessage'),
 list:$('txArchiveList'),count:$('txArchiveCount'),refresh:$('txArchiveRefresh')};
let projectId=Number(new URLSearchParams(location.search).get('project'))||0;
let projectName='',inspected=null,inspecting=false,archiving=false,listing=false,listSequence=0;
const make=(tag,className,text)=>{
 const n=document.createElement(tag);
 if(className)n.className=className;
 if(text!==undefined)n.textContent=String(text);
 return n;
};
const normalize=x=>String(x||'').trim().replace(/^task\s*[#:-]?\s*/i,'').trim().toUpperCase();
const valid=x=>/^(?:[A-HJ-NP-Z][2-9]){7}$/.test(x)||/^\d{1,9}$/.test(x);
const formatDate=value=>{
 if(!value)return '—';
 const time=new Date(value);
 return Number.isFinite(time.valueOf())?time.toLocaleString():'—';
};
const active=()=>document.querySelector('[data-tx-tab="archives"]')?.classList.contains('active');
const show=(message,error=false)=>{
 el.msg.textContent=message||'';
 el.msg.className='txarchive-message '+(error?'error':message?'success':'');
};
async function rpc(name,args){
 const {data,error}=await db.rpc(name,args);
 if(error)throw Error(error.message||'Unable to complete the request.');
 return data;
}
function projectMatches(t){
 if(!t)return false;
 if(!projectId)return false;
 if(!projectName)return true;
 return String(t.project||'').trim().toLowerCase()===projectName.trim().toLowerCase();
}
function archiveButton(){
 const t=inspected?.task;
 el.submit.disabled=archiving||inspecting||!t||!projectMatches(t)||t.status==='archived';
}
function field(label,value){
 const outer=make('div','txarchive-preview-field');
 outer.append(make('span','',label),make('strong','',value==null?'—':value));
 return outer;
}
function renderPreview(){
 el.preview.replaceChildren();
 const t=inspected?.task;
 if(!t){
  el.preview.append(make('p','txarchive-placeholder','Enter a Task ID to see its status, project, and submission history.'));
  archiveButton();return;
 }
 const head=make('div','txarchive-preview-head');
 head.append(make('strong','txarchive-task-id',t.public_task_id||String(t.id||'—')));
 head.append(make('span','txarchive-badge'+(t.status==='archived'?' archived':''),(t.status||'unknown').replaceAll('_',' ')));
 el.preview.append(head);
 const grid=make('div','txarchive-preview-grid');
 grid.append(field('Project',t.project||'—'),field('Level',t.layer||'—'),
  field('Assignment',t.assigned_to||'—'),
  field('L1 submission',inspected?.submission?.id?'#'+inspected.submission.id:'Not on this task'),
  field('Current status',t.status||'—'),field('Archive date',formatDate(t.archived_at)));
 el.preview.append(grid);
 if(!projectMatches(t)){
  el.preview.append(make('div','txarchive-warning',
   'This task belongs to '+(t.project||'another project')+'. Switch to that project in Transcription Lab before archiving.'));
 }else if(t.status==='archived'){
  el.preview.append(make('div','txarchive-warning',
   'Already archived. Original status: '+(t.archive_previous_status||'—')+'. Reason: '+(t.archive_reason||'Not recorded')));
 }else{
  el.preview.append(make('div','txarchive-warning',
   'Archiving will remove this task and linked transcription audio from active queues. Saved transcripts, review history, and payments are not deleted.'));
 }
 archiveButton();
}
async function inspectTask(key){
 const taskKey=normalize(key);
 if(!valid(taskKey)){show('Please enter a valid alphanumeric or numeric Task ID.',true);return}
 if(inspecting||archiving)return;
 inspecting=true;inspected=null;archiveButton();
 el.inspect.disabled=true;el.inspect.textContent='Checking…';
 el.preview.replaceChildren(make('p','txarchive-placeholder','Checking task and submission history…'));
 try{
  const info=await rpc('admin_get_task_snapshot_by_key',{p_task_key:taskKey});
  if(!info?.task)throw Error('No task found with ID '+taskKey+'.');
  inspected=info;
  el.key.value=info.task.public_task_id||taskKey;
  renderPreview();show('Task verified. Review its details before archiving.');
 }catch(error){
  el.preview.replaceChildren(make('p','txarchive-placeholder',error.message));
  show('Could not inspect task: '+error.message,true);
 }finally{
  inspecting=false;el.inspect.disabled=false;el.inspect.textContent='Inspect task';archiveButton();
 }
}
function renderArchiveList(records){
 el.list.replaceChildren();
 const data=Array.isArray(records)?records:[];
 el.count.textContent=String(data.length);
 if(!data.length){
  el.list.append(make('p','txarchive-placeholder','No archived tasks for this project yet.'));
  return;
 }
 const frag=document.createDocumentFragment();
 for(const item of data){
  const row=make('article','txarchive-entry');
  const top=make('div','txarchive-entry-top');
  const title=make('strong','txarchive-entry-title',item.public_task_id||'#'+item.task_id);
  const badge=make('span','txarchive-badge archived',item.layer||'Task');
  top.append(title,badge);row.append(top);
  row.append(make('div','txarchive-entry-meta',
   'Archived '+formatDate(item.archived_at)+' · Previously '+(item.archive_previous_status||'—')+
   ' · '+(item.submission_count||0)+' submission'+(item.submission_count===1?'':'s')));
  if(item.audio_name)row.append(make('div','txarchive-entry-meta',item.audio_name));
  row.append(make('div','txarchive-entry-reason',item.archive_reason||'No reason recorded'));
  const inspect=make('button','txarchive-secondary','Inspect');
  inspect.type='button';inspect.style.cssText='min-height:27px;margin-top:10px;padding:5px 9px';
  inspect.addEventListener('click',()=>{
   el.key.value=item.public_task_id||String(item.task_id);
   void inspectTask(el.key.value);
   el.key.scrollIntoView({block:'nearest',behavior:'smooth'});
  });
  row.append(inspect);frag.append(row);
 }
 el.list.append(frag);
}
async function refreshList(){
 if(!projectId||listing)return;
 const request=++listSequence;
 listing=true;el.refresh.disabled=true;el.refresh.textContent='Refreshing…';
 try{
  const records=await rpc('admin_list_archived_tasks',{p_project:projectId,p_limit:75});
  if(request===listSequence)renderArchiveList(records);
 }catch(error){
  el.list.replaceChildren(make('p','txarchive-placeholder','Unable to load archived tasks: '+error.message));
  el.count.textContent='—';
  show('Archive history unavailable: '+error.message,true);
 }finally{listing=false;el.refresh.disabled=false;el.refresh.textContent='↻ Refresh archive'}
}
async function archiveTask(){
 const t=inspected?.task;
 if(!t||archiving||inspecting)return;
 if(!projectMatches(t))return show('Switch to the task’s project first.',true);
 if(t.status==='archived')return show('This task is already archived.',true);
 const reason=el.reason.value.trim();
 if(reason.length<3)return show('Please enter an archive reason (at least 3 characters).',true);
 const key=t.public_task_id||String(t.id);
 const yes=window.confirm(
  'Archive '+key+'?\n\nProject: '+(t.project||'—')+
  '\nLevel: '+(t.layer||'—')+'\nCurrent status: '+(t.status||'—')+
  '\n\nIt will be removed from active queues. Existing submissions, transcripts, QA feedback and payment history will be preserved.'
 );
 if(!yes)return;
 archiving=true;archiveButton();el.submit.textContent='Archiving…';
 try{
  const result=await rpc('admin_archive_task_by_key',{p_task_key:key,p_reason:reason.slice(0,500)});
  if(!result?.archived)throw Error('Archive confirmation was not returned.');
  // The archive is already committed. Allow read-only reinspection while
  // keeping the final status message visible after refreshing the task card.
  archiving=false;
  await inspectTask(key);
  show((result.already_archived?'Already archived: ':'Archived: ')+key+
   '. Audio removed from active queues. Submissions preserved.');
  void refreshList();
  $('queueRefresh')?.click();
  $('txqRefresh')?.click();
 }catch(error){show('Archive failed: '+error.message,true)}
 finally{archiving=false;el.submit.textContent='Archive selected task';archiveButton()}
}
el.inspect.addEventListener('click',()=>void inspectTask(el.key.value));
el.key.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void inspectTask(el.key.value)}});
el.key.addEventListener('input',()=>{inspected=null;renderPreview();show('')});
el.submit.addEventListener('click',()=>void archiveTask());
el.refresh.addEventListener('click',()=>void refreshList());
document.querySelector('[data-tx-tab="archives"]')?.addEventListener('click',()=>void refreshList());
document.addEventListener('txv2:data',e=>{
 const id=Number(e.detail?.projectId||0);
 if(!id)return;
 if(projectId!==id){
  projectId=id;inspected=null;el.reason.value='';renderPreview();
  el.list.replaceChildren(make('p','txarchive-placeholder','Project changed. Open Task Archive to load its history.'));
  el.count.textContent='—';listSequence++;
 }
 projectName=String(e.detail?.projectName||'').trim();
 if(active())void refreshList();
});
if(active()&&projectId)void refreshList();
})();