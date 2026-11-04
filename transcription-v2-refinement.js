(()=>{
'use strict';
// Additive, reversible UX enhancements. All authoritative playback, editing,
// saving, QA, and submission actions remain owned by existing controllers.
const root=document.body,$=id=>document.getElementById(id);
if(!root.classList.contains('tx-v2-editor'))return;
const flow=$('v2CaptionFlow'),slider=$('v2cbTranscriptHeight'),resize=$('v2cbTranscriptResize'),
  preview=$('v2cbPreviewToggle'),slideEditor=$('v2SlideEditor'),nativePlayer=document.querySelector('.player-bar'),
  floatingDock=$('v2cbBottomDock'),resume=$('v2cbResumeFollow'),follow=$('v2FollowAudio'),
  inspector=$('v2cbAssist'),backdrop=$('v2cbAssistBackdrop'),inspectorGrip=$('v2cbInspectorResize'),
  submitHint=$('v2cbSubmitHint');
if(!flow||!slider||!resize||!nativePlayer||!floatingDock||!inspector||!inspectorGrip)return;
const storeKey='adatacore:txv2:studio-refinement:v1';
let saved={};try{saved=JSON.parse(localStorage.getItem(storeKey))||{}}catch(_){}
const pref={
 previewCollapsed:typeof saved.previewCollapsed==='boolean'?saved.previewCollapsed:false,
 inspectorWidth:Math.max(300,Math.min(540,Number(saved.inspectorWidth)||385))
};
const savePrefs=()=>{try{localStorage.setItem(storeKey,JSON.stringify(pref))}catch(_){}};
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,Number(x)||lo));
const delegate=(id)=>{const b=$(id);if(b&&!b.disabled)b.click()};
const reduceMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
function captionPreview(){
 const editing=Boolean(slideEditor&&!slideEditor.hidden);
 const hidden=Boolean(pref.previewCollapsed&&!editing);
 root.classList.toggle('v2cb-preview-collapsed',hidden);
 if(preview){
  preview.setAttribute('aria-pressed',String(!hidden));
  preview.textContent=hidden?'▣ Show preview':'▣ Preview';
  preview.title=hidden?'Show current-caption preview':'Hide current-caption preview';
 }
}
preview?.addEventListener('click',()=>{pref.previewCollapsed=!pref.previewCollapsed;savePrefs();captionPreview()});
if(slideEditor)new MutationObserver(captionPreview).observe(slideEditor,{attributes:true,attributeFilter:['hidden']});
$('v2cbReplayLine')?.addEventListener('click',()=>delegate('v2SlideReplay'));
$('v2cbEditLine')?.addEventListener('click',()=>{
 pref.previewCollapsed=false;captionPreview();
 delegate('v2SlideEdit');
});
captionPreview();
// The original player stays on the waveform. The floating dock is only
// presented when those same controls are no longer in the viewport.
let playerVisible=true;
function floatingTransport(){
 const visible=playerVisible&&nativePlayer.getClientRects().length>0;
 floatingDock.hidden=visible;
 floatingDock.setAttribute('aria-hidden',String(visible));
}
if('IntersectionObserver'in window){
 const observer=new IntersectionObserver(entries=>{
  playerVisible=Boolean(entries[0]?.isIntersecting&&entries[0].intersectionRatio>=.12);
  floatingTransport();
 },{threshold:[0,.12,.30,.7]});
 observer.observe(nativePlayer);
}else{
 const check=()=>{
  const r=nativePlayer.getBoundingClientRect();
  playerVisible=r.bottom>0&&r.top<innerHeight;
  floatingTransport();
 };
 window.addEventListener('scroll',check,{passive:true});
 window.addEventListener('resize',check,{passive:true});
 check();
}
floatingTransport();
// Suspend only the auto-scroll while users manually scroll/select/edit text.
// This does not pause actual audio or change the checked 'follow audio' option.
let suspended=false;
function pauseFollowing(){
 if(suspended||!follow?.checked||flow.clientHeight===0)return;
 suspended=true;
 root.classList.add('v2cb-follow-suspended');
 resume.hidden=false;
}
function restoreFollowing(){
 suspended=false;
 root.classList.remove('v2cb-follow-suspended');
 resume.hidden=true;
 if(follow&&!follow.checked){
  follow.checked=true;
  follow.dispatchEvent(new Event('change',{bubbles:true}));
 }
 const active=flow.querySelector('[aria-current="true"]');
 if(active){
  const outer=flow.getBoundingClientRect(),r=active.getBoundingClientRect();
  const top=flow.scrollTop+r.top-outer.top-Math.max(20,flow.clientHeight*.27);
  flow.scrollTo({top:Math.max(0,top),behavior:reduceMotion()?'instant':'smooth'});
 }
}
flow.addEventListener('wheel',pauseFollowing,{passive:true});
flow.addEventListener('touchstart',pauseFollowing,{passive:true});
flow.addEventListener('pointerdown',e=>{
 if(e.target.closest('[data-edit-segment],.v2-inline-editor'))pauseFollowing();
},{passive:true});
resume.addEventListener('click',restoreFollowing);
follow?.addEventListener('change',()=>{if(!follow.checked&&suspended){suspended=false;root.classList.remove('v2cb-follow-suspended');resume.hidden=true}});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&suspended&&document.activeElement===resume)restoreFollowing();
});
// Drag-to-resize provides direct manipulation of the existing transcript height
// slider, preserving its built-in persistence and the original reading view.
slider.step='5';
function updateHeight(value,persist){
 const height=Math.round(clamp(value,235,720)/5)*5;
 slider.value=String(clamp(height,235,720));
 slider.dispatchEvent(new Event('input',{bubbles:true}));
 if(persist)slider.dispatchEvent(new Event('change',{bubbles:true}));
 resize.setAttribute('aria-valuenow',slider.value);
}
let dragHeight=null;
resize.addEventListener('pointerdown',e=>{
 if(e.button!==0)return;
 e.preventDefault();
 const startY=e.clientY,base=Number(slider.value)||395;
 dragHeight={startY,base,id:e.pointerId};
 root.classList.add('v2cb-resizing-text');
 resize.setPointerCapture(e.pointerId);
});
resize.addEventListener('pointermove',e=>{
 if(!dragHeight||e.pointerId!==dragHeight.id)return;
 updateHeight(dragHeight.base+e.clientY-dragHeight.startY,false);
});
function stopHeightDrag(e){
 if(!dragHeight||e.pointerId!==dragHeight.id)return;
 dragHeight=null;root.classList.remove('v2cb-resizing-text');
 updateHeight(slider.value,true);
}
resize.addEventListener('pointerup',stopHeightDrag);
resize.addEventListener('pointercancel',stopHeightDrag);
resize.addEventListener('keydown',e=>{
 const key=e.key,now=Number(slider.value)||395;
 const target=key==='ArrowUp'?now-15:key==='ArrowDown'?now+15:key==='PageUp'?now-65:
  key==='PageDown'?now+65:key==='Home'?235:key==='End'?720:null;
 if(target===null)return;
 e.preventDefault();updateHeight(target,true);
});
slider.addEventListener('input',()=>resize.setAttribute('aria-valuenow',slider.value));
resize.setAttribute('aria-valuenow',slider.value);
// Wide screens get a docked inspector. Small screens retain the original
// modal drawer/backdrop. No mutation of existing editor or sidebar actions.
function inspectorWidth(v,persist){
 pref.inspectorWidth=Math.round(clamp(v,300,540));
 root.style.setProperty('--v2cb-inspector-width',pref.inspectorWidth+'px');
 inspectorGrip.setAttribute('aria-valuenow',String(pref.inspectorWidth));
 if(persist)savePrefs();
}
inspectorWidth(pref.inspectorWidth,false);
function syncInspector(){
 const shown=!inspector.hidden,wide=window.innerWidth>=1180;
 const docked=shown&&wide;
 root.classList.toggle('v2cb-refine-inspector-docked',docked);
 inspectorGrip.hidden=!docked;
 if(docked){
  inspector.setAttribute('role','complementary');
  inspector.removeAttribute('aria-modal');
 }else{
  inspector.setAttribute('role','dialog');
  inspector.setAttribute('aria-modal','true');
 }
}
new MutationObserver(syncInspector).observe(inspector,{attributes:true,attributeFilter:['hidden']});
window.addEventListener('resize',syncInspector,{passive:true});
syncInspector();
let dragInspector=null;
inspectorGrip.addEventListener('pointerdown',e=>{
 if(e.button!==0||!root.classList.contains('v2cb-refine-inspector-docked'))return;
 e.preventDefault();
 dragInspector={x:e.clientX,width:pref.inspectorWidth,id:e.pointerId};
 root.classList.add('v2cb-resizing-inspector');
 inspectorGrip.setPointerCapture(e.pointerId);
});
inspectorGrip.addEventListener('pointermove',e=>{
 if(!dragInspector||dragInspector.id!==e.pointerId)return;
 inspectorWidth(dragInspector.width+dragInspector.x-e.clientX,false);
});
function endInspectorDrag(e){
 if(!dragInspector||dragInspector.id!==e.pointerId)return;
 dragInspector=null;root.classList.remove('v2cb-resizing-inspector');
 inspectorWidth(pref.inspectorWidth,true);
}
inspectorGrip.addEventListener('pointerup',endInspectorDrag);
inspectorGrip.addEventListener('pointercancel',endInspectorDrag);
inspectorGrip.addEventListener('keydown',e=>{
 const value=e.key==='ArrowLeft'?pref.inspectorWidth+20:e.key==='ArrowRight'?pref.inspectorWidth-20:
  e.key==='Home'?300:e.key==='End'?540:null;
 if(value===null)return;
 e.preventDefault();inspectorWidth(value,true);
});
// An informational hint only. The server remains the authority for listening
// completion and the existing editor controls continue to enforce that gate.
function submissionHint(){
 const s=window.txV2Snapshot?.();
 const l=window.txV2ListeningUIState;
 if(!s?.project_id||Number(s.project_id)!==93||!s.editable){
  submitHint.hidden=true;return;
 }
 const applies=s.mode==='contributor'||(s.mode==='admin'&&
   !['submitted','in_review','approved','reviewed'].includes(s.status));
 if(!applies||l?.required===false){submitHint.hidden=true;return}
 if(l?.complete===true){submitHint.hidden=true;return}
 submitHint.hidden=false;
 submitHint.textContent=l?.syncError?'Listening progress needs syncing':
  l?.total?('Listen to all audio · '+l.verifiedPercent+'% verified'):
  'Listen to all audio to unlock submission';
}
window.addEventListener('txv2:listening',submissionHint);
const watchLoad=setInterval(()=>{
 submissionHint();
 if(window.txV2Snapshot?.()?.project_id)clearInterval(watchLoad);
},400);
setTimeout(()=>clearInterval(watchLoad),40000);
})();
