(()=>{
'use strict';
if(window.__audioLab2)return;window.__audioLab2=true;
const P=94,U='https://llmhyezgcnbognmmsnzq.supabase.co',K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const db=window.supabase?.createClient(U,K);
const $=id=>document.getElementById(id);
let scripts=[],sessions=[],tracks=[],reviews=[],flags=[],generations=[],selectedScript=null,selectedHistory=null,tab='overview',editing=null,creating=false,stopping=false,loading=false,editJson=false;
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
const stamp=v=>v?new Date(v).toLocaleString():'—';
const short=id=>String(id||'').slice(0,8).toUpperCase();
const task=id=>'VS-'+String(id).toUpperCase();
const fmt=n=>{n=Math.floor(Number(n)||0);return Math.floor(n/60)+':'+String(n%60).padStart(2,'0')};
const scriptShape=x=>({title:x.title||'',scenario:x.scenario||'',emotion:x.emotion||'',mode:x.mode||'duo',language:x.language||'Hindi',duration_seconds:Number(x.duration_seconds)||120,body:x.body||'',is_active:x.is_active!==false});
let noticeTimer=0;
function notify(message,error=false){
 const el=$('alNotice');el.textContent=String(message);el.classList.add('show');el.classList.toggle('error',!!error);
 clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el.classList.remove('show'),8500);
}
function fail(result){if(result.error)throw Error(result.error.message||String(result.error));return result.data}
const pages={
 overview:['Audio production overview','Your central workspace for voice scripts, recorded sessions and QA.'],
 scripts:['Script library','Browse, revise, clone and manage the complete script inventory.'],
 generate:['Groq script generator','Create natural voice-acting dialogue and retain exact prompt provenance.'],
 sessions:['Audio sessions','Play the submitted recordings independently or in synchronized Duo mode.'],
 history:['Prompt & JSON history','Trace generation settings, raw output JSON and revision history.']
};
function go(name){
 if(!pages[name])return;
 tab=name;
 document.querySelectorAll('#labNav [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
 document.querySelectorAll('.al-panel').forEach(v=>v.classList.toggle('active',v.id==='al-'+name));
 $('alPageTitle').textContent=pages[name][0];$('alPageSub').textContent=pages[name][1];
 if(name==='scripts')renderScripts();
 if(name==='sessions')renderSessions();
 if(name==='history')renderHistory();
 if(name==='overview')renderOverview();
 const u=new URL(location.href);u.hash=name;history.replaceState(null,'',u.pathname+u.search+u.hash);
 window.scrollTo(0,0);
}
function statusPill(status){const cls=['submitted','active','approved'].includes(status)?'':status==='archived'?'dim':'warn';return '<span class="al-pill '+cls+'">'+escapeHtml(status.replaceAll('_',' '))+'</span>'}
async function load(){
 if(loading)return;loading=true;
 $('alRefresh').disabled=true;
 try{
  const results=await Promise.all([
   db.from('vs_scripts').select('*').eq('project_id',P).order('created_at',{ascending:false}).limit(1000),
   db.from('vs_sessions').select('id,project_id,script_id,actor_a,actor_b,mode,state,created_at,ended_at').eq('project_id',P).order('created_at',{ascending:false}).limit(120),
   db.from('vs_script_generations').select('*').eq('project_id',P).order('created_at',{ascending:false}).limit(300)
  ]);
  for(const r of results)if(r.error)throw r.error;
  [scripts,sessions,generations]=results.map(x=>x.data||[]);
  let allTracks=[],allFlags=[],allReviews=[];
  const ids=sessions.map(s=>s.id);
  if(ids.length){
   // Avoid oversized PostgREST URL filters and load only recent sessions.
   const chunks=[];for(let i=0;i<ids.length;i+=40)chunks.push(ids.slice(i,i+40));
   const batches=await Promise.all(chunks.flatMap(part=>[
    db.from('vs_tracks').select('session_id,actor_id,storage_path,duration_seconds,bytes,submitted_at,transcript').in('session_id',part),
    db.from('vs_task_flags').select('id,session_id,reason,created_at').in('session_id',part),
    db.from('vs_reviews').select('session_id,verdict,quality_score,feedback,reviewed_at').in('session_id',part)
   ]));
   for(let i=0;i<batches.length;i++){if(batches[i].error)throw batches[i].error;if(i%3===0)allTracks.push(...(batches[i].data||[]));else if(i%3===1)allFlags.push(...(batches[i].data||[]));else allReviews.push(...(batches[i].data||[]))}
  }
  tracks=allTracks;flags=allFlags;reviews=allReviews;
  renderOverview();renderScripts();renderSessions();renderHistory();
 }catch(e){notify('Unable to load Audio Lab data: '+e.message,true)}
 finally{loading=false;$('alRefresh').disabled=false}
}
function renderOverview(){
 const data=[
  ['Total scripts',scripts.length,scripts.filter(s=>s.is_active).length+' active'],
  ['Duo scripts',scripts.filter(s=>s.mode==='duo').length,'Two-person voice acting'],
  ['Uploaded tracks',tracks.length,'Separate actor recordings'],
  ['QA completed',reviews.length,sessions.filter(s=>s.state==='submitted').length+' submitted sessions']
 ];
 $('alStats').innerHTML=data.map(x=>'<div class="al-stat"><span>'+escapeHtml(x[0])+'</span><strong>'+x[1]+'</strong><small>'+escapeHtml(x[2])+'</small></div>').join('');
 const recent=sessions.slice(0,6).map(s=>'<div class="al-activity"><div><strong>'+escapeHtml(task(s.id))+'</strong><div class="al-tiny">'+escapeHtml(s.mode)+' · '+escapeHtml(stamp(s.created_at))+'</div></div>'+statusPill(s.state)+'</div>');
 const host=$('alOverviewRecent');host.innerHTML=recent.join('')||'<div class="al-empty">No sessions recorded yet.</div>';
}
function filteredScripts(){
 const q=$('alScriptSearch').value.toLowerCase().trim(),mode=$('alScriptMode').value,status=$('alScriptStatus').value;
 return scripts.filter(s=>(mode==='all'||s.mode===mode)&&(status==='all'||(status==='active'?s.is_active:!s.is_active))&&(!q||[s.title,s.body,s.scenario,s.emotion,s.id].some(x=>String(x||'').toLowerCase().includes(q))));
}
function renderScripts(){
 const items=filteredScripts(),list=$('alScriptList');
 list.innerHTML=items.length?items.map(s=>'<button class="al-list-item '+(selectedScript===s.id?'active':'')+'" type="button" data-script="'+escapeHtml(s.id)+'"><strong>'+escapeHtml(s.title)+'</strong><small>'+escapeHtml(s.mode.toUpperCase())+' · '+escapeHtml(s.language)+' · '+fmt(s.duration_seconds)+' · '+escapeHtml(s.emotion||'Neutral')+'</small><small>'+short(s.id)+' · '+(s.is_active?'Published':'Archived')+'</small></button>').join(''):'<div class="al-empty">No matching scripts found.</div>';
 if(selectedScript&&!scripts.some(s=>s.id===selectedScript))selectedScript=null;
 if(selectedScript)void showScript(selectedScript);else $('alScriptDetail').innerHTML='<div class="al-empty">Choose a script to see the full dialogue, editable JSON, prompt source and revision history.</div>';
}
async function showScript(id){
 const s=scripts.find(x=>x.id===id);if(!s)return;
 selectedScript=s.id;
 document.querySelectorAll('[data-script]').forEach(x=>x.classList.toggle('active',x.dataset.script===id));
 const target=$('alScriptDetail');
 const used=sessions.filter(x=>x.script_id===id);
 const generation=generations.find(x=>x.script_id===id);
 target.innerHTML='<div class="al-detail-head"><div><span class="al-eyebrow">SCRIPT '+escapeHtml(short(s.id))+'</span><h2>'+escapeHtml(s.title)+'</h2><div class="al-meta">'+escapeHtml(s.mode.toUpperCase())+' · '+escapeHtml(s.language)+' · '+fmt(s.duration_seconds)+' · '+escapeHtml(s.emotion||'Neutral')+' · '+escapeHtml(stamp(s.created_at))+'</div></div>'+statusPill(s.is_active?'active':'archived')+'</div><div class="al-actions"><button class="al-button al-primary" data-script-action="edit">Edit script</button><button class="al-button al-secondary" data-script-action="clone">Duplicate</button><button class="al-button al-secondary" data-script-action="toggle">'+(s.is_active?'Archive':'Restore')+'</button><button class="al-button al-secondary" data-script-action="copy">Copy JSON</button></div><div class="al-meta">Script ID: '+escapeHtml(s.id)+' · Used in '+used.length+' recorded or in-progress session(s)</div><h3>Full script</h3><div class="al-text" lang="'+(s.language==='Hindi'?'hi':'en')+'"></div><details><summary style="cursor:pointer;margin-top:15px;font-weight:700">Source JSON</summary><pre class="al-code" id="alSelectedJson"></pre></details><h3>Origin and changes</h3><div id="alScriptOrigin" class="al-note">Loading provenance and changes…</div>';
 target.querySelector('.al-text').textContent=s.body;
 target.querySelector('#alSelectedJson').textContent=JSON.stringify(scriptShape(s),null,2);
 target.querySelectorAll('[data-script-action]').forEach(b=>b.onclick=()=>void scriptAction(b.dataset.scriptAction,s));
 if(generation){
  const source=target.querySelector('#alScriptOrigin');source.textContent='';
  const heading=document.createElement('strong');heading.textContent='Generated via '+generation.provider+' · '+generation.model+' · '+stamp(generation.created_at);
  const button=document.createElement('button');button.className='al-button al-secondary';button.textContent='View original prompt and JSON';button.style.margin='10px 0';button.onclick=()=>{selectedHistory=generation.id;go('history')};
  source.append(heading,document.createElement('br'),button);
 }else target.querySelector('#alScriptOrigin').textContent='Original generation prompt unavailable for older scripts; revision history below is still maintained.';
 try{
  const {data,error}=await db.from('vs_script_revisions').select('id,changed_at,changed_by,before_json,after_json').eq('script_id',s.id).order('changed_at',{ascending:false}).limit(20);
  if(error)throw error;
  const area=document.createElement('div');area.innerHTML='<h3>Revision history</h3>';
  if(!data?.length)area.innerHTML+='<p class="al-meta">No edits recorded since Audio Lab 2 history tracking began.</p>';
  else for(const revision of data){
   const details=document.createElement('details');details.style.marginBottom='10px';
   const summary=document.createElement('summary');summary.textContent=stamp(revision.changed_at)+' · Revision '+revision.id;summary.style.cursor='pointer';
   const before=document.createElement('pre');before.className='al-code';before.textContent=JSON.stringify({before:revision.before_json,after:revision.after_json},null,2);
   details.append(summary,before);area.append(details);
  }
  if(selectedScript===id)target.append(area);
 }catch(error){if(selectedScript===id){const el=document.createElement('p');el.className='al-meta';el.textContent='Revision history unavailable: '+error.message;target.append(el)}}
}
async function scriptAction(action,s){
 try{
  if(action==='edit'){openEditor(s);return}
  if(action==='copy'){await copyText(JSON.stringify(scriptShape(s),null,2));notify('Script JSON copied.');return}
  if(action==='clone'){
   if(!confirm('Duplicate this script as a new editable copy?'))return;
   const row=scriptShape(s);row.title=(row.title+' (Copy)').slice(0,120);row.is_active=false;
   const {data,error}=await db.from('vs_scripts').insert({project_id:P,...row}).select('id').single();if(error)throw error;
   selectedScript=data.id;await load();notify('Duplicate created as an unpublished script.');return;
  }
  if(action==='toggle'){
   if(!confirm(s.is_active?'Archive this script from future assignments? Existing recording sessions remain preserved.':'Restore this script for future assignments?'))return;
   const {error}=await db.from('vs_scripts').update({is_active:!s.is_active}).eq('id',s.id).eq('project_id',P);if(error)throw error;
   await load();notify(s.is_active?'Script archived.':'Script restored.');return;
  }
 }catch(e){notify('Script action failed: '+e.message,true)}
}
async function copyText(text){
 if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
 else{const ta=document.createElement('textarea');ta.value=text;document.body.append(ta);ta.select();document.execCommand('copy');ta.remove()}
}
function openEditor(s){
 editing=s||null;editJson=false;$('alEditorMode').value='text';
 $('alEditorTitle').textContent=s?'Edit '+s.title:'Create a new script';
 const form=$('alEditorForm'),value=s?scriptShape(s):{title:'',mode:'duo',scenario:'',emotion:'Neutral',language:'Hindi',duration_seconds:120,body:'',is_active:false};
 for(const k of ['title','mode','scenario','emotion','language','duration_seconds','body']){
  form.elements.namedItem(k).value=value[k];
 }
 form.elements.namedItem('is_active').checked=value.is_active;
 $('alEditWarning').textContent=s&&sessions.some(x=>x.script_id===s.id)?'This script has existing sessions: to preserve recorded QA evidence, its dialogue and metadata cannot be changed. Use Duplicate to make a new editable version. You may archive this script without affecting old tasks.':'Changes are saved in the revision history. Archived scripts are excluded from new assignments.';
 $('alEditorStatus').textContent='';$('alEditor').showModal();
}
function switchEditorMode(value){
 const field=$('alEditorBody'),form=$('alEditorForm');
 if(value==='json'&&!editJson){
  const item={};for(const k of ['title','mode','scenario','emotion','language','duration_seconds'])item[k]=form.elements.namedItem(k).value;
  item.duration_seconds=Number(item.duration_seconds);item.body=field.value;item.is_active=form.elements.namedItem('is_active').checked;
  field.value=JSON.stringify(item,null,2);editJson=true;
 }else if(value==='text'&&editJson){
  try{
   const data=JSON.parse(field.value);
   for(const k of ['title','mode','scenario','emotion','language','duration_seconds'])form.elements.namedItem(k).value=data[k]??'';
   form.elements.namedItem('is_active').checked=data.is_active!==false;
   field.value=data.body||'';editJson=false;
  }catch(e){notify('Invalid JSON: '+e.message,true);$('alEditorMode').value='json'}
 }
}
async function saveEditor(event){
 event.preventDefault();
 const f=$('alEditorForm'),field=$('alEditorBody'),state=$('alEditorStatus');
 state.textContent='Saving…';
 try{
  let item={};
  for(const k of ['title','mode','scenario','emotion','language','duration_seconds'])item[k]=f.elements.namedItem(k).value;
  item.body=field.value;item.is_active=f.elements.namedItem('is_active').checked;
  if(editJson)item=JSON.parse(field.value);
  item.title=String(item.title||'').trim();item.body=String(item.body||'').trim();item.scenario=String(item.scenario||'').trim();
  item.emotion=String(item.emotion||'').trim();item.language=String(item.language||'Hindi');
  item.duration_seconds=Number(item.duration_seconds);item.is_active=Boolean(item.is_active);
  if(!item.title||!item.body||!['solo','duo'].includes(item.mode)||!['Hindi','English','Hinglish'].includes(item.language)||!Number.isInteger(item.duration_seconds)||item.duration_seconds<60||item.duration_seconds>180)throw Error('Check the title, mode, language, duration (60–180 seconds) and dialogue.');
  if(item.title.length>120||item.scenario.length>120||item.emotion.length>50||item.body.length>18000)throw Error('One or more fields exceed their permitted length.');
  // Never mutate a script already referenced by a live or completed session.
  // QA must always be able to inspect the original assigned dialogue and duration.
  if(editing&&sessions.some(x=>x.script_id===editing.id)){
   const before=scriptShape(editing);
   const after=scriptShape(item);
   if(Object.keys(before).some(k=>k!=='is_active'&&before[k]!==after[k]))
    throw Error('This script is already assigned to recorded sessions. Use Duplicate to create an editable version without altering existing QA evidence.');
  }
  const data={title:item.title,scenario:item.scenario,emotion:item.emotion,mode:item.mode,language:item.language,duration_seconds:item.duration_seconds,body:item.body,is_active:item.is_active};
  let r;
  if(editing)r=await db.from('vs_scripts').update(data).eq('id',editing.id).eq('project_id',P).select('id').single();
  else r=await db.from('vs_scripts').insert({project_id:P,...data}).select('id').single();
  if(r.error)throw r.error;
  selectedScript=r.data.id;$('alEditor').close();
  await load();go('scripts');notify(editing?'Script saved; revision history recorded.':'New script created.');
 }catch(e){state.textContent=e.message}
}
function renderSessions(){
 const q=$('alSessionSearch').value.toLowerCase().trim().replace(/^vs-/i,''),status=$('alSessionStatus').value;
 const visible=sessions.filter(s=>(status==='all'||s.state===status)&&(!q||s.id.toLowerCase().includes(q)||task(s.id).toLowerCase().includes(q))).slice(0,90);
 const host=$('alSessionList');window.AdacoreDuoQAPlayer?.disposeAll();
 host.textContent='';
 if(!visible.length){host.innerHTML='<div class="al-empty al-card">No matching sessions. Search a complete VS task ID or change the status filter.</div>';return}
 for(const s of visible){
  const ts=tracks.filter(t=>t.session_id===s.id),fs=flags.filter(f=>f.session_id===s.id),rv=reviews.find(r=>r.session_id===s.id);
  const item=document.createElement('article');item.className='al-card al-session';
  item.innerHTML='<div class="al-session-head"><div><span class="al-eyebrow">VOICE STUDIO / '+escapeHtml(s.mode.toUpperCase())+'</span><h3>'+escapeHtml(task(s.id))+'</h3><div class="al-meta">'+escapeHtml(stamp(s.created_at))+' · '+ts.length+' uploaded track(s)'+(fs.length?' · '+fs.length+' flag(s)':'')+'</div></div>'+statusPill(s.state)+'</div><div class="al-actions"><button type="button" class="al-button al-secondary" data-show="toggle">Show playback & details</button><a class="al-button al-secondary" href="/admin/project-lab?project=94&voice_task='+encodeURIComponent(task(s.id))+'#recordings">Central QA ↗</a></div>';
  const detail=document.createElement('div');detail.hidden=true;detail.className='al-session-detail';
  if(ts.length&&window.AdacoreDuoQAPlayer){
   const player=window.AdacoreDuoQAPlayer.create({sessionId:s.id,actorA:s.actor_a,actorB:s.actor_b,tracks:ts,db});
   detail.append(player.element);
  }
  if(!ts.length){const p=document.createElement('p');p.className='al-note';p.textContent='No submitted audio yet; the task still exists and can be searched by its ID.';detail.append(p)}
  const script=scripts.find(z=>z.id===s.script_id);
  if(script){const text=document.createElement('details');text.innerHTML='<summary style="cursor:pointer;font-weight:700;margin:16px 0">View assigned dialogue</summary>';const pre=document.createElement('div');pre.className='al-text';pre.textContent=script.body;text.append(pre);detail.append(text)}
  if(fs.length){const flagsBox=document.createElement('div');flagsBox.className='al-note';flagsBox.textContent='Participant flags';for(const fl of fs){const p=document.createElement('p');p.textContent=stamp(fl.created_at)+' — '+fl.reason;flagsBox.append(p)}detail.append(flagsBox)}
  const review=document.createElement('p');review.className='al-meta';review.textContent=rv?'QA: '+rv.verdict+' · '+rv.quality_score+'/5'+(rv.feedback?' · '+rv.feedback:''):'QA: Not reviewed';detail.append(review);
  item.append(detail);
  item.querySelector('[data-show=toggle]').onclick=e=>{detail.hidden=!detail.hidden;e.currentTarget.textContent=detail.hidden?'Show playback & details':'Hide playback & details'};
  host.append(item);
 }
}
function renderHistory(){
 const term=$('alHistorySearch').value.toLowerCase().trim();
 const visible=generations.filter(x=>!term||[x.id,x.script_id,x.prompt_text,JSON.stringify(x.request_json)].some(v=>String(v||'').toLowerCase().includes(term)));
 $('alHistoryList').innerHTML=visible.length?visible.map(g=>'<button type="button" class="al-list-item '+(selectedHistory===g.id?'active':'')+'" data-generation="'+g.id+'"><strong>'+escapeHtml(scripts.find(s=>s.id===g.script_id)?.title||'Generated script '+short(g.script_id))+'</strong><small>'+escapeHtml(stamp(g.created_at))+' · '+escapeHtml(g.provider)+' · '+escapeHtml(g.model)+'</small><small>Generation '+short(g.id)+'</small></button>').join(''):'<div class="al-empty">No prompt history saved yet. Generate a new script to capture its prompt and JSON.</div>';
 if(selectedHistory)showHistory(selectedHistory);
}
function showHistory(id){
 selectedHistory=id;document.querySelectorAll('[data-generation]').forEach(x=>x.classList.toggle('active',x.dataset.generation===id));
 const h=generations.find(x=>x.id===id);if(!h)return;
 const target=$('alHistoryDetail');
 target.innerHTML='<div class="al-detail-head"><div><span class="al-eyebrow">GROQ GENERATION</span><h2>Generation '+escapeHtml(short(h.id))+'</h2><div class="al-meta">'+escapeHtml(stamp(h.created_at))+' · '+escapeHtml(h.provider)+' · '+escapeHtml(h.model)+'</div></div></div><div class="al-actions"><button class="al-button al-secondary" data-copy="prompt">Copy prompt</button><button class="al-button al-secondary" data-copy="json">Copy JSON</button><button class="al-button al-secondary" data-action="regenerate">Use settings again</button></div><h3>Submitted settings</h3><pre class="al-code" id="alHistorySettings"></pre><h3>Exact generation prompt</h3><pre class="al-code" id="alHistoryPrompt"></pre><h3>Provider output JSON</h3><pre class="al-code" id="alHistoryJson"></pre>';
 target.querySelector('#alHistorySettings').textContent=JSON.stringify(h.request_json,null,2);
 target.querySelector('#alHistoryPrompt').textContent=h.prompt_text||'Unavailable';
 target.querySelector('#alHistoryJson').textContent=JSON.stringify(h.output_json,null,2);
 target.querySelector('[data-copy=prompt]').onclick=()=>void copyText(h.prompt_text).then(()=>notify('Prompt copied.'),e=>notify(e.message,true));
 target.querySelector('[data-copy=json]').onclick=()=>void copyText(JSON.stringify(h.output_json,null,2)).then(()=>notify('JSON copied.'),e=>notify(e.message,true));
 target.querySelector('[data-action=regenerate]').onclick=()=>{
  const fields=$('alGeneratorForm').elements,data=h.request_json||{};
  for(const k of ['mode','language','scenario'])if(data[k]!==undefined)fields.namedItem(k).value=data[k];
  if(data.duration_seconds)fields.namedItem('duration').value=String(data.duration_seconds);
  if(Array.isArray(data.emotions))fields.namedItem('emotions').value=data.emotions.join(', ');
  fields.namedItem('instructions').value=String(data.instructions||'');
  go('generate');notify('Original settings restored. Review before submitting; generation is not automatic.');
 };
}
function setupEvents(){
 $('labNav').addEventListener('click',event=>{const b=event.target.closest('[data-tab]');if(b)go(b.dataset.tab)});
 document.querySelectorAll('[data-go]').forEach(x=>x.onclick=()=>go(x.dataset.go));
 $('alRefresh').onclick=()=>void load();
 for(const id of ['alScriptSearch','alScriptMode','alScriptStatus'])$(id).addEventListener(id==='alScriptSearch'?'input':'change',renderScripts);
 $('alScriptList').addEventListener('click',event=>{const b=event.target.closest('[data-script]');if(b)void showScript(b.dataset.script)});
 $('alNewScript').onclick=()=>openEditor(null);
 $('alExportScripts').onclick=()=>{
  const documentData={
   project_id:P,
   exported_at:new Date().toISOString(),
   scripts:scripts.map(s=>({id:s.id,created_at:s.created_at,...scriptShape(s)}))
  };
  const blob=new Blob([JSON.stringify(documentData,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='adatacore-audio-lab-2-scripts.json';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  notify('Exported '+scripts.length+' scripts as JSON.');
 };
 $('alEditorForm').onsubmit=event=>void saveEditor(event);
 $('alCloseEditor').onclick=$('alCancelEditor').onclick=()=>$('alEditor').close();
 $('alEditorMode').onchange=event=>switchEditorMode(event.target.value);
 $('alEditor').addEventListener('close',()=>{editJson=false});
 $('alSessionSearch').addEventListener('input',renderSessions);
 $('alSessionStatus').addEventListener('change',renderSessions);
 $('alHistorySearch').addEventListener('input',renderHistory);
 $('alHistoryList').addEventListener('click',event=>{const b=event.target.closest('[data-generation]');if(b)showHistory(b.dataset.generation)});
 $('alGeneratorForm').onsubmit=event=>void generate(event);
 $('alStopGeneration').onclick=()=>{stopping=true;$('alGenerateStatus').textContent+='\\nStopping after the current script…'};
 $('alJsonSchema').textContent=JSON.stringify({scripts:[{title:'Short descriptive title',scenario:'Situation',emotion:'Core emotion',body:'Agent: Dialogue...\\nCustomer: Response...'}]},null,2);
 window.addEventListener('hashchange',()=>{const name=location.hash.slice(1);if(pages[name]&&tab!==name)go(name)});
}
async function generate(event){
 event.preventDefault();if(creating)return;
 const f=event.currentTarget,fields=f.elements,btn=$('alGenerateBtn'),status=$('alGenerateStatus');
 const count=Number(fields.namedItem('count').value);
 if(!Number.isInteger(count)||count<1||count>30){notify('Choose 1–30 scripts per generation.',true);return}
 creating=true;stopping=false;btn.disabled=true;$('alStopGeneration').disabled=false;let created=0;
 try{
  const {data:{session:auth},error:authError}=await db.auth.getSession();
  if(authError||!auth)throw Error('Admin sign-in expired.');
  for(let i=0;i<count&&!stopping;i++){
   status.textContent='Creating script '+(i+1)+' / '+count+' with Groq… '+created+' saved.';
   const payload={project_id:P,count:1,mode:fields.namedItem('mode').value,language:fields.namedItem('language').value,scenario:fields.namedItem('scenario').value,emotions:fields.namedItem('emotions').value.split(',').map(x=>x.trim()).filter(Boolean),duration_seconds:Number(fields.namedItem('duration').value),instructions:fields.namedItem('instructions').value};
   const response=await fetch(U+'/functions/v1/voice-studio-generate',{method:'POST',headers:{Authorization:'Bearer '+auth.access_token,apikey:K,'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const body=await response.json();
   if(!response.ok)throw Error((body.error||'Generation failed')+' · '+(body.detail||''));
   created+=Number(body.created||0);
   if(body.warning)notify(body.warning,true);
  }
  status.textContent=(stopping?'Generation stopped. ':'Generation complete. ')+created+' / '+count+' scripts saved with full prompt and JSON history.';
  await load();
  if(created)notify(created+' scripts generated successfully.');
 }catch(e){status.textContent=created+' of '+count+' scripts saved. '+e.message;notify('Generation stopped: '+e.message,true);if(created)await load()}
 finally{creating=false;stopping=false;btn.disabled=false;$('alStopGeneration').disabled=true}
}
async function boot(){
 if(!db){$('alGate').textContent='Supabase library unavailable. Reload the page.';return}
 try{
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user){location.replace('/auth');return}
  const result=await db.rpc('vs_is_admin',{});
  if(result.error||result.data!==true){$('alGate').textContent='Audio Lab 2 is available only to authorized administrators.';return}
  $('alCurrentUser').textContent=user.email||'Administrator';
  $('alGate').hidden=true;$('labApp').hidden=false;
  setupEvents();
  await load();
  go(pages[location.hash.slice(1)]?location.hash.slice(1):'overview');
 }catch(e){$('alGate').textContent='Unable to open Audio Lab 2: '+e.message}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else void boot();
})();