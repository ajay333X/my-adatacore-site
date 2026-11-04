(()=>{
'use strict';
// Non-destructive presentation layer. Transcripts, audio transport and submissions
// are owned by the original editor; workflow labels use actual task status only.
const $=id=>document.getElementById(id);
const audio=$('audio'),workflow=$('v2cbWorkflow'),status=$('workStatus'),save=$('saveState');
const pane=$('waveScroller'),wave=$('waveContent'),tip=$('v2cbWaveHover');
const modal=$('v2cbCommandDialog'),commandInput=$('v2cbCommandSearch'),commandList=$('v2cbCommandList');
if(!document.body.classList.contains('tx-v2-editor')||!audio||!workflow||!pane||!wave||!tip||!modal)return;
const root=document.body,btn=(id)=>$(id)?.click(),safeText=(el,value)=>{if(el&&el.textContent!==value)el.textContent=value;};
const flag=(name,enabled)=>root.classList.toggle(name,Boolean(enabled));
let lastStatus='',lastSave='',taskLoaded=false,commandPreviousFocus=null,visibleCommands=[];
const source=()=>window.txV2Snapshot?.()||null;
const taskState=()=>{
 const s=source();
 if(!s?.project_id||!s?.mode)return null;
 return String(s.status||'').toLowerCase();
};
function paintWorkflow(){
 const s=taskState();if(!s)return;
 if(s===lastStatus)return;lastStatus=s;taskLoaded=true;
 const title=$('v2cbWorkflowTitle'),details=$('v2cbWorkflowDetail'),step=$('v2cbWorkflowStep');
 const models={
  unassigned:['Audio preparation','Transcription is the current step','01 / 03','draft'],
  assigned:['Ready to transcribe','QA review follows your submission','01 / 03','draft'],
  in_progress:['Transcription in progress','Your work is being saved as a draft','01 / 03','draft'],
  changes_requested:['Corrections requested','Check the reviewer feedback and resubmit','01 / 03','changes'],
  submitted:['Waiting for QA','Your transcript has been submitted for review','02 / 03','queue'],
  in_review:['QA review in progress','Review stage is active for this task','02 / 03','review'],
  approved:['Review approved','Quality review completed','03 / 03','approved'],
  reviewed:['Review completed','This transcription was reviewed','03 / 03','approved']
 };
 const m=models[s]||['Transcription workspace','Follow the current project status','01 / 03','draft'];
 safeText(title,m[0]);safeText(details,m[1]);safeText(step,m[2]);
 workflow.dataset.state=m[3];
 workflow.setAttribute('aria-label',m[0]+'. '+m[1]);
}
function updatePlayer(){
 const playing=!audio.paused&&!audio.ended&&audio.readyState>=2;
 flag('v2cb-playing',playing);
 const duration=Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:0;
 const label=audio.error?'Audio unavailable':!duration?'Audio loading':audio.ended?'Playback complete':playing?'Playing audio':audio.currentTime>0?'Paused':'Ready to play';
 safeText($('v2cbPlayState'),label);
}
function updateSave(){
 const t=String(save?.textContent||'').trim();
 if(t===lastSave)return;lastSave=t;
 flag('v2cb-saving',/^Saving/.test(t));
 flag('v2cb-saved',t==='All changes saved'||t==='Submitted');
 flag('v2cb-unsaved',/Unsaved|Save failed|local/i.test(t));
}
function showWaveHover(e){
 if(e.pointerType==='touch')return;
 const r=wave.getBoundingClientRect();
 const d=Number.isFinite(audio.duration)?audio.duration:0;
 if(!d||r.width<=0)return;
 const x=Math.max(0,Math.min(r.width,e.clientX-r.left));
 const time=Math.max(0,Math.min(d,d*x/r.width)),mins=Math.floor(time/60),secs=Math.floor(time%60);
 tip.textContent=String(mins).padStart(2,'0')+':'+String(secs).padStart(2,'0');
 tip.style.left=x+'px';tip.hidden=false;
}
pane.addEventListener('pointermove',showWaveHover,{passive:true});
pane.addEventListener('pointerleave',()=>tip.hidden=true);
pane.addEventListener('scroll',()=>tip.hidden=true,{passive:true});
for(const event of ['play','playing','pause','ended','waiting','loadedmetadata','error','emptied'])audio.addEventListener(event,updatePlayer);
if(status)new MutationObserver(paintWorkflow).observe(status,{childList:true,subtree:true,characterData:true});
if(save)new MutationObserver(updateSave).observe(save,{childList:true,subtree:true,characterData:true});
const commands=[
 {name:'Play / pause audio',desc:'Toggle audio playback · Space',icon:'▶',action:()=>btn('play')},
 {name:'Replay last 3 seconds',desc:'Listen again · Shift + R',icon:'↶',action:()=>btn('v2cbReplay3')},
 {name:'Jump to unplayed audio',desc:'Play the next uncovered part of this recording',icon:'⌁',action:()=>{if(!window.txV2JumpToUnplayed?.())btn('v2cbJumpGap')}},
 {name:'Find transcript text',desc:'Search and replace a phrase · Ctrl/⌘ + F',icon:'⌕',action:()=>btn('v2cbFindOpen')},
 {name:'Open quality navigator',desc:'View issues and jump to the right segment',icon:'✓',action:()=>{btn('v2cbAssistOpen');document.querySelector('[data-v2cb-tab="quality"]')?.click()}},
 {name:'Open project guidelines',desc:'Approved tags and current transcription rules',icon:'▤',action:()=>btn('v2CBRulesOpen')},
 {name:'Open tagging reference',desc:'Search the project-approved tag list',icon:'◇',action:()=>{btn('v2cbAssistOpen');document.querySelector('[data-v2cb-tab="tags"]')?.click()}},
 {name:'Save transcript draft',desc:'Use the existing server-side save · Ctrl/⌘ + S',icon:'↓',action:()=>btn('save')},
 {name:'Toggle focus mode',desc:'Hide secondary chrome when proofreading',icon:'□',action:()=>btn('v2FocusMode')},
 {name:'View QA review history',desc:'See actual reviewer comments and decisions',icon:'◷',action:()=>btn('historyBtn')},
 {name:'Report audio issue',desc:'Report a timestamped audio problem',icon:'⚑',action:()=>btn('v2ReportAudio')}
];
function drawCommands(){
 const term=commandInput.value.trim().toLowerCase();
 visibleCommands=commands.filter(c=>!term||(c.name+' '+c.desc).toLowerCase().includes(term));
 commandList.replaceChildren();
 if(!visibleCommands.length){
  const empty=document.createElement('p');empty.className='v2cb-command-empty';empty.textContent='No matching actions.';commandList.append(empty);return;
 }
 for(const [i,c] of visibleCommands.entries()){
  const action=document.createElement('button');action.type='button';action.className='v2cb-command-item';action.dataset.index=String(i);
  const icon=document.createElement('span');icon.className='v2cb-command-icon';icon.textContent=c.icon;
  const body=document.createElement('span');body.className='v2cb-command-copy';
  const name=document.createElement('strong');name.textContent=c.name;
  const desc=document.createElement('small');desc.textContent=c.desc;body.append(name,desc);
  const arrow=document.createElement('span');arrow.className='v2cb-command-arrow';arrow.textContent='↵';
  action.append(icon,body,arrow);
  action.addEventListener('click',()=>choose(c));
  commandList.append(action);
 }
}
function openCommands(){
 if(document.querySelector('dialog[open]')&&!modal.open)return;
 commandPreviousFocus=document.activeElement;
 commandInput.value='';drawCommands();
 if(!modal.open)modal.showModal();
 commandInput.focus({preventScroll:true});
}
function choose(c){
 modal.close();
 if(c?.action)c.action();
}
$('v2cbCommandOpen').addEventListener('click',openCommands);
$('v2cbCommandClose').addEventListener('click',()=>modal.close());
commandInput.addEventListener('input',drawCommands);
commandInput.addEventListener('keydown',e=>{
 if(e.key==='Enter'&&visibleCommands.length){e.preventDefault();choose(visibleCommands[0]);}
 else if(e.key==='ArrowDown'){e.preventDefault();commandList.querySelector('button')?.focus();}
});
commandList.addEventListener('keydown',e=>{
 const buttons=[...commandList.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
 if(e.key==='ArrowDown'){e.preventDefault();buttons[(index+1)%buttons.length]?.focus();}
 if(e.key==='ArrowUp'){e.preventDefault();(index<=0?commandInput:buttons[index-1])?.focus();}
});
modal.addEventListener('close',()=>{commandPreviousFocus?.focus?.({preventScroll:true});commandPreviousFocus=null;});
document.addEventListener('keydown',e=>{
 if(!(e.metaKey||e.ctrlKey)||e.altKey||e.shiftKey||e.key.toLowerCase()!=='k')return;
 if(document.querySelector('dialog[open]')&&!modal.open)return;
 e.preventDefault();e.stopPropagation();
 if(modal.open)modal.close();else openCommands();
},true);
// The authoritative listening module emits verification events.
window.addEventListener('txv2:listening',e=>{
 const state=e.detail||{};
 const image=workflow.querySelector('img');
 if(image)image.title=state.required?'Listening '+state.verifiedPercent+'% verified by server':'QA workflow illustration';
});
const timer=setInterval(()=>{
 paintWorkflow();
 if(taskLoaded)clearInterval(timer);
},350);
updatePlayer();updateSave();
})();
