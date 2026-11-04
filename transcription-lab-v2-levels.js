(()=>{
'use strict';
// Transcription V2 contributor/reviewer permission manager.
// All authorizations and workload caps are enforced in Supabase RPCs.
// This script does not alter the existing L1/L2 task or review handlers.
const $=id=>document.getElementById(id);
if(!document.body.classList.contains('tx-v2')||!$('txLevelsPanel')||!window.supabase)return;
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
const roster=$('txLevelsRoster'),search=$('txLevelsSearch'),notice=$('txLevelsNotice'),
 modal=$('txLevelsDialog'),mode=$('txLevelsMode'),limit=$('txLevelsLimit'),count=$('txLevelsCount');
let projectId=null,people=[],selected=null,request=0,loading=false,busy=false;
const create=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=String(text);return el};
const rpc=async(name,args)=>{
 const {data,error}=await db.rpc(name,args);
 if(error)throw Error(error.message);
 return data;
};
function show(text,error=false){
 notice.textContent=text;
 notice.dataset.error=error?'true':'false';
}
function summaryLabel(p){
 if(p.level==='BOTH')return 'L1 + L2';
 if(p.level==='PAUSED')return 'Paused';
 return p.level||'L1';
}
function render(){
 roster.replaceChildren();
 const q=search.value.trim().toLocaleLowerCase();
 const matches=people.filter(p=>{
  const hay=[p.name,p.email,p.uid,p.level].map(v=>String(v||'').toLocaleLowerCase()).join(' ');
  return !q||hay.includes(q);
 });
 count.textContent=matches.length+' of '+people.length+' project members';
 if(!matches.length){
  roster.append(create('p','txlv-muted',people.length?'No members match your search.':'No members have active access to this project.'));
  return;
 }
 for(const p of matches.slice(0,200)){
  const item=create('article','txlv-member');
  const avatar=create('div','txlv-avatar');
  const display=(p.name||p.email||'Contributor').trim();
  avatar.textContent=display.split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
  const who=create('div','txlv-member-who');
  who.append(create('strong','',display));
  who.append(create('small','',p.email||p.uid||''));
  const role=create('span','txlv-role txlv-role-'+(p.level||'L1').toLowerCase(),summaryLabel(p));
  const stats=create('div','txlv-member-stats');
  stats.append(create('span','',Number(p.active_l1||0)+' active L1'));
  stats.append(create('span','',Number(p.active_l2||0)+' / '+Number(p.l2_limit||10)+' L2 reviews'));
  if(Number(p.l1_limit||0)>0)stats.append(create('span','',Number(p.l1_remaining||0)+' L1 claims left'));
  const actions=create('div','txlv-member-actions');
  if(!p.explicit)actions.append(create('small','txlv-default','Default L1'));
  const manage=create('button','txlv-edit','Manage ↗');manage.type='button';
  manage.addEventListener('click',()=>edit(p));
  actions.append(manage);
  item.append(avatar,who,role,stats,actions);roster.append(item);
 }
 if(matches.length>200)roster.append(create('p','txlv-muted','Showing first 200 members. Refine your search to find someone else.'));
}
async function load(){
 const project=projectId,sequence=++request;
 if(!project)return;
 loading=true;
 count.textContent='Loading project permissions…';
 try{
  const rows=await rpc('tx_admin_review_levels',{p_project_id:project});
  if(sequence!==request||project!==projectId)return;
  if(!Array.isArray(rows))throw Error('Unexpected reviewer permission response');
  people=rows;
  render();
  show('Levels are project-specific. Existing assigned tasks remain available after a level change.');
 }catch(e){
  if(sequence!==request)return;
  people=[];roster.replaceChildren(create('p','txlv-muted','Could not load permissions: '+e.message));
  count.textContent='Unable to load';show(e.message,true);
 }finally{if(sequence===request)loading=false}
}
function edit(person){
 if(busy||loading)return;
 selected=person;mode.value=person.level||'L1';limit.value=String(Number(person.l2_limit||10));
 $('txLevelsPerson').textContent=(person.name||person.email||'Contributor')+' · '+(person.email||person.uid||'');
 $('txLevelsActive').textContent=Number(person.active_l1||0)+' existing L1 tasks · '+Number(person.active_l2||0)+' active L2 reviews · '+Number(person.l1_remaining||0)+' L1 claims available';
 $('txLevelsDialogMessage').textContent='';
 modal.showModal();
}
function close(){if(!busy&&modal.open)modal.close()}
$('txLevelsCancel').addEventListener('click',close);
$('txLevelsCancelTop').addEventListener('click',close);
modal.addEventListener('close',()=>{selected=null});
mode.addEventListener('change',()=>{
 const levels=mode.value,help=$('txLevelsDialogMessage');
 help.textContent=levels==='PAUSED'?'No new L1 or L2 tasks will be assigned. Existing tasks will not be cancelled.':
  levels==='L2'?'Only new L2 reviews will be allowed. Existing L1 tasks can still be completed.':
  levels==='BOTH'?'L1 claims and L2 audits can both be assigned. Self-review remains prohibited.':
  'Only new L1 transcription claims are permitted.';
 limit.disabled=levels==='L1'||levels==='PAUSED';
});
async function save(){
 if(busy||!selected||!projectId)return;
 const qty=Number(limit.value);
 if(!Number.isInteger(qty)||qty<1||qty>100){
  $('txLevelsDialogMessage').textContent='Enter an L2 limit between 1 and 100.';return;
 }
 busy=true;$('txLevelsSave').disabled=true;
 $('txLevelsSave').textContent='Saving…';$('txLevelsDialogMessage').textContent='';
 try{
  const saved=await rpc('tx_admin_set_review_level',{
   p_project_id:projectId,p_user_id:selected.user_id,p_level:mode.value,p_l2_limit:qty
  });
  modal.close();
  show('Saved '+(saved.level==='BOTH'?'L1 + L2':saved.level)+' access. New assignments now follow these permissions.');
  await load();
 }catch(e){$('txLevelsDialogMessage').textContent=e.message}
 finally{busy=false;$('txLevelsSave').disabled=false;$('txLevelsSave').textContent='Save review level'}
}
$('txLevelsSave').addEventListener('click',save);
$('txLevelsRefresh').addEventListener('click',()=>{if(!loading)void load()});
search.addEventListener('input',render);
$('txLevelsAssign').addEventListener('click',()=>$('assign')?.click());
function navigateLevels(){
 const assign=$('assignDialog');
 if(assign?.open)assign.close();
 document.querySelector('[data-tx-tab="people"]')?.click();
 $('txLevelsPanel').scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 search.focus({preventScroll:true});
}
$('txLevelsManageFromAssign').addEventListener('click',navigateLevels);
const stage=$('assignLayer'),hint=$('txLevelsAssignHelp'),assignConfirm=$('assignConfirm');
function updateStage(){
 const reviewer=stage.value==='L2';
 hint.textContent=reviewer?
  'L2 audits are assigned directly from submitted transcripts. The person must have L2 permission and enough available L2 task capacity.':
  'L1 sets how many audio transcription tasks someone may claim. Contributors with L2-only or paused access cannot receive new L1 allowances.';
 assignConfirm.textContent=reviewer?'Assign L2 review tasks':'Set L1 task allowance';
 const field=$('assignQty');
 const label=field.closest('label');
 if(label)label.firstChild.textContent=reviewer?'Review tasks per person':'L1 task allowance per person';
}
stage.addEventListener('change',updateStage);updateStage();
document.addEventListener('txv2:data',event=>{
 const id=Number(event.detail?.projectId||0);
 if(!Number.isInteger(id)||id<1||id===projectId)return;
 projectId=id;people=[];search.value='';void load();
});
const queryProject=Number(new URLSearchParams(location.search).get('project'));
if(Number.isInteger(queryProject)&&queryProject>0){projectId=queryProject;void load()}
})();
