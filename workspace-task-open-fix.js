(()=>{
'use strict';
if(window.__adatacoreTaskOpenFix)return;window.__adatacoreTaskOpenFix=true;
async function openTask(button){
  const id=Number(button.dataset.id||0);
  const transcription=String(button.dataset.transcription||'').trim();
  const layer=String(button.dataset.layer||'L1');
  const title=String(button.dataset.title||'');
  const isTranscription=Boolean(transcription)||/transcription/i.test(title);
  // Review cards do not always carry a transcription label or audio UUID.
  // Resolve all L2 task IDs before choosing voice review versus transcription.
  if(id&&(layer==='L2'||isTranscription)){
    if(!window.supabase?.createClient){
      if(isTranscription)throw Error('Task service unavailable. Please reload.');
    }else{
      const db=window.supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
      const {data,error}=await db.rpc('tx_resolve_assigned_task',{p_task_id:id});
      if(error){
        if(isTranscription)throw Error(error.message||'Could not check task assignment.');
        // Generic voice assignments retain the existing review route.
        console.warn('Review task lookup unavailable:',error.message);
      }else{
        if(data?.archived)throw Error('This task has been archived by an administrator. It is no longer available for review or submission.');
        if(data?.kind==='transcription'){
          window.location.assign((data.editor_route||'/transcription')+'?item='+encodeURIComponent(data.audio_item_id)+'&launch=workspace');
          return;
        }
      }
    }
  }
  if(transcription){
    const route=Number(button.dataset.transcriptionProject)===93?'/transcription-v2':'/transcription';
    window.location.assign(route+'?item='+encodeURIComponent(transcription)+'&launch=workspace');
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
