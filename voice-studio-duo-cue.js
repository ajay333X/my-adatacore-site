/* Progressive dialogue cue helper: optional browser speech recognition, never required to record. */
(function(root){
'use strict';
const normalize=s=>String(s||'').toLocaleLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
const tokenize=s=>normalize(s).split(' ').filter(x=>x.length>=2);
function matches(spoken,expected){
 const said=normalize(spoken),line=normalize(expected);
 if(!said||!line||said.length<8)return false;
 if(said.includes(line)&&line.length>=8||line.includes(said)&&said.length>=Math.max(10,line.length*.5))return true;
 const a=new Set(tokenize(said)),b=[...new Set(tokenize(line))];
 return b.length>=2&&b.filter(t=>a.has(t)).length/Math.min(b.length,Math.max(2,a.size))>=.72;
}
let active=null;
function dispose(){if(active){active.destroy();active=null}}
function mount(host,dialog,script,role){
 if(!host||!dialog||!script||!role)return;
 if(active&&active.dialog===dialog&&active.key===script+'|'+role)return;
 dispose();
 const rows=[...dialog.querySelectorAll('.vs-dialog-line')];
 const parsed=(root.VoiceDuoScript?.scriptLines(script)||[]).filter(x=>!x.blank);
 if(rows.length!==parsed.length||!rows.length)return;
 const own=parsed.map((x,i)=>x.role===role?i:-1).filter(i=>i>=0);
 let index=0,listener=null,wanted=false;
 const recognitionType=root.SpeechRecognition||root.webkitSpeechRecognition;
 host.replaceChildren();
 const title=document.createElement('div');title.className='vs-cue-title';
 title.textContent='Dialogue guide · Follow the script';
 const toolbar=document.createElement('div');toolbar.className='vs-cue-controls';
 const previous=document.createElement('button'),next=document.createElement('button'),enable=document.createElement('button');
 for(const b of [previous,next,enable]){b.type='button';b.className='btn small'}
 previous.textContent='← Previous';next.textContent='Next line →';enable.textContent='Enable voice cues';
 const status=document.createElement('span');status.className='vs-cue-state';status.setAttribute('aria-live','polite');
 const text=document.createElement('p');text.className='vs-cue-preview';
 function paint(scroll=false){
  rows.forEach((row,i)=>{row.classList.toggle('vs-dialog-current',i===index);row.classList.toggle('vs-dialog-completed',i<index);row.setAttribute('aria-current',i===index?'step':'false')});
  const row=parsed[index];const speaker=row.role==='agent'?'Agent':row.role==='customer'?'Customer':'Script';
  const mine=row.role===role;
  text.textContent=(mine?'Your line':'Partner / narration')+' · '+speaker+': '+row.text;
  previous.disabled=index<=0;next.disabled=index>=rows.length-1;
  if(scroll)rows[index]?.scrollIntoView({block:'nearest',behavior:root.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 }
 const advance=(delta,scroll=true)=>{index=Math.min(rows.length-1,Math.max(0,index+delta));paint(scroll)};
 previous.onclick=()=>advance(-1);next.onclick=()=>advance(1);
 const stop=()=>{
  wanted=false;
  if(listener){const r=listener;listener=null;r.onend=null;r.onresult=null;r.onerror=null;try{r.stop()}catch{}}
  enable.textContent='Enable voice cues';enable.setAttribute('aria-pressed','false');
  status.textContent='Manual controls available';
 };
 const start=()=>{
  if(!recognitionType){status.textContent='Speech recognition unavailable; use Next line.';return}
  wanted=true;
  const recognition=new recognitionType();
  listener=recognition;recognition.lang='hi-IN';recognition.continuous=true;recognition.interimResults=false;
  recognition.onresult=e=>{
   for(let i=e.resultIndex;i<e.results.length;i++){
    const result=e.results[i];if(!result.isFinal)continue;
    const spoken=result[0]?.transcript||'';
    if(parsed[index]?.role===role&&matches(spoken,parsed[index].text)){advance(1);status.textContent='Line detected · next line suggested'}
    else status.textContent='Listening · use Next line if recognition misses';
   }
  };
  recognition.onerror=e=>{status.textContent='Voice cues unavailable ('+(e.error||'browser error')+'). Use manual controls.';stop()};
  recognition.onend=()=>{if(!wanted||listener!==recognition)return;listener=null;status.textContent='Recognition stopped · re-enable to continue';wanted=false;enable.textContent='Enable voice cues';enable.setAttribute('aria-pressed','false')};
  try{recognition.start();enable.textContent='Stop voice cues';enable.setAttribute('aria-pressed','true');status.textContent='Listening to your microphone (optional browser service)'}catch{stop();status.textContent='Could not start recognition; manual guide still works'}
 };
 enable.onclick=()=>wanted?stop():start();
 if(!recognitionType){enable.disabled=true;enable.title='Speech recognition is unavailable in this browser'}
 toolbar.append(previous,next,enable);host.append(title,text,toolbar,status);
 const note=document.createElement('p');note.className='vs-cue-privacy';
 note.textContent='Voice cues are optional and may use your browser’s online speech service. Recognition only follows your microphone; it cannot reliably identify your partner’s remote audio. The full script and manual controls always remain available.';
 host.append(note);paint();
 active={dialog,key:script+'|'+role,destroy:stop};
}
const api={normalize,matches,mount,dispose};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.VoiceDuoCue=api;
})(typeof window!=='undefined'?window:globalThis);
