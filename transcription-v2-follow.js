(()=>{
'use strict';
// Follow-along layer for Transcription V2. Transcripts remain owned by the existing
// transcription controller; this view reads its segment rows and forwards edits through
// the same input events, autosave, undo and review workflow.
const $=id=>document.getElementById(id);
const audio=$('audio'),rows=$('segmentRows'),root=document.body,slide=$('v2SlideView'),flow=$('v2CaptionFlow'),panel=$('v2CaptionPanel');
if(!audio||!rows||!slide||!panel)return;
const model=window.TranscriptionModel;
const controls={
 count:$('v2SlideCount'),time:$('v2SlideTime'),status:$('v2SlideStatus'),
 percent:$('v2SlidePercent'),progress:$('v2SlideProgress'),fill:$('v2SlideProgressFill'),
 text:$('v2SlideText'),editor:$('v2SlideEditor'),editorLabel:$('v2SlideEditorLabel'),
 previous:$('v2SlidePrev'),next:$('v2SlideNext'),upcoming:$('v2SlideUpcoming'),
 edit:$('v2SlideEdit'),replay:$('v2SlideReplay'),follow:$('v2FollowAudio'),
 full:$('v2SlideAll')
};
let timeline=[],currentId=null,editingText=false,frame=0,lastAudioTime=-1,lastWaveSync=0;
let stageContent=null,initialised=false;
root.classList.add('v2-slideshow');
const parse=value=>model?.parseTime?.(value)??NaN;
const format=ms=>model?.time?.(ms,false)||'00:00';
const tokens=/(<\/?[^<>]{1,100}>|\[[^\]\n]{1,55}\]|\{(?:PRO:[^}\n]{1,140}|\d{1,12})\}|\*[^*\n]{1,80}\*)/g;
function renderTags(target,value){
 const source=String(value||'');
 target.replaceChildren();
 let last=0;
 for(const m of source.matchAll(tokens)){
  if(m.index>last)target.append(document.createTextNode(source.slice(last,m.index)));
  const node=document.createElement('span');
  node.className='v2-inline-token '+(m[0][0]==='['?'v2-inline-nst':m[0][0]==='{'?'v2-inline-pro':m[0][0]==='*'?'v2-inline-emphasis':'v2-inline-tag');
  node.textContent=m[0];
  target.append(node);
  last=m.index+m[0].length;
 }
 if(last<source.length)target.append(document.createTextNode(source.slice(last)));
 if(!source.trim()){const span=document.createElement('span');span.className='v2-slide-placeholder';span.textContent='No text yet. Click “Edit this line” to transcribe this section.';target.append(span)}
}
function readSegments(){
 const list=[];
 for(const row of rows.querySelectorAll('tr[data-segment]')){
  const id=row.dataset.segment,field=row.querySelector('textarea[data-field="transcript"]');
  const start=parse(row.querySelector('[data-field="start_ms"]')?.value);
  const end=parse(row.querySelector('[data-field="end_ms"]')?.value);
  if(!id||!field||!Number.isFinite(start)||!Number.isFinite(end))continue;
  list.push({id,row,field,start,end,text:field.value});
 }
 list.sort((a,b)=>a.start-b.start||a.end-b.end);
 return list;
}
function index(){return timeline.findIndex(s=>s.id===currentId)}
function segmentAt(ms){
 if(!timeline.length)return null;
 let position=0;
 for(let i=0;i<timeline.length;i++){
  if(ms<timeline[i].start)break;
  position=i;
 }
 // For overlapping speakers, prefer a segment that actually spans the playhead.
 for(let j=position;j>=0;j--)if(ms>=timeline[j].start&&ms<timeline[j].end)return timeline[j];
 return timeline[position];
}
function updateProgress(ms=audio.currentTime*1000){
 const s=timeline.find(x=>x.id===currentId);
 if(!s){controls.fill.style.width='0%';controls.progress.setAttribute('aria-valuenow','0');controls.percent.textContent='0%';return}
 const percent=Math.max(0,Math.min(100,((ms-s.start)/Math.max(1,s.end-s.start))*100));
 const n=Math.round(percent);
 controls.fill.style.width=percent.toFixed(2)+'%';
 controls.progress.setAttribute('aria-valuenow',String(n));
 controls.percent.textContent=n+'%';
 const playing=!audio.paused&&ms>=s.start&&ms<s.end;
 controls.status.textContent=playing?'● PLAYING':editingText?'EDITING CAPTION':'CURRENT SECTION';
 root.classList.toggle('v2-slide-playing',playing);
}
function paintSlide(force=false){
 const i=index(),s=timeline[i];if(!s)return;
 const next=timeline[i+1]||null;
 controls.count.textContent='Line '+(i+1)+' of '+timeline.length;
 controls.time.textContent=format(s.start)+' – '+format(s.end);
 controls.previous.disabled=i===0;
 controls.next.disabled=i===timeline.length-1;
 controls.upcoming.disabled=!next;
 controls.upcoming.textContent=next?(next.text.trim()||'Next section is not yet transcribed'):'End of transcript';
 controls.edit.disabled=Boolean(s.field.readOnly||s.field.disabled);
 controls.edit.textContent=editingText?'✓ Done editing':'✎ Edit this line';
 controls.editorLabel.hidden=!editingText;
 controls.editor.hidden=!editingText;
 controls.text.hidden=editingText;
 if(!editingText&&(!stageContent||stageContent.id!==s.id||stageContent.text!==s.text||force)){
  renderTags(controls.text,s.text);
  stageContent={id:s.id,text:s.text};
 }
 if(editingText&&document.activeElement!==controls.editor&&controls.editor.value!==s.text)controls.editor.value=s.text;
 updateProgress();
 highlightFull();
}
function highlightFull(){
 if(!flow)return;
 const active=flow.querySelector('[data-edit-segment="'+CSS.escape(String(currentId||''))+'"]');
 for(const b of flow.querySelectorAll('[data-edit-segment]')){
  const isActive=b===active;
  b.classList.toggle('v2-caption-active',isActive);
  if(isActive)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');
 }
 if(!active||!controls.follow.checked||editingText||!flow.clientHeight||
    root.classList.contains('v2cb-follow-suspended')||
    flow.querySelector('.v2-inline-editor')||!controls.editor.hidden)return;
 // Scroll only the transcript reading area, never the full page. Keep the
 // currently spoken words near the upper middle with comfortable context.
 const rect=active.getBoundingClientRect(),outer=flow.getBoundingClientRect();
 if(rect.top>=outer.top+30&&rect.bottom<=outer.bottom-40)return;
 const top=flow.scrollTop+(rect.top-outer.top)-Math.max(28,flow.clientHeight*.28);
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const preferred=typeof window.txV2CBScrollBehavior==='function'?window.txV2CBScrollBehavior():'smooth';
 flow.scrollTo({top:Math.max(0,top),behavior:reduced?'instant':preferred});
}
function setActive(id,{seek=false,play=false}={}){
 const s=timeline.find(s=>s.id===id);
 if(!s)return;
 const changed=s.id!==currentId;
 if(editingText&&changed)stopEditing();
 currentId=s.id;
 paintSlide(changed);
 if(seek){
  const fn=window.txV2SeekTo;
  if(typeof fn==='function')fn(s.start,play);
  else{audio.currentTime=s.start/1000;if(play&&audio.paused)$('play')?.click()}
  keepWaveVisible(true);
 }
 if(changed&&slide.classList.contains('v2-slide-enter'))slide.classList.remove('v2-slide-enter');
 if(changed&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  // Animate the content only: never move the full page.
  void slide.offsetWidth;
  slide.classList.add('v2-slide-enter');
 }
}
function rebuild(){
 timeline=readSegments();
 const existing=timeline.some(s=>s.id===currentId);
 panel.hidden=timeline.length===0;
 slide.hidden=timeline.length===0;
 if(!timeline.length){
  currentId=null;stageContent=null;return;
 }
 if(!existing)currentId=segmentAt(audio.currentTime*1000)?.id||timeline[0].id;
 initialised=true;
 paintSlide(true);
 // When existing lines are edited in the full editor, refresh this view too.
}
function scheduleRebuild(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;rebuild()})}
function followPlayback(){
 if(!timeline.length)return;
 const ms=audio.currentTime*1000;
 if(controls.follow.checked&&!editingText){
  const match=segmentAt(ms);
  if(match&&match.id!==currentId)setActive(match.id);
 }
 if(Math.abs(ms-lastAudioTime)>15||audio.paused!==root.classList.contains('v2-slide-playing')){
  updateProgress(ms);lastAudioTime=ms;
 }
 if(controls.follow.checked&&!editingText&&!audio.paused)keepWaveVisible();
}
function keepWaveVisible(force=false){
 const scroller=$('waveScroller'),content=$('waveContent');
 if(!scroller||!content||!Number.isFinite(audio.duration)||audio.duration<=0)return;
 if(!force&&!controls.follow.checked)return;
 const now=performance.now();if(!force&&now-lastWaveSync<180)return;lastWaveSync=now;
 const viewport=scroller.clientWidth,full=content.scrollWidth,label=64;
 if(full<=viewport+8||viewport<80)return;
 const position=label+Math.min(1,Math.max(0,audio.currentTime/audio.duration))*Math.max(0,full-label);
 const left=scroller.scrollLeft,right=left+viewport;
 if(force||position<left+viewport*.13||position>right-viewport*.20){
  scroller.scrollLeft=Math.max(0,Math.min(full-viewport,position-viewport*.35));
 }
}
function navigate(delta){
 const i=index();if(i<0)return;
 const target=timeline[Math.max(0,Math.min(timeline.length-1,i+delta))];if(!target)return;
 setActive(target.id,{seek:true});
}
function startEditing(){
 const s=timeline[index()];if(!s||s.field.readOnly||s.field.disabled)return;
 audio.pause();editingText=true;
 controls.editor.value=s.field.value;
 paintSlide(true);
 try{controls.editor.focus({preventScroll:true})}catch(_){controls.editor.focus()}
 controls.editor.setSelectionRange(controls.editor.value.length,controls.editor.value.length);
}
function stopEditing(){
 if(!editingText)return;
 editingText=false;
 if(document.activeElement===controls.editor)controls.editor.blur();
 paintSlide(true);
}
controls.previous.addEventListener('click',()=>navigate(-1));
controls.next.addEventListener('click',()=>navigate(1));
controls.upcoming.addEventListener('click',()=>navigate(1));
controls.replay.addEventListener('click',()=>{
 const s=timeline[index()];if(!s)return;
 stopEditing();setActive(s.id,{seek:true,play:true});
});
controls.edit.addEventListener('click',()=>editingText?stopEditing():startEditing());
controls.editor.addEventListener('input',()=>{
 const s=timeline[index()];if(!s)return;
 s.field.value=controls.editor.value;
 s.text=controls.editor.value;
 s.field.dispatchEvent(new Event('input',{bubbles:true}));
 stageContent=null;
});
controls.editor.addEventListener('keydown',e=>{
 if(e.key==='Escape'){e.preventDefault();stopEditing()}
});
controls.follow.addEventListener('change',()=>{
 if(controls.follow.checked){
  stopEditing();const s=segmentAt(audio.currentTime*1000);
  if(s)setActive(s.id);keepWaveVisible(true);
 }
});
controls.full.addEventListener('click',()=>{
 const expanded=!root.classList.contains('v2-slide-show-all');
 root.classList.toggle('v2-slide-show-all',expanded);
 controls.full.textContent=expanded?'Collapse transcript ↑':'Expand transcript ↓';
 controls.full.setAttribute('aria-expanded',String(expanded));
 if(expanded)highlightFull();
});
window.addEventListener('v2:goto-caption',e=>{
 const id=e.detail?.id;if(id)setActive(id,{seek:true});
});
window.addEventListener('v2:edit-caption',e=>{
 const id=e.detail?.id;
 if(!id)return;
 // New blank segments stay in a fixed-height editor; do not scroll to the bottom.
 rebuild();
 setActive(id);
 startEditing();
});
rows.addEventListener('input',scheduleRebuild);
rows.addEventListener('change',scheduleRebuild);
new MutationObserver(scheduleRebuild).observe(rows,{childList:true});
if(flow)new MutationObserver(highlightFull).observe(flow,{childList:true});
for(const eventName of ['timeupdate','seeked','seeking','play','pause','ended','loadedmetadata']){
 audio.addEventListener(eventName,followPlayback);
}
$('lanes')?.addEventListener('pointerup',e=>{
 const region=e.target.closest('[data-region]');
 if(!region||e.target.closest('[data-edge]'))return;
 const id=region.dataset.region;
 queueMicrotask(()=>{if(timeline.some(s=>s.id===id))setActive(id)});
});
const waveform=document.querySelector('.v2-wave-card'),transport=document.querySelector('.player-bar');
if(waveform&&transport){
 // Dock the actual playback transport with the timeline so it stays available
 // when the user is correcting the very last caption.
 waveform.append(transport);
 root.classList.add('v2-audio-docked');
}
rebuild();
followPlayback();
})();