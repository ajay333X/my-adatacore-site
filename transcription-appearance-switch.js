(()=>{
'use strict';
// Reversible appearance only. Never touches transcription data, playback or review state.
if(window.__adatacoreAppearanceV1||!document.body?.classList.contains('tx-v2-editor'))return;
window.__adatacoreAppearanceV1=true;
const STORE='adatacore.transcription.v2.appearance';
const PARAM='ui';
const root=document.body;
const header=document.querySelector('.v2-app-header .header-actions');
if(!header)return;
let saved='classic';
try{
 const value=window.localStorage.getItem(STORE);
 if(value==='enterprise')saved='enterprise';
}catch(_){/* Privacy mode: session-only preference, Classic remains available */ }
const chosen=new URLSearchParams(location.search).get(PARAM);
if(chosen==='classic'||chosen==='enterprise')saved=chosen;
const group=document.createElement('div');
group.id='acAppearanceSwitch';
group.setAttribute('role','group');
group.setAttribute('aria-label','Workspace appearance');
group.title='Switch the visual layout without changing the current task';
const makeButton=(mode,label,help)=>{
 const button=document.createElement('button');
 button.type='button';button.className='ac-appearance-option';
 button.dataset.appearance=mode;button.textContent=label;
 button.title=help;button.setAttribute('aria-label',help);
 button.setAttribute('aria-pressed','false');
 button.addEventListener('click',()=>apply(mode,true));
 group.appendChild(button);
};
makeButton('classic','Classic','Use the existing, original transcription interface');
makeButton('enterprise','Enterprise','Use the refined, enterprise-style transcription interface');
const target=document.getElementById('hotkeys')||document.getElementById('v2CBRulesOpen')||document.getElementById('backLink');
if(target&&target.parentNode===header)header.insertBefore(group,target);
else header.appendChild(group);
function apply(mode,persist){
 const safe=mode==='enterprise'?'enterprise':'classic';
 root.classList.toggle('ac-enterprise-mode',safe==='enterprise');
 root.dataset.appearance=safe;
 for(const button of group.querySelectorAll('[data-appearance]'))
  button.setAttribute('aria-pressed',String(button.dataset.appearance===safe));
 if(persist){
  try{window.localStorage.setItem(STORE,safe)}catch(_){}
  // A query override (?ui=classic) always works as an emergency rollback.
  // Remove it after an explicit toggle so the new choice survives refresh.
  const current=new URL(window.location.href);
  if(current.searchParams.has(PARAM)){
   current.searchParams.delete(PARAM);
   try{history.replaceState(history.state,'',current.pathname+current.search+current.hash)}catch(_){}
  }
 }
}
apply(saved,false);
window.AdatacoreAppearance={
 getMode:()=>root.dataset.appearance,
 setMode:mode=>apply(mode,true),
 resetToClassic:()=>apply('classic',true)
};
})();