(()=>{
'use strict';
// Adatacore Transcription V2 Contributor Experience
// Additive only: all audio edits, saves, splitting, merging, review and submission
// continue through the existing transcription-editor.js controller.
const $=id=>document.getElementById(id);
const root=document.body,audio=$('audio'),rows=$('segmentRows'),flow=$('v2CaptionFlow'),assist=$('v2cbAssist');
if(!root.classList.contains('tx-v2-editor')||!audio||!rows||!flow||!assist)return;
const M=window.TranscriptionModel,params=new URLSearchParams(location.search),itemId=params.get('item')||'unknown';
const n=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
const b=(label,cb,cls)=>{const e=n('button',cls||'',label);e.type='button';e.addEventListener('click',cb);return e;};
const safeNum=(x,fallback=0)=>Number.isFinite(Number(x))?Number(x):fallback;
const cap=(x,min,max)=>Math.max(min,Math.min(max,x));
const stamp=(s)=>{s=Math.max(0,Number(s)||0);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');};
const len=ms=>{const t=Math.max(0,Number(ms)||0);return t>=60000?Math.floor(t/60000)+'m '+String(Math.floor(t%60000/1000)).padStart(2,'0')+'s':(t/1000).toFixed(1)+'s'};
const memoryKey='adatacore:txv2:cb-ui:v1',bookmarkKey='adatacore:txv2:bookmarks:'+itemId;
const getStorage=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key));return v??fallback}catch(_){return fallback}};
const putStorage=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch(_){}};
const standard={font:16,height:395,readingFocus:false,scroll:'smooth',density:'comfortable',wave:'normal',dock:true,speed:1,replayKey:'r',bookmarkKey:'b'};
const restored=getStorage(memoryKey,{});
const prefs={...standard,...(restored&&typeof restored==='object'&&!Array.isArray(restored)?restored:{})};
let bookmarks=getStorage(bookmarkKey,[]);
if(!Array.isArray(bookmarks))bookmarks=[];
bookmarks=bookmarks.filter(x=>x&&Number.isFinite(Number(x.at))&&Number(x.at)>=0).slice(-80);
const snapshot=()=>window.txV2Snapshot?.()||null;
const segments=()=>{const s=snapshot();return Array.isArray(s?.segments)?s.segments:[]};
const isEditable=()=>snapshot()?.editable===true;
const current=()=>audio.currentTime||0;
const duration=()=>Number.isFinite(audio.duration)?audio.duration:safeNum(snapshot()?.duration_ms)/1000;
const activeSegment=()=>{
 const ms=current()*1000,list=segments().slice().sort((a,b)=>safeNum(a.start_ms)-safeNum(b.start_ms));
 return list.find(s=>safeNum(s.start_ms)<=ms&&ms<safeNum(s.end_ms))||list.find(s=>safeNum(s.start_ms)>ms)||list.at(-1)||null;
};
const words=text=>String(text||'').trim().split(/\s+/u).filter(Boolean).length;
const tagDescriptions={
 '[हँसी]':'Clearly audible laughter. Confirm the sound in the recording.',
 '[हल्की-हँसी]':'A clearly audible gentle or short laugh, not merely a smiling voice.',
 '[दीर्घश्वास]':'A distinct audible deep breath or sigh, if approved for this project.'
};
function showToast(text,bad=false){
 const e=$('v2cbFeedback')||n('p','v2cb-feedback');
 if(!e.id){e.id='v2cbFeedback';$('v2cbAssistBody').prepend(e)}
 e.textContent=text;e.dataset.error=bad?'true':'false';
 const toast=$('toast');if(toast){toast.textContent=text;toast.classList.remove('hidden');setTimeout(()=>{if(toast.textContent===text)toast.classList.add('hidden')},3200)}
}
function applyPrefs(save=true){
 prefs.font=cap(safeNum(prefs.font,16),12,23);
 prefs.height=cap(safeNum(prefs.height,395),235,720);
 prefs.scroll=['smooth','instant','off'].includes(prefs.scroll)?prefs.scroll:'smooth';
 prefs.density=['comfortable','compact'].includes(prefs.density)?prefs.density:'comfortable';
 prefs.wave=['normal','compact'].includes(prefs.wave)?prefs.wave:'normal';
 root.style.setProperty('--v2cb-font-size',prefs.font+'px');
 root.style.setProperty('--v2cb-flow-height',prefs.height+'px');
 root.classList.toggle('v2cb-reading-focus',Boolean(prefs.readingFocus));
 root.classList.toggle('v2cb-density-compact',prefs.density==='compact');
 root.classList.toggle('v2cb-wave-compact',prefs.wave==='compact');
 root.classList.toggle('v2cb-hide-dock',!prefs.dock);
 $('v2cbTranscriptHeight').value=String(prefs.height);
 $('v2cbScrollMode').value=prefs.scroll;
 $('v2cbDimInactive').setAttribute('aria-pressed',String(Boolean(prefs.readingFocus)));
 $('v2cbDimInactive').classList.toggle('is-active',Boolean(prefs.readingFocus));
 const follow=$('v2FollowAudio');
 if(follow&&prefs.scroll==='off')follow.checked=false;
 else if(follow&&prefs.scroll!=='off')follow.checked=true;
 window.txV2CBScrollBehavior=()=>prefs.scroll==='instant'?'instant':prefs.scroll==='off'?'instant':'smooth';
 if(save)putStorage(memoryKey,prefs);
}
applyPrefs(false);
$('v2cbTextSmaller').addEventListener('click',()=>{prefs.font=cap(prefs.font-1,12,23);applyPrefs();renderAssist()});
$('v2cbTextBigger').addEventListener('click',()=>{prefs.font=cap(prefs.font+1,12,23);applyPrefs();renderAssist()});
$('v2cbTranscriptHeight').addEventListener('input',e=>{prefs.height=safeNum(e.target.value,395);applyPrefs(false)});
$('v2cbTranscriptHeight').addEventListener('change',()=>putStorage(memoryKey,prefs));
$('v2cbScrollMode').addEventListener('change',e=>{prefs.scroll=e.target.value;applyPrefs()});
$('v2cbDimInactive').addEventListener('click',()=>{prefs.readingFocus=!prefs.readingFocus;applyPrefs()});
$('v2FollowAudio')?.addEventListener('change',e=>{
 if(!e.target.checked&&prefs.scroll!=='off'){prefs.scroll='off';$('v2cbScrollMode').value='off';putStorage(memoryKey,prefs)}
 else if(e.target.checked&&prefs.scroll==='off'){prefs.scroll='smooth';$('v2cbScrollMode').value='smooth';putStorage(memoryKey,prefs)}
});

// Do not change the original audio transport or play/pause handlers; proxy them.
const trigger=id=>{const button=$(id);if(button&&!button.disabled)button.click()};
$('v2cbReplay3').addEventListener('click',replay3);
function replay3(){
 if(!audio.src)return showToast('Audio is still loading.');
 const start=Math.max(0,current()-3);
 if(window.txV2SeekTo)window.txV2SeekTo(Math.round(start*1000),true);
 else{audio.currentTime=start;audio.play().catch(()=>{})}
}
$('v2cbDockPlay').addEventListener('click',()=>trigger('play'));
$('v2cbDockBack').addEventListener('click',()=>trigger('back5'));
$('v2cbDockForward').addEventListener('click',()=>trigger('forward5'));
$('v2cbDockSubmit').addEventListener('click',()=>trigger('submit'));
const dockSeek=$('v2cbDockSeek');let movingDock=false;
dockSeek.addEventListener('pointerdown',()=>{movingDock=true});
dockSeek.addEventListener('pointerup',()=>{movingDock=false});
dockSeek.addEventListener('change',()=>{
 const t=safeNum(dockSeek.value);
 if(window.txV2SeekTo)window.txV2SeekTo(t);
 else audio.currentTime=t/1000;
 movingDock=false;
});
function updateDock(){
 const total=duration(),elapsed=current(),playing=!audio.paused;
 $('v2cbDockPlay').textContent=playing?'Ⅱ Pause':'▶ Play';
 $('v2cbDockPlay').setAttribute('aria-label',playing?'Pause audio':'Play audio');
 $('v2cbDockTime').textContent=stamp(elapsed)+' / '+stamp(total);
 if(total>0){
  dockSeek.max=String(Math.ceil(total*1000));
  dockSeek.disabled=false;
  if(!movingDock)dockSeek.value=String(Math.round(elapsed*1000));
 }else{dockSeek.disabled=true}
 const s=$('saveState')?.textContent||'';
 $('v2cbDockSave').textContent=s||'Draft status';
 const unsynced=/Unsaved|Saving|Save failed|local/i.test(s);
 $('v2cbDockSave').dataset.state=unsynced?'unsaved':/All changes saved|Submitted/i.test(s)?'saved':'neutral';
 $('v2cbDockSubmit').disabled=Boolean($('submit')?.disabled);
 const active=activeSegment(),list=segments();
 $('v2cbCurrentSection').textContent=active?'Section '+(list.findIndex(x=>x.id===active.id)+1)+' of '+list.length+' · '+len(active.end_ms-active.start_ms):'Ready to listen';
}
for(const event of ['play','pause','timeupdate','loadedmetadata','durationchange','seeked'])audio.addEventListener(event,updateDock);
const saveStatus=$('saveState');
if(saveStatus)new MutationObserver(updateDock).observe(saveStatus,{childList:true,characterData:true,subtree:true});
if($('submit'))new MutationObserver(updateDock).observe($('submit'),{attributes:true,attributeFilter:['disabled']});
function onlineState(){
 $('v2cbConnection').textContent=navigator.onLine?'● Network online':'○ Network offline · changes may not sync';
 $('v2cbConnection').dataset.offline=String(!navigator.onLine);
}
window.addEventListener('online',onlineState);
window.addEventListener('offline',onlineState);
onlineState();updateDock();
const nativeSpeed=$('speed');
if(nativeSpeed){
 const target=String(prefs.speed);
 if([...nativeSpeed.options].some(x=>x.value===target)){nativeSpeed.value=target;nativeSpeed.dispatchEvent(new Event('change',{bubbles:true}))}
 nativeSpeed.addEventListener('change',e=>{prefs.speed=safeNum(e.target.value,1);putStorage(memoryKey,prefs)});
}

// Local per-recording bookmarks, never a server-side mutation.
function saveBookmarks(){putStorage(bookmarkKey,bookmarks);renderBookmarkTrack()}
function addBookmark(){
 const at=Math.round(current()*1000);
 if(!duration())return showToast('Load the recording before bookmarking.');
 const near=bookmarks.some(x=>Math.abs(safeNum(x.at)-at)<350);
 if(near)return showToast('A bookmark already exists at this position.');
 bookmarks.push({at,label:'Bookmark '+(bookmarks.length+1)});
 bookmarks=bookmarks.slice(-80).sort((a,b)=>a.at-b.at);
 saveBookmarks();$('v2cbBookmark').textContent='★ Bookmarked';setTimeout(()=>$('v2cbBookmark').textContent='☆ Bookmark',1200);
 if(!assist.hidden&&activeTab==='segments')renderAssist();
}
$('v2cbBookmark').addEventListener('click',addBookmark);
const markTrack=n('div','v2cb-bookmark-markers');markTrack.setAttribute('aria-hidden','true');
document.querySelector('.v2cb-dock-seek')?.append(markTrack);
function renderBookmarkTrack(){
 markTrack.replaceChildren();const total=duration();
 if(!total)return;
 for(const mark of bookmarks){
  const i=n('span','v2cb-bookmark-marker');i.style.left=cap(safeNum(mark.at)/(total*10),0,100)+'%';
  markTrack.append(i);
 }
}
audio.addEventListener('loadedmetadata',renderBookmarkTrack);

// The existing segment table is the single editing source. Navigation and
// split/merge actions here forward to its existing handlers and checkpoints.
function gotoSegment(id,seek=false,play=false){
 const segment=segments().find(s=>String(s.id)===String(id));if(!segment)return;
 // The follow controller reads the rendered segment rows. Clear search/speaker
 // filters only when this segment is hidden so navigation never silently fails.
 if(!rows.querySelector('tr[data-segment="'+CSS.escape(String(id))+'"]')){
  if($('speakerFilter').value){$('speakerFilter').value='';$('speakerFilter').dispatchEvent(new Event('change',{bubbles:true}))}
  if($('textSearch').value){$('textSearch').value='';$('textSearch').dispatchEvent(new Event('input',{bubbles:true}))}
 }
 window.dispatchEvent(new CustomEvent('v2:goto-caption',{detail:{id:segment.id}}));
 if(seek){if(window.txV2SeekTo)window.txV2SeekTo(segment.start_ms,play);else audio.currentTime=segment.start_ms/1000}
 const piece=flow.querySelector('[data-edit-segment="'+CSS.escape(segment.id)+'"]');
 if(piece&&flow.clientHeight){
  const y=piece.getBoundingClientRect().top-flow.getBoundingClientRect().top+flow.scrollTop;
  flow.scrollTo({top:Math.max(0,y-flow.clientHeight*.22),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':prefs.scroll==='smooth'?'smooth':'instant'});
 }
}
function doRowAction(id,action){
 if(!isEditable())return showToast('This transcript is read only.',true);
 let row=rows.querySelector('tr[data-segment="'+CSS.escape(String(id))+'"]');
 if(!row){
  $('speakerFilter').value='';$('speakerFilter').dispatchEvent(new Event('change',{bubbles:true}));
  $('textSearch').value='';$('textSearch').dispatchEvent(new Event('input',{bubbles:true}));
  row=rows.querySelector('tr[data-segment="'+CSS.escape(String(id))+'"]');
 }
 const native=row?.querySelector('[data-action="'+action+'"]');
 if(!native||native.disabled)return showToast('This action is unavailable for the selected segment.',true);
 if(action==='split'){
  const segment=segments().find(x=>x.id===id);
  if(!segment)return;
  const position=Math.round(current()*1000);
  if(position<=segment.start_ms||position>=segment.end_ms)return showToast('Move the playhead inside the selected segment before splitting.',true);
 }
 native.click();requestRefresh();
}
function replaySegment(id){
 const segment=segments().find(s=>s.id===id);if(!segment)return;
 const row=rows.querySelector('tr[data-segment="'+CSS.escape(id)+'"]');
 const native=row?.querySelector('[data-action="play"]');
 if(native)native.click();
 else if(window.txV2SeekTo)window.txV2SeekTo(segment.start_ms,true);
}
function editSegment(id){
 const segment=segments().find(x=>x.id===id);if(!segment)return;
 closeAssist();
 window.dispatchEvent(new CustomEvent('v2:edit-caption',{detail:{id}}));
 gotoSegment(id,false);
}
const results=$('v2cbAssistBody'),backdrop=$('v2cbAssistBackdrop');
let activeTab='segments',previousFocus=null;
function openAssist(tab='segments'){
 activeTab=tab;
 if(assist.hidden)previousFocus=document.activeElement;
 assist.hidden=false;backdrop.hidden=false;
 root.classList.add('v2cb-assist-open');
 $('v2cbAssistOpen').setAttribute('aria-expanded','true');
 renderAssist();assist.focus({preventScroll:true});
}
function closeAssist(){
 if(assist.hidden)return;
 assist.hidden=true;backdrop.hidden=true;root.classList.remove('v2cb-assist-open');
 $('v2cbAssistOpen').setAttribute('aria-expanded','false');
 if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});previousFocus=null;
}
$('v2cbAssistOpen').addEventListener('click',()=>assist.hidden?openAssist():closeAssist());
$('v2cbAssistClose').addEventListener('click',closeAssist);
backdrop.addEventListener('click',closeAssist);
allTabs();
function allTabs(){
 for(const tab of document.querySelectorAll('[data-v2cb-tab]')){
  tab.addEventListener('click',()=>{activeTab=tab.dataset.v2cbTab;renderAssist()});
 }
}
$('v2cbAssistGuidelines').addEventListener('click',()=>{closeAssist();trigger('v2CBRulesOpen')});
$('v2cbAssistCheck').addEventListener('click',()=>{closeAssist();trigger('v2CheckQuality')});
function menuHeading(title,desc){
 results.append(n('h3','v2cb-sidebar-title',title),n('p','v2cb-sidebar-lead',desc));
}
function settingRow(title,control,detail){
 const wrap=n('label','v2cb-setting-row');
 wrap.append(n('span','v2cb-setting-title',title),control);
 if(detail)wrap.append(n('small','',detail));
 results.append(wrap);
}
function renderSegments(){
 const list=segments().slice().sort((a,b)=>a.start_ms-b.start_ms||a.end_ms-b.end_ms),selected=activeSegment();
 menuHeading('Recording segments','Select a section to jump to its audio position. Split and merge use the original editor controls.');
 const summary=n('div','v2cb-summary');
 summary.append(n('span','',list.length+' sections'),n('span','',stamp(duration())+' total'));
 results.append(summary);
 if(!list.length){results.append(n('p','v2cb-empty','No segments yet. Play the audio, drag a waveform range, or press N to add a segment.'));return}
 const nav=n('div','v2cb-nav-list');
 for(const [i,segment] of list.entries()){
  const item=n('article','v2cb-nav-item'+(selected?.id===segment.id?' is-current':'')),head=n('div','v2cb-nav-item-head');
  head.append(n('strong','',String(i+1).padStart(2,'0')+' · '+stamp(segment.start_ms/1000)+' – '+stamp(segment.end_ms/1000)),n('small','',len(segment.end_ms-segment.start_ms)));
  const p=n('p','',segment.transcript?.trim()||'Empty segment—transcription needed');
  const tools=n('div','v2cb-nav-actions');
  tools.append(b('▶ Listen',()=>replaySegment(segment.id)));
  tools.append(b('✎ Edit',()=>editSegment(segment.id)));
  if(isEditable()){
   tools.append(b('Split',()=>doRowAction(segment.id,'split')));
   tools.append(b('Merge',()=>doRowAction(segment.id,'merge')));
  }
  const jump=b('',()=>gotoSegment(segment.id,true,false),'v2cb-nav-jump');
  jump.setAttribute('aria-label','Jump to audio section '+(i+1));
  jump.append(...[...head.childNodes].map(x=>x.cloneNode(true)));head.replaceWith(jump);
  jump.classList.add('v2cb-nav-target');
  item.append(jump,p,tools);nav.append(item);
 }
 results.append(nav);
 const box=n('section','v2cb-bookmark-list');box.append(n('h3','','Bookmarked positions'));
 if(!bookmarks.length)box.append(n('p','v2cb-empty','No bookmarks. Press Shift+B or use the Bookmark button while listening.'));
 for(const mark of bookmarks){
  const row=n('div','v2cb-bookmark-row');
  row.append(b('★ '+stamp(mark.at/1000),()=>{if(window.txV2SeekTo)window.txV2SeekTo(mark.at);else audio.currentTime=mark.at/1000}));
  row.append(b('Remove',()=>{bookmarks=bookmarks.filter(x=>x!==mark);saveBookmarks();renderAssist()},'v2cb-remove'));
  box.append(row);
 }
 results.append(box);
}
function getIssues(){
 const s=snapshot();if(!s||!Array.isArray(s.segments)||!M?.lint)return [];
 try{
  const list=M.lint(s.segments,s.duration_ms,s.speakers||[]);
  return list.flatMap((entry,i)=>[
   ...(entry.errors||[]).map(msg=>({id:entry.id,index:i,severity:'error',text:String(msg)})),
   ...(entry.warnings||[]).map(msg=>({id:entry.id,index:i,severity:'warning',text:String(msg)}))
  ]);
 }catch(_){return []}
}
function extraWarnings(s){
 const issues=[];for(const [i,segment] of s.entries()){
  const text=String(segment.transcript||'');
  if(/\s\.\.\./.test(text))issues.push({id:segment.id,index:i,severity:'warning',text:'Spacing before an ellipsis (…) may not match project rules.'});
  if(/\.{4,}/.test(text))issues.push({id:segment.id,index:i,severity:'warning',text:'Check ellipsis length; project guidelines may require exactly three dots.'});
  if((text.match(/<विदेशी-भाषण="EN">/g)||[]).length!==(text.match(/<\/विदेशी-भाषण>/g)||[]).length)issues.push({id:segment.id,index:i,severity:'warning',text:'Unbalanced English foreign-language tags.'});
  const allowed=window.txV2ProjectRules?.nst;
  if(Array.isArray(allowed)&&allowed.length){
   const approved=new Set(allowed);
   for(const token of text.match(/\[[^\]\n]{1,60}\]/g)||[])if(!approved.has(token))issues.push({id:segment.id,index:i,severity:'warning',text:'Check non-speech tag '+token+' against the approved list.'});
  }
 }
 return issues;
}
let qualityCache=[],queued=false;
function quality(){
 qualityCache=[...getIssues(),...extraWarnings(segments())].slice(0,180);
 updateIssueHighlights();
 return qualityCache;
}
function updateIssueHighlights(){
 const bad=new Set(qualityCache.filter(x=>x.severity==='error').map(x=>String(x.id)));
 const warn=new Set(qualityCache.filter(x=>x.severity==='warning').map(x=>String(x.id)));
 for(const el of flow.querySelectorAll('[data-edit-segment]')){
  const id=el.dataset.editSegment;
  el.classList.toggle('v2cb-lint-error',bad.has(id));
  el.classList.toggle('v2cb-lint-warning',warn.has(id)&&!bad.has(id));
  if(bad.has(id))el.title='This segment has an issue. Open Workspace tools → Quality.';
  else if(warn.has(id))el.title='Check this segment against the project rules.';
  else if(el.title.includes('segment has an issue')||el.title.includes('Check this segment'))el.title='';
 }
}
function renderQuality(){
 const items=quality();
 menuHeading('Quality navigator','These are structural and formatting checks. Confirm every word, emotion and vocal tag by listening.');
 const errors=items.filter(x=>x.severity==='error').length,warnings=items.filter(x=>x.severity==='warning').length;
 const stats=n('div','v2cb-quality-stats');
 stats.append(n('span',errors?'is-error':'is-ok',errors+' errors'),n('span','is-warning',warnings+' suggestions'));
 results.append(stats);
 const actions=n('div','v2cb-sidebar-buttons');
 actions.append(b('✓ Run full quality check',()=>{closeAssist();trigger('v2CheckQuality')}));
 actions.append(b('View segment table',()=>{closeAssist();if(!root.classList.contains('v2-segment-editing'))trigger('v2EditMode');document.querySelector('.v2-table-wrap')?.scrollIntoView({behavior:'smooth',block:'nearest'})}));
 results.append(actions);
 if(!items.length){results.append(n('p','v2cb-empty','No structural errors detected. Audio accuracy and appropriate tagging still require a complete human review.'));return}
 const list=n('div','v2cb-issue-list');
 for(const issue of items){
  const row=b((issue.severity==='error'?'● Error':'○ Check')+' · Section '+(issue.index+1)+'\n'+issue.text,()=>{gotoSegment(issue.id,true,false);closeAssist()},'v2cb-issue-item '+issue.severity);
  list.append(row);
 }
 results.append(list);
}
function renderTags(){
 menuHeading('Project-approved tagging','Use the inline tagging toolbar after clicking and selecting text in the transcript. Tags must be audible.');
 const search=n('input','v2cb-tag-search');search.type='search';search.placeholder='Search approved tags';search.setAttribute('aria-label','Search tags');results.append(search);
 const rules=window.txV2ProjectRules||{},nst=Array.isArray(rules.nst)?rules.nst:[],style=Array.isArray(rules.style)?rules.style:[];
 const list=n('div','v2cb-approved-tags');results.append(list);
 const draw=()=>{
  list.replaceChildren();const term=search.value.trim().toLowerCase();
  for(const [label,tags] of [['NON-SPEECH',nst],['STYLE',style]]){
   const matching=tags.filter(x=>String(x).toLowerCase().includes(term)).slice(0,70);
   if(!matching.length)continue;
   list.append(n('h4','',label));
   for(const tag of matching){
    const row=n('div','v2cb-tag-ref');
    row.append(n('code','',String(tag)),n('small','',tagDescriptions[tag]||'Approved project tag. Verify performance against the audio.'));
    list.append(row);
   }
  }
  if(!list.children.length)list.append(n('p','v2cb-empty','No matching approved tags are currently published. Open Guidelines for project-specific instructions.'));
 };
 search.addEventListener('input',draw);draw();
 results.append(b('Open current guidelines ↗',()=>{closeAssist();trigger('v2CBRulesOpen')}));
}
function select(label,values,value,onChange){
 const element=n('select');
 for(const [v,t] of values){const option=n('option','',t);option.value=v;element.append(option)}
 element.value=String(value);element.addEventListener('change',()=>onChange(element.value));settingRow(label,element);
 return element;
}
function renderSettings(){
 menuHeading('Personal preferences','These settings are saved in this browser only. They never modify transcription data.');
 select('Interface density',[['comfortable','Comfortable'],['compact','Compact']],prefs.density,v=>{prefs.density=v;applyPrefs();renderAssist()});
 select('Waveform height',[['normal','Normal'],['compact','Compact waveform']],prefs.wave,v=>{prefs.wave=v;applyPrefs();renderAssist()});
 select('Auto-scroll',[['smooth','Smooth'],['instant','Instant'],['off','Off']],prefs.scroll,v=>{prefs.scroll=v;applyPrefs();renderAssist()});
 select('Transcript text size',Array.from({length:12},(_,i)=>[String(i+12),(i+12)+' px']),prefs.font,v=>{prefs.font=safeNum(v,16);applyPrefs();renderAssist()});
 select('Transcript height',[['275','Compact (275 px)'],['395','Default (395 px)'],['525','Tall (525 px)'],['675','Extra tall (675 px)']],prefs.height,v=>{prefs.height=safeNum(v,395);applyPrefs();renderAssist()});
 const focused=n('div','v2cb-setting-action');
 focused.append(n('span','','Reading focus'));
 focused.append(b(prefs.readingFocus?'On · dim other sections':'Off · show all sections',()=>{prefs.readingFocus=!prefs.readingFocus;applyPrefs();renderAssist()}));
 results.append(focused);
 const dock=n('div','v2cb-setting-action');dock.append(n('span','','Bottom playback dock'));
 dock.append(b(prefs.dock?'Shown':'Hidden',()=>{prefs.dock=!prefs.dock;applyPrefs();renderAssist()}));results.append(dock);
 const custom=n('div','v2cb-setting-shortcuts');custom.append(n('h4','','Keyboard shortcuts'));
 custom.append(n('p','','Play / pause: Space · Save: Ctrl/⌘+S · Split: S · Add: N'));
 select('Replay shortcut',[['r','Shift + R'],['a','Shift + A']],prefs.replayKey,v=>{prefs.replayKey=v;applyPrefs()});
 select('Bookmark shortcut',[['b','Shift + B'],['m','Shift + M']],prefs.bookmarkKey,v=>{prefs.bookmarkKey=v;applyPrefs()});
 results.append(custom);
 results.append(b('Toggle distraction-free focus',()=>{closeAssist();trigger('v2FocusMode')}));
 results.append(b('Restore display defaults',()=>{
  Object.assign(prefs,standard);applyPrefs();renderAssist();showToast('Display preferences restored.');
 },'v2cb-reset'));
 results.append(n('p','v2cb-empty','The waveform uses the actual recording signal. Quiet intervals are shown naturally; no audio content is changed.'));
}
function renderAssist(){
 for(const tab of document.querySelectorAll('[data-v2cb-tab]')){
  const selected=tab.dataset.v2cbTab===activeTab;
  tab.classList.toggle('is-active',selected);tab.setAttribute('aria-selected',String(selected));
 }
 results.replaceChildren();
 if(activeTab==='segments')renderSegments();
 else if(activeTab==='quality')renderQuality();
 else if(activeTab==='tags')renderTags();
 else renderSettings();
}
function requestRefresh(){
 if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;refresh()});
}
function refresh(){
 const all=segments();
 $('v2cbWordCount').textContent=all.reduce((sum,s)=>sum+words(s.transcript),0)+' words · '+all.length+' sections';
 updateDock();
 quality();
 if(!assist.hidden&&['segments','quality'].includes(activeTab))renderAssist();
 if($('v2cbFindbar')&&!$('v2cbFindbar').hidden)refreshMatches(true);
}
new MutationObserver(requestRefresh).observe(rows,{childList:true});
rows.addEventListener('input',requestRefresh);
rows.addEventListener('change',requestRefresh);
new MutationObserver(()=>{requestAnimationFrame(updateIssueHighlights)}).observe(flow,{childList:true});
window.addEventListener('txv2:guidelines-updated',requestRefresh);

// Find and safe one-match replacement through the original segment textarea event handler.
const findBar=$('v2cbFindbar'),findInput=$('v2cbFindText'),replaceRow=$('v2cbReplaceRow');
let matches=[],matchIndex=-1,lastQuery='';
function toggleFind(show){
 findBar.hidden=!show;
 if(show){findInput.focus({preventScroll:true});refreshMatches(false)}
 else{matches=[];matchIndex=-1;markMatches();}
}
$('v2cbFindOpen').addEventListener('click',()=>toggleFind(findBar.hidden));
$('v2cbFindClose').addEventListener('click',()=>toggleFind(false));
$('v2cbReplaceToggle').addEventListener('click',()=>{
 replaceRow.hidden=!replaceRow.hidden;
 $('v2cbReplaceToggle').setAttribute('aria-expanded',String(!replaceRow.hidden));
 if(!replaceRow.hidden)$('v2cbReplaceText').focus({preventScroll:true});
});
function collectMatches(){
 const query=findInput.value.trim();if(!query)return [];
 const needle=query.toLocaleLowerCase(),found=[];
 for(const [i,s] of segments().entries()){
  const txt=String(s.transcript||''),lower=txt.toLocaleLowerCase();let at=0,limit=0;
  while((at=lower.indexOf(needle,at))>=0&&limit<250&&found.length<1500){
   found.push({id:s.id,at,end:at+query.length,i,text:txt});
   at+=Math.max(1,needle.length);limit++;
  }
  if(found.length>=1500)break;
 }
 return found;
}
function markMatches(){
 const ids=new Set(matches.map(x=>String(x.id)));
 const cur=matches[matchIndex]?.id;
 for(const el of flow.querySelectorAll('[data-edit-segment]')){
  el.classList.toggle('v2cb-find-match',ids.has(el.dataset.editSegment));
  el.classList.toggle('v2cb-find-current',el.dataset.editSegment===String(cur||''));
 }
}
function refreshMatches(preserve=true){
 const same=findInput.value===lastQuery,old=matches[matchIndex];
 matches=collectMatches();lastQuery=findInput.value;
 if(!same||!preserve)matchIndex=matches.length?0:-1;
 else if(old){const i=matches.findIndex(x=>x.id===old.id&&x.at===old.at);matchIndex=i>=0?i:matches.length?0:-1}
 $('v2cbFindCount').textContent=matches.length?String(matchIndex+1)+' / '+matches.length+' matches':'0 matches';
 for(const id of ['v2cbFindPrev','v2cbFindNext','v2cbReplaceCurrent'])$(id).disabled=!matches.length;
 markMatches();
}
function moveMatch(delta){
 if(!matches.length)return;
 matchIndex=(matchIndex+delta+matches.length)%matches.length;
 $('v2cbFindCount').textContent=String(matchIndex+1)+' / '+matches.length+' matches';
 const m=matches[matchIndex];gotoSegment(m.id,false,false);markMatches();
}
findInput.addEventListener('input',()=>refreshMatches(false));
findInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();moveMatch(e.shiftKey?-1:1)}});
$('v2cbFindPrev').addEventListener('click',()=>moveMatch(-1));
$('v2cbFindNext').addEventListener('click',()=>moveMatch(1));
$('v2cbReplaceCurrent').addEventListener('click',()=>{
 const m=matches[matchIndex],term=findInput.value;
 if(!m||!term)return showToast('Choose a search match first.',true);
 if(!isEditable())return showToast('This transcript is read only.',true);
 if(flow.querySelector('.v2-inline-editor'))return showToast('Finish editing the paragraph line before replacing.',true);
 let row=rows.querySelector('tr[data-segment="'+CSS.escape(m.id)+'"]');
 if(!row){
  $('speakerFilter').value='';$('speakerFilter').dispatchEvent(new Event('change',{bubbles:true}));
  $('textSearch').value='';$('textSearch').dispatchEvent(new Event('input',{bubbles:true}));
  row=rows.querySelector('tr[data-segment="'+CSS.escape(m.id)+'"]');
 }
 const textarea=row?.querySelector('textarea[data-field="transcript"]');
 if(!textarea||textarea.readOnly)return showToast('This segment cannot be edited right now.',true);
 const original=textarea.value;
 if(original.slice(m.at,m.end).toLocaleLowerCase()!==term.toLocaleLowerCase()){
  refreshMatches(false);return showToast('The transcript changed; please select the match again.',true);
 }
 const replacement=$('v2cbReplaceText').value;
 textarea.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
 textarea.value=original.slice(0,m.at)+replacement+original.slice(m.end);
 textarea.dispatchEvent(new Event('input',{bubbles:true}));
 showToast('Replaced one occurrence. Undo is available.');
 requestAnimationFrame(()=>refreshMatches(false));
});

// Enhance the existing approved NST options with search and usage hints.
// Never add, remove or guess approved tags; all inserts use native toolbar buttons.
const opts=$('v2InlineOptions');
if(opts)new MutationObserver(()=>{
 if(opts.hidden||opts.querySelector('.v2cb-tag-filter'))return;
 const original=[...opts.children].filter(x=>x.tagName==='BUTTON');
 if(original.length<2)return;
 const search=n('input','v2cb-tag-filter');search.type='search';search.placeholder='Filter approved tags…';
 search.setAttribute('aria-label','Filter approved tags');
 opts.insertBefore(search,opts.firstElementChild?.nextSibling||null);
 for(const btn of original){
  if(tagDescriptions[btn.textContent])btn.title=tagDescriptions[btn.textContent];
 }
 search.addEventListener('input',()=>{
  const q=search.value.trim().toLowerCase();
  for(const btn of original)btn.hidden=Boolean(q&&!btn.textContent.toLowerCase().includes(q));
 });
}).observe(opts,{childList:true});

// Keyboard commands respect native inputs, dialogue overlays and contenteditable text.
document.addEventListener('keydown',e=>{
 const el=e.target;
 if(!assist.hidden){
  if(e.key==='Escape'){e.preventDefault();closeAssist();return}
  if(e.key==='Tab'){
   const focusables=[...assist.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled])')].filter(x=>x.getClientRects().length);
   if(!focusables.length)return;
   if(e.shiftKey&&document.activeElement===focusables[0]){e.preventDefault();focusables.at(-1).focus()}
   else if(!e.shiftKey&&document.activeElement===focusables.at(-1)){e.preventDefault();focusables[0].focus()}
  }
  return;
 }
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'&&!e.shiftKey){
  if(document.querySelector('dialog[open]'))return;
  e.preventDefault();toggleFind(true);findInput.select();return;
 }
 if(e.key==='Escape'&&!findBar.hidden){toggleFind(false);return}
 const typing=el?.isContentEditable||Boolean(el?.closest?.('input,textarea,select,[contenteditable]'));
 if(typing||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey)return;
 if(e.shiftKey&&!e.altKey){
  if(e.key.toLowerCase()===prefs.replayKey){e.preventDefault();replay3();return}
  if(e.key.toLowerCase()===prefs.bookmarkKey){e.preventDefault();addBookmark();return}
  if(e.key.toLowerCase()==='t'){e.preventDefault();openAssist();return}
 }
 if(e.altKey&&(e.key==='ArrowDown'||e.key==='ArrowUp')){
  e.preventDefault();const list=segments().slice().sort((a,b)=>a.start_ms-b.start_ms);
  if(!list.length)return;
  const now=activeSegment(),index=list.findIndex(s=>s.id===now?.id);
  const next=list[cap(index+(e.key==='ArrowDown'?1:-1),0,list.length-1)];
  if(next)gotoSegment(next.id,true,false);
 }
});
function syncTimer(){updateDock();requestRefresh()}
audio.addEventListener('loadedmetadata',syncTimer);
setTimeout(requestRefresh,200);
})();
