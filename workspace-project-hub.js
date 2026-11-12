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
let libraryFolder='';
let workSeq=0,workBusy=false,workStatus=null;
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
  section.innerHTML='<a class="ac-project-back" href="#overview" id="acProjectBack">← Back to projects</a><div class="ac-project-head"><h2 id="acProjectTitle">Project</h2><span id="acProjectRate" class="ac-project-rate" hidden></span></div><p id="acProjectSub" class="ac-project-sub"></p><section id="acProjectWork" class="ac-project-work" aria-label="Project task controls" aria-live="polite"><div class="ac-project-work-loading">Checking available tasks…</div></section><nav id="acProjectTabs" class="ac-detail-tabs" aria-label="Project sections"><button class="ac-detail-tab" data-project-tab="instructions" role="tab" aria-selected="true">Instructions</button><button class="ac-detail-tab" data-project-tab="library" role="tab" aria-selected="false">Library</button><button class="ac-detail-tab" data-project-tab="feedback" role="tab" aria-selected="false">Feedback</button><button class="ac-detail-tab" data-project-tab="announcements" role="tab" aria-selected="false">Announcements</button><button class="ac-detail-tab" data-project-tab="recordings" role="tab" aria-selected="false" hidden>My recordings</button></nav><div id="acProjectContent" class="ac-detail-panel" role="tabpanel"><div class="ac-detail-loading">Loading project information…</div></div>';
  main.appendChild(section);
  section.querySelector('#acProjectBack').addEventListener('click',e=>{e.preventDefault();closeProject()});
  section.querySelector('#acProjectTabs').addEventListener('click',e=>{const b=e.target.closest('[data-project-tab]');if(!b)return;changeTab(b.dataset.projectTab)});
  section.addEventListener('click',e=>{
    if(e.target.closest('[data-ac-open-assignments]')){
      e.preventDefault();
      const link=document.querySelector('[data-view-link="assignments"]');
      if(link){closeProject();link.click()}else location.assign('/workspace#assignments');
      return;
    }
    const refresh=e.target.closest('[data-ac-work-refresh]');
    if(refresh){void readProjectWork(current?.id);return}
    const start=e.target.closest('[data-ac-task-start]');
    if(start){void startProjectWork(start)}
  });
  section.querySelector('#acProjectContent').addEventListener('click',async e=>{
   const b=e.target.closest('[data-guideline-ack]');
   if(b){b.disabled=true;try{const {error}=await client.rpc('acknowledge_project_guideline',{p_guideline:b.dataset.guidelineAck});if(error)throw error;detail=null;await readProject(current.id);changeTab('instructions')}catch(error){b.disabled=false;alert('Unable to acknowledge guideline: '+error.message)}return}
   const libraryAck=e.target.closest('[data-library-ack]');
   if(libraryAck){libraryAck.disabled=true;try{const {error}=await client.rpc('acknowledge_contributor_library_item',{p_item:libraryAck.dataset.libraryAck});if(error)throw error;const item=(detail?.library||[]).find(x=>x.id===libraryAck.dataset.libraryAck);if(item)item.acknowledged=true;renderTab()}catch(error){libraryAck.disabled=false;alert('Unable to acknowledge resource: '+error.message)}return}
   const annAck=e.target.closest('[data-announcement-ack]');
   if(annAck){annAck.disabled=true;try{const {error}=await client.rpc('acknowledge_my_project_announcement',{p_announcement:annAck.dataset.announcementAck});if(error)throw error;const item=(detail?.announcements||[]).find(x=>x.id===annAck.dataset.announcementAck);if(item)item.acknowledged=true;renderTab()}catch(error){annAck.disabled=false;alert('Unable to acknowledge announcement: '+error.message)}return}
   const folder=e.target.closest('[data-library-folder]');
   if(folder){libraryFolder=folder.dataset.libraryFolder||'';renderTab();return}
   const file=e.target.closest('[data-library-file]');
   if(file){try{const path=file.dataset.libraryFile;const item=(detail?.library||[]).find(x=>x.storage_path===path&&x.kind==='file');if(!item)throw Error('File not found');const {data,error}=await client.storage.from('adatacore-project-library').createSignedUrl(item.storage_path,120);if(error)throw error;if(!data?.signedUrl)throw Error('File link not available');window.open(data.signedUrl,'_blank','noopener,noreferrer')}catch(error){alert('Unable to open file: '+error.message)}return}
   const feedback=e.target.closest('[data-feedback-id]');
   if(feedback){
    const item=feedback.dataset.item,review=feedback.dataset.feedbackId;
    if(isUUID(item)&&Number.isInteger(Number(review))&&Number(review)>0){location.assign('/transcription-v2?item='+encodeURIComponent(item)+'&review='+encodeURIComponent(review)+'&launch=workspace');return}
    const r=(detail?.feedback||[]).find(x=>String(x.history_id)===String(review));if(!r)return;
    const next=feedback.nextElementSibling;
    if(next?.classList.contains('ac-feedback-detail-row')){next.remove();return}
    hostCloseDetail();
    const tr=document.createElement('tr');tr.className='ac-feedback-detail-row';
    const td=document.createElement('td');td.colSpan=4;
    const box=document.createElement('div');box.className='ac-feedback-note';
    const title=document.createElement('strong');title.textContent='Review feedback';
    const p=document.createElement('p');p.textContent=r.feedback||'Review completed without an additional written comment.';
    box.append(title,p);td.append(box);tr.append(td);feedback.after(tr);
   }
  });
 }
 return true;
}
function setHeader(name,sub){
 const h=$('viewHeading'),s=$('viewSub'),eye=$('viewEyebrow');
 if(h)h.textContent=name;if(s)s.textContent=sub;if(eye)eye.textContent=current?'Project workspace':'Contributor workspace';
}

function projectTaskRoute(id,itemId){
 const route=Number(id)===93?'/transcription-v2':'/transcription';
 location.assign(route+'?item='+encodeURIComponent(itemId)+'&launch=workspace');
}
function projectWorkAction(info){
 const activeReview=Boolean(info.active_review_item_id),activeL1=Boolean(info.active_item_id);
 const reviews=Number(info.review_queue_available||0),l1Queue=Number(info.queue_available||0);
 const remaining=Number(info.remaining||0);
 const manuallyAssigned=info.manual_assignment_only===true;
 const fallback=info.fallback_l1_available===true;
 const canL1=info.can_claim_l1===true;
 if(activeReview)return {kind:'l2',label:'Continue L2 review',note:'Your review is already assigned and ready to continue.',ready:true};
 if(activeL1)return {kind:'l1',label:'Continue L1 transcription',note:'Finish the transcription you have already started.',ready:true};
 if(info.can_review_l2===true&&reviews>0)return {kind:'l2',label:'Start L2 review',note:reviews+' eligible transcript'+(reviews===1?'':'s')+' awaiting your review.',ready:true};
 if(manuallyAssigned)return {kind:'none',label:'Admin assignment required',note:'This project is managed through manual assignment.',ready:false};
 if(canL1&&l1Queue>0&&remaining>0)return {kind:'l1',label:fallback?'Start L1 task · L2 fallback':'Start L1 task',
  note:fallback?'No eligible L2 reviews right now. You can temporarily work on L1 audio while keeping your L2 status.':'Ready to start a transcription task.',ready:true};
 if(info.can_review_l2===true&&reviews===0&&l1Queue>0&&!canL1)return {kind:'none',label:'No tasks available',note:'No eligible L2 reviews at the moment. Your L1 allowance or project requirements may be exhausted.',ready:false};
 if(l1Queue===0)return {kind:'none',label:'No tasks available',note:'There is no ready audio in the L1 queue right now.',ready:false};
 return {kind:'none',label:'No tasks available',note:'Check your task allowance or review the instructions for this project.',ready:false};
}
function showProjectWork(info,error){
 const host=$('acProjectWork');if(!host||!current)return;
 if(Number(current.id)===94){const ready=Boolean(info?.voiceAllowed);host.innerHTML=ready?'<div class="ac-project-work-main"><div><strong>Voice Studio</strong><p>Launch a solo or anonymous two-person recording session.</p></div><a class="btn btn-primary" href="/voice-studio">Open Voice Studio →</a></div>':'<div class="ac-project-work-main"><div><strong>Voice Studio setup</strong><p>The project is not yet published for contributors. Your assignment will become available after launch.</p></div><span class="pill">Pending launch</span></div>';return;}
 if(current.type!=='transcription'){
  host.innerHTML='<div class="ac-project-work-main"><div><span class="ac-project-work-kicker">PROJECT WORK</span><strong>Ready to work?</strong><p>Open Assignments to start a task from this project.</p></div><a class="btn btn-primary" href="#assignments" data-ac-open-assignments>View assignments →</a></div>';return;
 }
 if(error){host.innerHTML='<div class="ac-project-work-main"><div><span class="ac-project-work-kicker">PROJECT WORK</span><strong>Unable to check tasks</strong><p>'+esc(error)+'</p></div><button type="button" class="btn btn-secondary" data-ac-work-refresh>Retry</button></div>';return}
 if(!info){host.innerHTML='<div class="ac-project-work-loading">Checking available tasks…</div>';return}
 const action=projectWorkAction(info);
 workStatus=info;
 const level=info.can_review_l2===true?'L2 reviewer':'L1 contributor';
 const l2=Number(info.review_queue_available||0),l1=Number(info.queue_available||0);
 host.innerHTML='<div class="ac-project-work-main"><div class="ac-project-work-info"><span class="ac-project-work-kicker">WORK ON THIS PROJECT <span class="ac-project-work-level">'+esc(level)+'</span></span><strong>'+esc(action.ready?'Work is available':action.label)+'</strong><p>'+esc(action.note)+'</p><div class="ac-project-work-queues"><span>L2 reviews <b>'+l2+'</b></span><span>L1 audio <b>'+l1+'</b></span>'+(info.fallback_l1_available?'<span class="ac-project-work-fallback">L1 fallback active</span>':'')+'</div></div><div class="ac-project-work-actions"><button class="btn btn-primary" type="button" data-ac-task-start="'+esc(action.kind)+'" '+(!action.ready||workBusy?'disabled':'')+'>'+esc(action.label)+(action.ready?' →':'')+'</button><button class="btn btn-secondary" type="button" data-ac-work-refresh aria-label="Refresh project task availability">Refresh</button></div></div>';
}
async function readProjectWork(id){
 const seq=++workSeq;
 if(!current||Number(current.id)!==Number(id))return;
 showProjectWork(null);
 if(isSandbox){
  $('acProjectWork').innerHTML='<div class="ac-project-work-main"><div><strong>Practice workspace</strong><p>Use Assignments to open practice tasks.</p></div><a class="btn btn-secondary" href="#assignments" data-ac-open-assignments>View assignments →</a></div>';return;
 }
 if(Number(current.id)===94){try{const {data,error}=await client.rpc('vs_can_join',{p_project:Number(id)});if(error)throw error;if(seq===workSeq){showProjectWork({voiceAllowed:data===true});void applyProjectUi(id)}}catch(e){if(seq===workSeq)showProjectWork({voiceAllowed:false},e.message)}return}
 if(current.type!=='transcription'){showProjectWork({});return}
 try{
  const {data,error}=await client.rpc('tx_my_transcription_projects');
  if(error)throw error;
  if(seq!==workSeq||Number(current?.id)!==Number(id))return;
  const entry=(Array.isArray(data)?data:[]).find(p=>Number(p.project_id)===Number(id));
  if(!entry){showProjectWork(null,'You do not currently have an active transcription assignment for this project.');return}
  showProjectWork(entry);
 }catch(error){if(seq!==workSeq)return;showProjectWork(null,error.message||'Unable to fetch task availability.')}
}
async function startProjectWork(button){
 if(workBusy||!workStatus||!current)return;
 const action=projectWorkAction(workStatus);
 if(!action.ready||action.kind==='none'||button.dataset.acTaskStart!==action.kind)return;
 workBusy=true;const projectId=Number(current.id),original=button.textContent;
 button.disabled=true;button.textContent='Opening task…';
 try{
  const rpc=action.kind==='l2'?'tx_claim_review_next':'tx_claim_next';
  const {data,error}=await client.rpc(rpc,{p_project_id:projectId});
  if(error)throw error;
  if(!data?.item_id)throw Error('No eligible task is available right now.');
  projectTaskRoute(projectId,data.item_id);
 }catch(error){
  const msg=String(error.message||error);
  const host=$('acProjectWork');
  if(host){const notice=document.createElement('p');notice.className='ac-project-work-error';notice.textContent=msg;host.append(notice)}
  workBusy=false;
  await readProjectWork(projectId);
  const refreshed=$('acProjectWork');if(refreshed){
    const notice=document.createElement('p');notice.className='ac-project-work-error';
    notice.textContent=msg;refreshed.append(notice);
  }
 }finally{workBusy=false;if(button.isConnected){button.disabled=false;button.textContent=original}}
}

async function applyProjectUi(id){
 const {data,error}=await client.rpc('project_ui_public',{p_project:id});
 if(error||!current||Number(current.id)!==Number(id))return;
 const ui=data&&typeof data==='object'?data:{};
 const title=$('acProjectTitle'),sub=$('acProjectSub'),section=$('view-project');
 if(!section)return;
 title.textContent=ui.headline||current.name||'Project';
 sub.textContent=ui.subtitle||current.description||'Project instructions, resources and feedback.';
 const coverId='acProjectUiCover';let cover=$(coverId);
 if(!cover){cover=document.createElement('div');cover.id=coverId;cover.style.cssText='display:none;width:100%;max-height:175px;overflow:hidden;border-radius:14px;margin:13px 0';section.querySelector('.ac-project-head')?.before(cover)}
 cover.replaceChildren();
 if(ui.image_url&&/^https:\/\/[^ <>"']+$/i.test(ui.image_url)){
  const image=document.createElement('img');image.src=ui.image_url;image.alt='Project cover';image.style.cssText='width:100%;max-height:175px;object-fit:cover;display:block';cover.append(image);cover.style.display='block';
 }else cover.style.display='none';
 if(ui.accent&&/^#[0-9a-f]{6}$/i.test(ui.accent))section.style.setProperty('--brand',ui.accent);
 else section.style.removeProperty('--brand');
 const code=$('acProjectPublicCode');if(code)code.textContent=(current.project_code||'')+(ui.badge?' · '+ui.badge:'');
 const action=section.querySelector('#acProjectWork .btn-primary');
 if(action&&ui.button_label)action.textContent=ui.button_label+' →';
}


async function loadMyRecordings(){
 const host=$('acVoiceRecordingItems');if(!host||!current||Number(current.id)!==94)return;
 const {data:sessionRows,error}=await client.from('vs_sessions').select('id,state,mode,script_id,created_at').eq('project_id',94).eq('state','submitted').order('created_at',{ascending:false}).limit(35);
 if(error){host.textContent='Unable to load recordings: '+error.message;return}
 if(!host.isConnected||tab!=='recordings')return;
 if(!sessionRows?.length){host.textContent='You have no submitted recordings yet. Your recordings will appear here after submitting a task.';return}
 const ids=sessionRows.map(s=>s.id);
 const [tracks,reviews,scripts]=await Promise.all([
  client.from('vs_tracks').select('session_id,storage_path,duration_seconds,submitted_at,transcript').in('session_id',ids),
  client.from('vs_reviews').select('session_id,verdict,quality_score,feedback').in('session_id',ids),
  client.from('vs_scripts').select('id,title').eq('project_id',94)
 ]);
 if(tracks.error||reviews.error||scripts.error){host.textContent='Could not load recording details. Please refresh this project.';return}
 if(!host.isConnected||tab!=='recordings')return;
 host.replaceChildren();
 for(const row of sessionRows){
  const items=(tracks.data||[]).filter(x=>x.session_id===row.id);if(!items.length)continue;
  const article=document.createElement('article');article.className='ac-rule-card';article.style.cssText='padding:16px;margin-bottom:12px';
  const title=document.createElement('strong');title.textContent=(scripts.data||[]).find(x=>x.id===row.script_id)?.title||'Hindi voice recording';
  const meta=document.createElement('p');meta.textContent=date(row.created_at)+' · '+items.length+' audio track(s) · Submitted';
  article.append(title,meta);
  for(const item of items){
   const player=document.createElement('audio');player.controls=true;player.preload='none';player.style.cssText='width:100%;max-width:600px;display:none;margin-top:10px';
   const play=document.createElement('button');play.className='btn btn-secondary';play.type='button';play.textContent='▶ Listen to my recording';
   play.onclick=async()=>{
    play.disabled=true;
    try{const {data,error}=await client.storage.from('voice-studio').createSignedUrl(item.storage_path,180);if(error)throw error;player.src=data.signedUrl;player.style.display='block';await player.play().catch(()=>{})}
    catch(e){play.textContent='Playback failed: '+e.message}finally{play.disabled=false}
   };
   const duration=document.createElement('p');duration.textContent='Duration: '+Math.floor(item.duration_seconds/60)+'m '+item.duration_seconds%60+'s';
   article.append(play,player,duration);
   if(item.transcript){
    const d=document.createElement('details');const heading=document.createElement('summary');heading.textContent='Automatic Hindi transcript (draft)';
    const text=document.createElement('p');text.lang='hi';text.style.whiteSpace='pre-wrap';text.textContent=item.transcript;
    d.append(heading,text);article.append(d);
   }
  }
  const review=(reviews.data||[]).find(x=>x.session_id===row.id);
  const status=document.createElement('p');status.textContent=review?'QA: '+review.verdict.replaceAll('_',' ')+' · '+review.quality_score+'/5':'QA pending';
  article.append(status);
  if(review?.feedback){const p=document.createElement('p');p.textContent=review.feedback;article.append(p)}
  host.append(article);
 }
 if(!host.children.length)host.textContent='No submitted audio tracks were found for your account.';
}

function renderProjects(){
 const host=$('acHomeProjectCards');if(!host)return;
 host.className=projects.length?'ac-project-grid':'ac-home-empty';
 host.innerHTML=projects.length?projects.map(p=>
 '<a class="ac-project-card" href="'+projectLink(p.id)+'" data-project-id="'+Number(p.id)+'"><div class="ac-pr-top"><span class="ac-pr-type">'+esc(p.type==='transcription'?'Transcription':p.type==='voice_recording'?'Voice recording':p.type||'Project')+'</span><span class="pill pill-green">Assigned</span></div><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||'Project instructions, feedback and updates are available inside.')+'</p><div class="ac-pr-action"><span class="ac-project-code-tag">'+esc(p.project_code||'Project')+'</span><strong style="color:var(--brand);font-size:11px">View project →</strong></div></a>').join(''):'No active project access appears on this account. Your available task assignments remain accessible under Assignments.';
}
async function readList(){
 try{
  let result;
  if(isSandbox){const {data,error}=await client.rpc('admin_sandbox_workspace',{p_session_id:sandboxSession});if(error)throw error;result=(data?.sandbox?.projects||[]).map(p=>({...p,lifecycle:'active'}))}
  else{const {data,error}=await client.rpc('contributor_my_project_hubs');if(error)throw error;result=data}
  projects=Array.isArray(result)?result:[];
  if(projects.length){const codes=await client.from('project_lab').select('id,project_code').in('id',projects.map(p=>Number(p.id)).filter(Number.isFinite));if(!codes.error&&Array.isArray(codes.data)){const lookup=new Map(codes.data.map(row=>[Number(row.id),row.project_code]));projects=projects.map(p=>({...p,project_code:lookup.get(Number(p.id))||''}));}}
  renderProjects();
  const query=new URLSearchParams(location.search),p=Number(query.get('project')||0);
  if(p&&projects.some(x=>Number(x.id)===p))openProject(p,false);
 }catch(error){const host=$('acHomeProjectCards');if(host){host.className='ac-home-empty';host.textContent='Unable to load assigned projects: '+error.message}}
}
function returnOverview(){
 document.querySelectorAll('.workspace-view').forEach(v=>v.classList.toggle('active',v.id==='view-overview'));
 document.querySelectorAll('[data-view-link]').forEach(x=>x.classList.toggle('active',x.dataset.viewLink==='overview'));
 current=null;detail=null;tab='instructions';workSeq++;workStatus=null;
 setHeader('Overview','Your assigned projects and available work.');
}
function closeProject(){
 returnOverview();
 const u=new URL(location.href);u.searchParams.delete('project');u.hash='overview';
 history.pushState({workspaceView:'overview'},'',u.pathname+u.search+u.hash);
}
function openProject(id,updateUrl=true){
 const project=projects.find(p=>Number(p.id)===Number(id));if(!project)return;
 current=project;detail=null;tab='instructions';libraryFolder='';requestSeq++;
 document.querySelectorAll('.workspace-view').forEach(v=>v.classList.toggle('active',v.id==='view-project'));
 document.querySelectorAll('[data-view-link]').forEach(x=>x.classList.toggle('active',x.dataset.viewLink==='overview'));
 $('acProjectTitle').textContent=project.name||'Project';
 $('acProjectSub').textContent=project.description||'Project instructions, resources and feedback.';
 let codeLabel=$('acProjectPublicCode');if(!codeLabel){codeLabel=document.createElement('span');codeLabel.id='acProjectPublicCode';codeLabel.style.cssText='font:700 10px ui-monospace,monospace;letter-spacing:.02em;color:#385c65;padding:7px 11px;border:1px solid #d8e9e7;background:#edf6f5;border-radius:9px;margin:7px 0 11px;display:inline-flex;max-width:100%;overflow-wrap:anywhere;user-select:all';$('acProjectSub').after(codeLabel)}codeLabel.textContent=project.project_code||'';
 const recordingsTab=document.querySelector('[data-project-tab="recordings"]');if(recordingsTab)recordingsTab.hidden=Number(project.id)!==94;
 void applyProjectUi(project.id);
 $('acProjectRate').hidden=true;
 setHeader('Project details','Instructions, library, feedback and announcements');
 changeTab(Number(project.id)===94&&new URLSearchParams(location.search).get('tab')==='recordings'?'recordings':'instructions');
 if(updateUrl){const u=new URL(location.href);u.searchParams.set('project',String(project.id));u.hash='';history.pushState({project:project.id},'',u.pathname+u.search)}
 readProject(project.id);
 readProjectWork(project.id);
 window.scrollTo({top:0,behavior:'smooth'});
}
async function readProject(id){
 const seq=++requestSeq;
 if(isSandbox){detail={project:current,guidelines:[],library:[],feedback:[],announcements:[]};$('acProjectContent').innerHTML='<div class="ac-tab-empty">Test identities can access project task queues. Contributor-specific published content is not available in sandbox mode.</div>';return}
 try{
 const {data,error}=await client.rpc('contributor_project_hub',{p_project_id:id});
 if(error)throw error;if(seq!==requestSeq||Number(current?.id)!==Number(id))return;
 detail=data||{};if(detail.project?.hourly_rate!=null){const rate=$('acProjectRate');rate.textContent=(detail.project.currency==='USD'?'$':String(detail.project.currency||'')+' ')+Number(detail.project.hourly_rate).toFixed(2)+'/audio hour';rate.hidden=false}
 renderTab();void applyProjectUi(id);
 }catch(error){if(seq!==requestSeq)return;$('acProjectContent').innerHTML='<div class="ac-tab-empty">Unable to load project information: '+esc(error.message)+'</div>'}
}
function hostCloseDetail(){document.querySelectorAll('.ac-feedback-detail-row').forEach(el=>el.remove())}
function changeTab(next){
 if(!['instructions','library','feedback','announcements','recordings'].includes(next)||next==='recordings'&&Number(current?.id)!==94)return;
 tab=next;
 document.querySelectorAll('[data-project-tab]').forEach(b=>{const active=b.dataset.projectTab===tab;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1});
 renderTab();
}
const empty=(title,desc)=>'<div class="ac-tab-empty"><strong>'+esc(title)+'</strong><div style="margin-top:8px">'+esc(desc)+'</div></div>';
function renderTab(){
 const host=$('acProjectContent');if(!host)return;
 if(tab==='recordings'&&Number(current?.id)===94){host.innerHTML='<h3>My recordings</h3><p class="ac-panel-sub">Listen to your submitted audio and see any automatic transcript and reviewer feedback.</p><div id="acVoiceRecordingItems" class="ac-instructions-list">Loading voice recordings…</div>';void loadMyRecordings();return}
 if(!detail){host.innerHTML='<div class="ac-detail-loading">Loading project information…</div>';return}
 const h={instructions:['Instructions','Read the published requirements before starting work.'],library:['Library','Reference materials and published project guides.'],feedback:['Feedback received','Select a row to inspect reviewer feedback and transcript changes.'],announcements:['Announcements','Updates shared for this project.']}[tab];
 let body='<h3>'+h[0]+'</h3><p class="ac-panel-sub">'+h[1]+'</p>';
 if(tab==='instructions'){
  const entries=detail.guidelines||[];
  body+=entries.length?'<div class="ac-instructions-list">'+entries.map(g=>'<article class="ac-rule-card"><strong>'+esc(g.title||'Project guide')+' · v'+Number(g.version||1)+'</strong><p>'+esc(g.body||'')+'</p>'+(g.required&&!g.acknowledged?'<button class="btn btn-secondary" type="button" data-guideline-ack="'+esc(g.id)+'">Mark as read</button>':g.acknowledged?'<span class="pill pill-green">Acknowledged</span>':'')+'</article>').join('')+'</div>':empty('No published instructions yet','The project administrator has not published instructions here.');
  if(detail.project?.description)body+='<article class="ac-detail-entry"><h4>Project overview</h4><p>'+esc(detail.project.description)+'</p></article>';
 }else if(tab==='library'){
  const entries=detail.library||[];
  const direct=entries.filter(g=>(g.parent_id||'')===libraryFolder);
  const currentFolder=entries.find(g=>g.kind==='folder'&&g.id===libraryFolder);
  body+='<div class="ac-project-library-bar"><button type="button" class="btn btn-secondary" data-library-folder="">Library home</button>'+(currentFolder?'<span>'+esc(currentFolder.title)+'</span>':'')+'</div>';
  body+=direct.length?direct.map(g=>{
    const kind=g.kind||'text';
    const badge=kind==='folder'?'Folder':kind==='file'?(g.completion_rule==='watch'?'Training video':'File'):kind==='link'?'Link':'Document';
    const action=kind==='folder'?'<button type="button" class="btn btn-secondary" data-library-folder="'+esc(g.id)+'">Open folder</button>':
       kind==='file'?(g.completion_rule==='watch'?'<button type="button" class="btn btn-primary" data-library-video="'+esc(g.storage_path)+'" data-library-watch-id="'+esc(g.id)+'">'+(g.watch_completed?'Watch again':'Watch required video')+'</button>':'<button type="button" class="btn btn-secondary" data-library-file="'+esc(g.storage_path)+'">View file</button>'):
       kind==='link'&&/^https?:\/\//i.test(g.url||'')?'<a class="btn btn-secondary" target="_blank" rel="noopener noreferrer" href="'+esc(g.url)+'">Open link ↗</a>':'';
    return '<article class="ac-detail-entry ac-project-library-entry"><div class="ac-project-library-top"><h4>'+esc(g.title||'Resource')+'</h4><span class="pill pill-brand">'+badge+'</span></div><time>'+(g.legacy?'Version '+Number(g.version||1)+' · ':'')+date(g.published_at)+'</time>'+
     (g.body?'<p>'+esc(g.body)+'</p>':'')+
     '<div class="ac-project-library-actions">'+action+(g.completion_rule==='watch'?(g.watch_completed?'<span class="pill pill-green">Watch complete</span>':'<span class="pill">'+Math.round(Number(g.watched_seconds||0))+' sec watched</span>'):'')+(g.required_ack&&!g.acknowledged?'<button type="button" class="btn btn-secondary" data-library-ack="'+esc(g.id)+'">Acknowledge</button>':g.acknowledged?'<span class="pill pill-green">Acknowledged</span>':'')+'</div></article>';
  }).join(''):empty('No resources in this folder','Project administrators can publish documents, files, folders and links from Project Control Center.');
 }else if(tab==='feedback'){
  const entries=detail.feedback||[];
  body+=entries.length?'<div style="overflow-x:auto"><table class="ac-feedback-table"><thead><tr><th>Audio / task</th><th>Review date</th><th>Decision</th><th>Avg score</th></tr></thead><tbody>'+entries.map(f=>{const scores=Object.values(f.ratings||{}).map(Number).filter(x=>Number.isFinite(x)&&x>=0);const overall=Number(f.ratings?.overall);const score=Number.isFinite(overall)&&f.ratings?.overall!=null?overall:(scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null);return '<tr data-feedback-id="'+esc(f.history_id)+'" data-item="'+esc(f.audio_item_id)+'" tabindex="0" title="Open feedback detail"><td>'+esc(f.audio_name||'Audio task')+'</td><td>'+date(f.reviewed_at)+'</td><td>'+esc(f.decision==='approve'?'Approved':'Changes requested')+'</td><td>'+(score!=null?'<span class="ac-feedback-score">'+score.toFixed(1)+'</span>':'—')+'</td></tr>'}).join('')+'</tbody></table></div>':empty('No feedback yet','Your reviewed transcription submissions will appear here after a reviewer has completed the review.');
 }else{
  const entries=detail.announcements||[];
  body+=entries.length?entries.map(a=>'<article class="ac-detail-entry"><h4>'+esc(a.title||'Update')+'</h4><time>'+date(a.published_at)+'</time><p>'+esc(a.body||'')+'</p>'+(a.requires_ack?(a.acknowledged?'<span class="pill pill-green">Acknowledged</span>':'<button type="button" class="btn btn-secondary" data-announcement-ack="'+esc(a.id)+'">Acknowledge announcement</button>'):'')+'</article>').join(''):empty('No announcements','Project announcements and important changes will show up here.');
 }
 host.innerHTML=body;
}
document.addEventListener('click',e=>{
 const l=e.target.closest('[data-project-id]');if(l){e.preventDefault();e.stopImmediatePropagation();openProject(Number(l.dataset.projectId));return}
 if(current&&e.target.closest('[data-view-link]')){const a=e.target.closest('[data-view-link]');if(a.dataset.viewLink!=='overview'){current=null;detail=null;const u=new URL(location.href);u.searchParams.delete('project');history.replaceState({workspaceView:a.dataset.viewLink},'',u.pathname+u.search+u.hash)}else{e.preventDefault();e.stopImmediatePropagation();closeProject()}}
},true);
document.addEventListener('keydown',e=>{const row=e.target.closest?.('[data-feedback-id]');if(row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();row.click()}});
window.addEventListener('focus',()=>{if(current&&current.type==='transcription'&&!workBusy)void readProjectWork(current.id)});
window.addEventListener('popstate',()=>{const p=Number(new URLSearchParams(location.search).get('project')||0);if(p&&projects.some(x=>Number(x.id)===p))openProject(p,false);else if(current)returnOverview()});
function boot(){if(!initElements())return;readList()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();