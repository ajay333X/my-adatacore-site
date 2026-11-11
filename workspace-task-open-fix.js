(()=>{
'use strict';
if(window.__adatacoreTaskOpenFix)return;window.__adatacoreTaskOpenFix=true;
async function openTask(button){
  const id=Number(button.dataset.id||0);
  const transcription=String(button.dataset.transcription||'').trim();
  const layer=String(button.dataset.layer||'L1');
  const title=String(button.dataset.title||'');
  const isTranscription=Boolean(transcription)||/transcription/i.test(title);
  // Generic task links previously opened the voice-audit page for L2
  // transcription tasks. Resolve the real audio item before navigation.
  if(id&&isTranscription){
    if(!window.supabase?.createClient)throw Error('Task service unavailable. Please reload.');
    const db=window.supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
    const {data,error}=await db.rpc('tx_resolve_assigned_task',{p_task_id:id});
    if(error)throw Error(error.message||'Could not check task assignment.');
    if(data?.archived)throw Error('This task has been archived by an administrator. It is no longer available for review or submission.');
    if(data?.kind==='transcription'){
      window.location.assign((data.editor_route||'/transcription')+'?item='+encodeURIComponent(data.audio_item_id));
      return;
    }
  }
  if(transcription){
    const route=Number(button.dataset.transcriptionProject)===93?'/transcription-v2':'/transcription';
    window.location.assign(route+'?item='+encodeURIComponent(transcription));
    return;
  }
  if(!id)return;
  if(layer==='L1')window.location.assign('/voice-engine?project='+encodeURIComponent(title)+'&task='+encodeURIComponent(id));
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
  void openTask(button).catch(error=>{
    button.disabled=false;button.removeAttribute('aria-busy');
    window.alert(error?.message||'Unable to open this task. Please try again.');
  });
},true);
})();
