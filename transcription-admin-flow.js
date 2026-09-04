(()=>{
  'use strict';
  if(!window.supabase)return;
  const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
  const currentProject=()=>Number(new URLSearchParams(location.search).get('project'))||null;
  const assignButton=document.getElementById('assign');
  const archivedButton=document.getElementById('txArchivedManager');
  const archivedDialog=document.getElementById('txArchivedDialog');
  const archivedRows=document.getElementById('txArchivedRows');
  const archivedCount=document.getElementById('txArchivedCount');
  const archivedMessage=document.getElementById('txArchivedMessage');
  const restoreButton=document.getElementById('txArchivedRestore');
  const deleteButton=document.getElementById('txArchivedDelete');
  let archived=[];
  let busy=false;

  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function notice(text,error=false){
    const n=document.getElementById('notice');
    if(!n)return;
    n.textContent=text;
    n.className='notice '+(error?'error':'success');
  }

  if(!document.querySelector('script[data-tx-billing-ui]')){
    const script=document.createElement('script');
    script.src='/transcription-billing-ui.js?v=2';
    script.dataset.txBillingUi='1';
    document.head.appendChild(script);
  }

  if(!document.querySelector('script[data-tx-excel-export]')){
    const script=document.createElement('script');
    script.src='/transcription-export.js?v=2';
    script.dataset.txExcelExport='1';
    document.head.appendChild(script);
  }

  if(assignButton){
    assignButton.textContent='Assignment Center';
    assignButton.title='Assign project access and task limits from the unified Assignment Center';
    assignButton.addEventListener('click',event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      const pid=currentProject();
      if(pid)location.href=`/admin/assignments?project=${pid}&layer=L1`;
    },true);
  }

  function selectedArchived(){return [...document.querySelectorAll('[data-archived-item]:checked')].map(node=>node.dataset.archivedItem).filter(Boolean)}

  function updateArchivedState(){
    const ids=selectedArchived();
    if(archivedCount)archivedCount.textContent=`${ids.length} selected · ${archived.length} archived`;
    if(restoreButton)restoreButton.disabled=busy||!ids.length;
    if(deleteButton)deleteButton.disabled=busy||!ids.length;
  }

  function renderArchived(){
    archivedRows.innerHTML=archived.length?archived.map(item=>`<label class="source-row"><input type="checkbox" data-archived-item="${safe(item.id)}"><span>${safe(item.display_name||item.recording_path?.split('/').pop()||'Audio')}<small>${safe(item.source_project_title||'Upload')} / ${safe(item.source_folder||'Root')} · archived ${item.archived_at?new Date(item.archived_at).toLocaleString():'recently'}</small></span></label>`).join(''):'<div class="empty">No archived audio in this project.</div>';
    updateArchivedState();
  }

  async function loadArchived(){
    const pid=currentProject();
    if(!pid)throw Error('Choose a transcription project first.');
    archivedRows.innerHTML='<div class="empty">Loading archived audio…</div>';
    archivedMessage.textContent='';
    const {data,error}=await db.rpc('tx_get_archived',{p_project:pid});
    if(error)throw Error(error.message);
    archived=Array.isArray(data)?data:[];
    renderArchived();
  }

  async function openArchived(){
    if(!currentProject())return notice('Choose a transcription project first.',true);
    archivedDialog.showModal();
    try{await loadArchived()}catch(error){archivedRows.innerHTML=`<div class="empty">${safe(error.message)}</div>`}
  }

  async function restoreArchived(){
    const ids=selectedArchived(),pid=currentProject();
    if(!ids.length||!pid||busy)return;
    busy=true;
    updateArchivedState();
    archivedMessage.textContent='Restoring…';
    try{
      const {data,error}=await db.rpc('tx_restore_archived',{p_project:pid,p_items:ids});
      if(error)throw Error(error.message);
      await loadArchived();
      notice(`${data?.restored||0} audio module${data?.restored===1?'':'s'} restored to the end of the live queue${data?.skipped?`; ${data.skipped} protected item${data.skipped===1?' was':'s were'} skipped`:''}.`);
    }catch(error){archivedMessage.textContent=error.message}
    finally{busy=false;updateArchivedState()}
  }

  async function deleteArchived(){
    const ids=selectedArchived(),pid=currentProject();
    if(!ids.length||!pid||busy)return;
    if(!confirm(`Permanently delete ${ids.length} archived audio module${ids.length===1?'':'s'}? This cannot be undone.`))return;
    busy=true;
    updateArchivedState();
    archivedMessage.textContent='Deleting…';
    try{
      const {data,error}=await db.rpc('tx_delete_queue_items',{p_project:pid,p_items:ids});
      if(error)throw Error(error.message);
      const paths=(data?.deleted||[]).filter(item=>item.delete_storage&&item.recording_path).map(item=>item.recording_path);
      let cleanupWarning='';
      if(paths.length){
        const {error:storageError}=await db.storage.from('transcription_audio').remove(paths);
        if(storageError)cleanupWarning=' Direct-upload storage cleanup needs attention.';
      }
      await loadArchived();
      notice(`${data?.deleted_count||0} archived audio module${data?.deleted_count===1?'':'s'} permanently deleted.${cleanupWarning}`,Boolean(cleanupWarning));
    }catch(error){archivedMessage.textContent=error.message}
    finally{busy=false;updateArchivedState()}
  }

  archivedButton?.addEventListener('click',openArchived);
  document.getElementById('txArchivedClose')?.addEventListener('click',()=>archivedDialog.close());
  document.getElementById('txArchivedSelectAll')?.addEventListener('click',()=>{
    document.querySelectorAll('[data-archived-item]').forEach(node=>node.checked=true);
    updateArchivedState();
  });
  archivedRows?.addEventListener('change',updateArchivedState);
  restoreButton?.addEventListener('click',restoreArchived);
  deleteButton?.addEventListener('click',deleteArchived);

  const aiConnection=document.getElementById('aiConnection');
  if(aiConnection){
    const correctProviderLabel=()=>{
      if(aiConnection.textContent.includes('OpenAI model access verified')){
        aiConnection.textContent=aiConnection.textContent.replace('OpenAI model access verified','Groq Whisper access verified');
      }
    };
    new MutationObserver(correctProviderLabel).observe(aiConnection,{childList:true,subtree:true,characterData:true});
    correctProviderLabel();
  }
})();