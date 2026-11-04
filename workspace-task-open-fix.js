(()=>{
'use strict';
if(window.__adatacoreTaskOpenFix)return;window.__adatacoreTaskOpenFix=true;
function openTask(button){
  const id=Number(button.dataset.id||0);
  const transcription=String(button.dataset.transcription||'').trim();
  const layer=String(button.dataset.layer||'L1');
  const title=String(button.dataset.title||'');
  if(transcription){
    const route=Number(button.dataset.transcriptionProject)===93?'/transcription-v2':'/transcription';
    window.location.assign(route+'?item='+encodeURIComponent(transcription));
    return;
  }
  if(!id)return;
  if(layer==='L1')window.location.assign('/voice-engine?project='+title+'&task='+encodeURIComponent(id));
  else window.location.assign('/review?task='+encodeURIComponent(id));
}
document.addEventListener('click',e=>{
  const el=e.target instanceof Element?e.target:null;
  const button=el?.closest('.task-open');
  if(!button)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if(button.disabled)return;
  button.disabled=true;
  button.setAttribute('aria-busy','true');
  openTask(button);
},true);
})();
