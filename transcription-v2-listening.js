(()=>{
'use strict';
// Listening coverage for the CB transcription project (93).
// Counts unique intervals the browser reports as PLAYED, not seeks/position.
// Progress is stored by the server per recording+contributor; only server-confirmed
// 100% unlocks submission. Reviewer approvals are excluded; admins testing
// a contributor task have the same requirement as regular contributors.
const $=id=>document.getElementById(id);
const gate=$('v2cbListenGate'),fill=$('v2cbListenFill'),meter=$('v2cbListenMeter'),
      label=$('v2cbListenText'),audio=$('audio'),submit=$('submit');
if(!document.body.classList.contains('tx-v2-editor')||!gate||!fill||!audio||!submit||!window.supabase)return;
const itemId=new URLSearchParams(location.search).get('item');
if(!/^[0-9a-f-]{36}$/i.test(itemId||''))return;
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
const heard=new Set(),pending=new Set();
let total=0,enabled=false,loading=false,saving=false,complete=false,lastSave=0,failed='',hasStarted=false;
window.txV2ListeningReady=false;
const syncButtons=()=>window.txV2RefreshSubmitButtons?.();
const errorMessage=e=>String(e?.message||e||'Network error').replace(/^LISTEN_REQUIRED:\s*/,'');
const rpc=async(name,args)=>{
 const {data,error}=await db.rpc(name,args);
 if(error)throw Error(error.message);
 return data;
};
function render(){
 if(!enabled)return;
 const count=new Set([...heard,...pending]).size;
 const percent=total?Math.min(100,Math.floor((count/total)*100)):0;
 fill.style.width=percent+'%';
 meter.setAttribute('aria-valuenow',String(percent));
 meter.setAttribute('aria-valuetext',total?count+' of '+total+' audio seconds played':'Audio duration unavailable');
 gate.classList.toggle('v2cb-listen-complete',complete);
 gate.classList.toggle('v2cb-listen-pending',Boolean(!complete&&pending.size));
 gate.dataset.error=failed?'true':'false';
 if(complete){
  label.textContent='100% · Full recording played · Ready to submit';
 }else if(failed){
  label.textContent=percent+'% · Progress not synced — reconnect and keep listening';
  gate.title='We could not verify listening progress. Click the bar to retry.';
 }else if(loading){
  label.textContent='Checking listening progress…';
 }else if(percent===100){
  label.textContent='100% · Verifying listening progress…';
 }else{
  label.textContent=percent+'% · Submit unlocks at 100%';
 }
}
function authorize(ready){
 const next=Boolean(ready);
 if(window.txV2ListeningReady!==next){
  window.txV2ListeningReady=next;
  syncButtons();
 }
}
async function loadState(){
 if(loading||complete||!enabled)return;
 loading=true;failed='';render();
 try{
  const response=await rpc('tx_listening_state',{p_item:itemId});
  if(!response?.required){enabled=false;gate.hidden=true;authorize(true);return}
  total=Number(response.total)||0;
  heard.clear();
  for(const sec of Array.isArray(response.seconds)?response.seconds:[]){
   if(Number.isInteger(sec)&&sec>=0&&sec<total)heard.add(sec);
  }
  for(const sec of [...pending])if(heard.has(sec))pending.delete(sec);
  complete=Boolean(response.complete&&total>0&&heard.size>=total);
  authorize(complete);
  failed='';
 }catch(e){failed=errorMessage(e);authorize(false)}
 finally{loading=false;render()}
 if(enabled&&!complete)capturePlayed();
}
// A native TimeRanges collection records audio the browser really rendered;
// seeking or scrubbing alone does not extend HTMLMediaElement.played.
function capturePlayed(){
 if(!enabled||complete||!total)return;
 const duration=Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:total;
 if(duration<=0)return;
 let ranges;
 try{
  const played=audio.played;
  ranges=[];
  for(let i=0;i<played.length;i++){
   const a=Math.max(0,played.start(i)),b=Math.min(duration,played.end(i));
   if(Number.isFinite(a)&&Number.isFinite(b)&&b>a)ranges.push([a,b]);
  }
 }catch(_){return}
 if(!ranges.length)return;
 const covered=new Float64Array(total);
 for(const [a,b] of ranges){
  const from=Math.max(0,Math.floor(a)),to=Math.min(total-1,Math.ceil(b)-1);
  for(let sec=from;sec<=to;sec++){
   covered[sec]+=Math.max(0,Math.min(b,sec+1,duration)-Math.max(a,sec));
  }
 }
 let added=false;
 for(let sec=0;sec<total;sec++){
  if(heard.has(sec)||pending.has(sec))continue;
  const length=Math.max(0,Math.min(duration,sec+1)-sec);
  // Allow only a tiny media-timestamp tolerance, not jumps or skipped seconds.
  if(length>0&&covered[sec]>=Math.max(0.001,length-0.025)){
   pending.add(sec);added=true;
  }
 }
 if(added){render();if(pending.size>=6&&Date.now()-lastSave>=2900)void saveProgress()}
}
async function saveProgress(){
 if(!enabled||complete||loading||saving||!pending.size||!navigator.onLine)return;
 // Leave enough time for the server's 2.25x playback-credit budget to refill.
 if(Date.now()-lastSave<2900)return;
 const batch=[...pending].sort((a,b)=>a-b).slice(0,6);
 saving=true;lastSave=Date.now();
 try{
  const response=await rpc('tx_listening_record',{p_item:itemId,p_seconds:batch});
  if(!response?.required)throw Error('Listening verification is not available');
  const confirmed=new Set((response.seconds||[]).filter(x=>Number.isInteger(x)));
  for(const sec of confirmed)heard.add(sec);
  for(const sec of [...pending])if(heard.has(sec))pending.delete(sec);
  total=Number(response.total)||total;
  complete=Boolean(response.complete&&heard.size>=total&&total>0);
  authorize(complete);
  failed='';
 }catch(e){
  failed=errorMessage(e);
  // Retain unconfirmed seconds for retry; we never unlock from local data.
  authorize(false);
 }finally{saving=false;render()}
 if(!complete&&pending.size&&navigator.onLine&&!failed){
  setTimeout(()=>void saveProgress(),3150);
 }
}
function onMediaTime(){
 if(!enabled||complete)return;
 capturePlayed();
 if(Date.now()-lastSave>3000&&pending.size)void saveProgress();
}
for(const event of ['timeupdate','pause','ended','seeked','durationchange'])
 audio.addEventListener(event,onMediaTime);
audio.addEventListener('ended',()=>{capturePlayed();void saveProgress()});
window.addEventListener('online',()=>{failed='';render();void saveProgress();if(!heard.size)void loadState()});
window.addEventListener('pagehide',()=>{if(pending.size)void saveProgress()});
gate.addEventListener('click',()=>{if(enabled&&!complete){if(failed)void loadState();else void saveProgress()}});
setInterval(()=>{if(enabled&&!complete){capturePlayed();if(pending.size)void saveProgress()}},4800);
const detect=setInterval(()=>{
 if(hasStarted)return;
 const s=window.txV2Snapshot?.();
 if(!s||!s.project_id||!s.mode)return;
 hasStarted=true;clearInterval(detect);
 const isTaskSubmission=(s.mode==='contributor')||(s.mode==='admin'&&['unassigned','assigned','in_progress','changes_requested'].includes(s.status));
 if(Number(s.project_id)!==93||!isTaskSubmission){
  gate.hidden=true;authorize(true);return;
 }
 enabled=true;gate.hidden=false;render();syncButtons();
 void loadState();
},280);
})();
