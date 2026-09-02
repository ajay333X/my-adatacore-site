(()=>{
  'use strict';
  const table=document.getElementById('audioRows');
  if(!table||!window.supabase)return;

  const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
  const search=document.getElementById('search');
  const statusFilter=document.getElementById('statusFilter');
  const selectionCount=document.getElementById('selectionCount');
  const archiveButton=document.getElementById('queueArchiveSelected');
  const deleteButton=document.getElementById('queueDeleteSelected');
  const clearButton=document.getElementById('queueClearSelection');
  const refreshButton=document.getElementById('queueRefresh');
  const queueSummary=document.getElementById('queueSummary');
  const archiveDialog=document.getElementById('queueArchiveDialog');
  const deleteDialog=document.getElementById('queueDeleteDialog');

  let cacheProject=null;
  let items=[];
  let busy=false;
  let decorating=false;
  let decorateTimer=null;
  let pendingArchive=[];
  let pendingDelete=[];
  let dragState={source:null,target:null,after:false};

  const project=()=>Number(new URLSearchParams(location.search).get('project'))||null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const queueReady=a=>Boolean(a&&a.queue_state==='queued'&&a.status==='unassigned'&&!a.task_id&&!a.assigned_to&&!a.review_task_id);
  const positionOf=a=>Number.isInteger(Number(a?.queue_position))?Number(a.queue_position):null;

  function installStyles(){
    if(document.getElementById('txQueueManagerStyle'))return;
    const style=document.createElement('style');
    style.id='txQueueManagerStyle';
    style.textContent=`
      .tx-queue-cell{min-width:168px}
      .tx-queue-control{display:flex;align-items:center;gap:6px;white-space:nowrap}
      .tx-drag-handle{display:inline-grid;place-items:center;width:30px;height:30px;border:1px solid #d7dce5;border-radius:7px;background:#fff;color:#667085;cursor:grab;user-select:none;font-size:16px;line-height:1}
      .tx-drag-handle:active{cursor:grabbing}
      .tx-queue-number{min-width:34px;font-variant-numeric:tabular-nums;font-weight:800;color:#344054}
      .tx-queue-move{padding:6px 8px;min-width:31px}
      .tx-queue-muted{color:#98a2b3;font-size:12px}
      tr.tx-queue-draggable{transition:background .12s ease,box-shadow .12s ease}
      tr.tx-queue-dragging{opacity:.48}
      tr.tx-drop-before{box-shadow:inset 0 3px 0 #2864df}
      tr.tx-drop-after{box-shadow:inset 0 -3px 0 #2864df}
      #queueDeleteSelected{border-color:#efc0c5;background:#fff8f8;color:#b42334}
      #queueDeleteSelected:hover:not(:disabled){background:#fff0f1}
      #queueArchiveSelected{background:#fffaf0;border-color:#ecd8ab;color:#8b5e18}
      @media(max-width:900px){.tx-queue-cell{min-width:146px}.tx-drag-handle{width:34px;height:34px}.tx-queue-move{min-width:34px;padding:7px}}
      @media(prefers-reduced-motion:reduce){tr.tx-queue-draggable{transition:none}}
    `;
    document.head.appendChild(style);
  }

  async function load(force=false){
    const pid=project();
    if(!pid){items=[];cacheProject=null;return}
    if(!force&&pid===cacheProject&&items.length)return;
    const {data,error}=await db.rpc('tx_get_lab',{p_project_id:pid});
    if(error)throw Error(error.message);
    cacheProject=pid;
    items=Array.isArray(data?.items)?data.items:[];
  }

  function itemMap(){return new Map(items.map(a=>[String(a.id),a]))}
  function selectedIds(){return [...table.querySelectorAll('input[data-item]:checked')].map(box=>String(box.dataset.item||'')).filter(Boolean)}
  function selectedReady(){const map=itemMap();return selectedIds().filter(id=>queueReady(map.get(id)))}

  function updateBulkState(){
    const selected=selectedIds();
    const ready=selectedReady();
    const protectedCount=Math.max(0,selected.length-ready.length);
    if(selectionCount){
      selectionCount.textContent=selected.length
        ?`${selected.length} selected · ${ready.length} can archive/delete${protectedCount?` · ${protectedCount} protected`:''}`
        :'0 selected';
    }
    if(clearButton)clearButton.disabled=busy||!selected.length;
    if(archiveButton)archiveButton.disabled=busy||!ready.length;
    if(deleteButton)deleteButton.disabled=busy||!ready.length;
    const readyCount=items.filter(queueReady).length;
    if(queueSummary){
      const dragDisabled=Boolean(search?.value.trim())||!['','unassigned'].includes(statusFilter?.value||'');
      queueSummary.textContent=dragDisabled
        ?`${readyCount} queue-ready · clear search/use All or Unassigned to drag-reorder.`
        :`${readyCount} queue-ready · drag the ↕ handle to change L1 assignment order.`;
    }
  }

  function clearDropClasses(){
    table.querySelectorAll('tr.tx-drop-before,tr.tx-drop-after,tr.tx-queue-dragging').forEach(row=>row.classList.remove('tx-drop-before','tx-drop-after','tx-queue-dragging'));
  }

  function dragEnabled(){return !busy&&!String(search?.value||'').trim()&&['','unassigned'].includes(statusFilter?.value||'')}

  function reorderVisibleRows(){
    if(!dragEnabled())return;
    const body=table;
    const map=itemMap();
    const rows=[...body.querySelectorAll('tr')].filter(row=>row.querySelector('input[data-item]'));
    if(!rows.length)return;
    const readyRows=rows.filter(row=>queueReady(map.get(String(row.querySelector('input[data-item]')?.dataset.item||''))));
    const sorted=[...readyRows].sort((a,b)=>{
      const ai=map.get(String(a.querySelector('input[data-item]').dataset.item));
      const bi=map.get(String(b.querySelector('input[data-item]').dataset.item));
      return (positionOf(ai)??Number.MAX_SAFE_INTEGER)-(positionOf(bi)??Number.MAX_SAFE_INTEGER);
    });
    const firstNonReady=rows.find(row=>!readyRows.includes(row))||null;
    sorted.forEach(row=>body.insertBefore(row,firstNonReady));
  }

  function decorate(){
    if(decorating)return;
    decorating=true;
    try{
      installStyles();
      const map=itemMap();
      const rows=[...table.querySelectorAll('tr')];
      rows.forEach(row=>{
        const box=row.querySelector('input[data-item]');
        if(!box){
          if(row.children.length===1)row.firstElementChild?.setAttribute('colspan','8');
          return;
        }
        const id=String(box.dataset.item||'');
        const item=map.get(id);
        let cell=row.querySelector('[data-queue-cell]');
        if(!cell){
          cell=document.createElement('td');
          cell.dataset.queueCell=id;
          cell.className='tx-queue-cell';
          row.insertBefore(cell,row.children[3]||null);
        }
        row.dataset.queueItem=id;
        row.classList.toggle('tx-queue-draggable',queueReady(item));
        const pos=positionOf(item);
        if(queueReady(item)&&pos!==null){
          const dragTitle=dragEnabled()?'Drag to change queue order':'Clear search/filter to drag queue order';
          cell.innerHTML=`<div class="tx-queue-control"><span class="tx-drag-handle" draggable="${dragEnabled()?'true':'false'}" data-queue-drag="${esc(id)}" title="${esc(dragTitle)}" aria-label="${esc(dragTitle)}">↕</span><span class="tx-queue-number">#${pos}</span><button class="tx-queue-move" data-queue-up="${esc(id)}" ${pos<=1?'disabled':''} title="Move up one position">↑</button><button class="tx-queue-move" data-queue-down="${esc(id)}" title="Move down one position">↓</button></div>`;
        }else if(queueReady(item)){
          cell.innerHTML='<span class="tx-queue-muted">Queue pending</span>';
        }else{
          cell.innerHTML='<span class="tx-queue-muted">—</span>';
        }
      });
      reorderVisibleRows();
      updateBulkState();
    }finally{decorating=false}
  }

  async function refresh(force=false){
    try{
      await load(force);
      decorate();
    }catch(error){
      notice(`Queue controls unavailable: ${error.message}`,true);
    }
  }

  function schedule(force=false){
    clearTimeout(decorateTimer);
    decorateTimer=setTimeout(()=>refresh(force),70);
  }

  function notice(message,error=false){
    const node=document.getElementById('notice');
    if(!node)return;
    node.textContent=message;
    node.className='notice '+(error?'error':'success');
  }

  async function moveItem(id,targetPosition,message){
    if(busy)return;
    const item=itemMap().get(String(id));
    if(!queueReady(item)||!Number.isInteger(Number(targetPosition))||Number(targetPosition)<1)return;
    busy=true;
    updateBulkState();
    try{
      const {data,error}=await db.rpc('tx_queue_reorder',{p_project:project(),p_item:id,p_position:Number(targetPosition)});
      if(error)throw Error(error.message);
      cacheProject=null;
      items=[];
      await load(true);
      decorate();
      notice(message||`Queue updated. Audio moved to #${data?.position||targetPosition}.`);
    }catch(error){
      notice(error.message,true);
      await refresh(true);
    }finally{
      busy=false;
      clearDropClasses();
      updateBulkState();
    }
  }

  function openArchive(){
    const selected=selectedIds();
    pendingArchive=selectedReady();
    if(!pendingArchive.length)return notice('Select at least one unassigned queue-ready audio module to archive.',true);
    const protectedCount=selected.length-pendingArchive.length;
    document.getElementById('queueArchiveScope').innerHTML=`Archive <strong>${pendingArchive.length}</strong> audio module${pendingArchive.length===1?'':'s'}${protectedCount?` and skip <strong>${protectedCount}</strong> protected selection${protectedCount===1?'':'s'}`:''}?`;
    document.getElementById('queueArchiveMessage').textContent='';
    archiveDialog?.showModal();
  }

  async function confirmArchive(){
    if(busy||!pendingArchive.length)return;
    busy=true;
    const button=document.getElementById('queueArchiveConfirm');
    const message=document.getElementById('queueArchiveMessage');
    button.disabled=true;
    message.textContent='Archiving…';
    try{
      const {data,error}=await db.rpc('tx_archive_queue_items',{p_project:project(),p_items:pendingArchive});
      if(error)throw Error(error.message);
      archiveDialog.close();
      notice(`${data?.archived||0} audio module${data?.archived===1?'':'s'} archived${data?.skipped?`; ${data.skipped} protected item${data.skipped===1?' was':'s were'} skipped`:''}.`);
      location.reload();
    }catch(error){message.textContent=error.message}
    finally{busy=false;button.disabled=false;updateBulkState()}
  }

  function openDelete(){
    const selected=selectedIds();
    pendingDelete=selectedReady();
    if(!pendingDelete.length)return notice('Select at least one unassigned queue-ready audio module to delete.',true);
    const protectedCount=selected.length-pendingDelete.length;
    const map=itemMap();
    const names=pendingDelete.slice(0,5).map(id=>esc(map.get(id)?.display_name||'Audio module'));
    document.getElementById('queueDeleteScope').innerHTML=`Delete <strong>${pendingDelete.length}</strong> audio module${pendingDelete.length===1?'':'s'} permanently${protectedCount?` and skip <strong>${protectedCount}</strong> protected selection${protectedCount===1?'':'s'}`:''}?${names.length?`<br><span class="small muted">${names.join(' · ')}${pendingDelete.length>5?' · …':''}</span>`:''}`;
    document.getElementById('queueDeleteMessage').textContent='';
    deleteDialog?.showModal();
  }

  async function confirmDelete(){
    if(busy||!pendingDelete.length)return;
    busy=true;
    const button=document.getElementById('queueDeleteConfirm');
    const message=document.getElementById('queueDeleteMessage');
    button.disabled=true;
    message.textContent='Deleting…';
    try{
      const {data,error}=await db.rpc('tx_delete_queue_items',{p_project:project(),p_items:pendingDelete});
      if(error)throw Error(error.message);
      const paths=(data?.deleted||[]).filter(row=>row.delete_storage&&row.recording_path).map(row=>row.recording_path);
      let cleanupWarning='';
      if(paths.length){
        const {error:storageError}=await db.storage.from('transcription_audio').remove(paths);
        if(storageError)cleanupWarning=' The queue modules were deleted, but one or more directly uploaded files could not be removed from storage.';
      }
      deleteDialog.close();
      notice(`${data?.deleted_count||0} audio module${data?.deleted_count===1?'':'s'} deleted${data?.skipped?`; ${data.skipped} protected item${data.skipped===1?' was':'s were'} skipped`:''}.${cleanupWarning}`,Boolean(cleanupWarning));
      location.reload();
    }catch(error){message.textContent=error.message}
    finally{busy=false;button.disabled=false;updateBulkState()}
  }

  table.addEventListener('change',event=>{
    if(event.target.matches('input[data-item]'))setTimeout(updateBulkState,0);
  });

  table.addEventListener('click',event=>{
    const up=event.target.closest('[data-queue-up]');
    const down=event.target.closest('[data-queue-down]');
    const id=up?.dataset.queueUp||down?.dataset.queueDown;
    if(!id)return;
    const item=itemMap().get(String(id));
    const pos=positionOf(item);
    if(pos===null)return;
    const total=items.filter(queueReady).length;
    const target=up?Math.max(1,pos-1):Math.min(total,pos+1);
    if(target!==pos)moveItem(id,target,`Queue updated. ${item?.display_name||'Audio'} moved to #${target}.`);
  });

  table.addEventListener('dragstart',event=>{
    const handle=event.target.closest('[data-queue-drag]');
    if(!handle||!dragEnabled()){event.preventDefault();return}
    const id=String(handle.dataset.queueDrag||'');
    const item=itemMap().get(id);
    if(!queueReady(item)){event.preventDefault();return}
    dragState={source:id,target:null,after:false};
    handle.closest('tr')?.classList.add('tx-queue-dragging');
    event.dataTransfer.effectAllowed='move';
    try{event.dataTransfer.setData('text/plain',id)}catch(_){ }
  });

  table.addEventListener('dragover',event=>{
    if(!dragState.source||!dragEnabled())return;
    const row=event.target.closest('tr[data-queue-item]');
    if(!row||row.dataset.queueItem===dragState.source)return;
    const item=itemMap().get(String(row.dataset.queueItem));
    if(!queueReady(item))return;
    event.preventDefault();
    event.dataTransfer.dropEffect='move';
    table.querySelectorAll('tr.tx-drop-before,tr.tx-drop-after').forEach(r=>r.classList.remove('tx-drop-before','tx-drop-after'));
    const rect=row.getBoundingClientRect();
    const after=event.clientY>rect.top+rect.height/2;
    dragState.target=String(row.dataset.queueItem);
    dragState.after=after;
    row.classList.add(after?'tx-drop-after':'tx-drop-before');
  });

  table.addEventListener('drop',event=>{
    if(!dragState.source||!dragState.target)return;
    event.preventDefault();
    const map=itemMap();
    const source=map.get(dragState.source),target=map.get(dragState.target);
    const sourcePos=positionOf(source),targetPos=positionOf(target);
    if(sourcePos===null||targetPos===null){clearDropClasses();dragState={source:null,target:null,after:false};return}
    let desired;
    if(dragState.after)desired=sourcePos<targetPos?targetPos:targetPos+1;
    else desired=sourcePos<targetPos?targetPos-1:targetPos;
    desired=Math.max(1,Math.min(items.filter(queueReady).length,desired));
    const id=dragState.source;
    dragState={source:null,target:null,after:false};
    clearDropClasses();
    if(desired!==sourcePos)moveItem(id,desired,`Queue updated. ${source?.display_name||'Audio'} moved to #${desired}.`);
  });

  table.addEventListener('dragend',()=>{
    dragState={source:null,target:null,after:false};
    clearDropClasses();
  });

  archiveButton?.addEventListener('click',openArchive);
  deleteButton?.addEventListener('click',openDelete);
  clearButton?.addEventListener('click',()=>{
    const checked=[...table.querySelectorAll('input[data-item]:checked')];
    checked.forEach(box=>{box.checked=false;box.dispatchEvent(new Event('change',{bubbles:true}))});
    const selectAll=document.getElementById('selectAll');
    if(selectAll)selectAll.checked=false;
    updateBulkState();
  });
  refreshButton?.addEventListener('click',()=>location.reload());
  document.getElementById('queueArchiveClose')?.addEventListener('click',()=>archiveDialog.close());
  document.getElementById('queueArchiveCancel')?.addEventListener('click',()=>archiveDialog.close());
  document.getElementById('queueArchiveConfirm')?.addEventListener('click',confirmArchive);
  document.getElementById('queueDeleteClose')?.addEventListener('click',()=>deleteDialog.close());
  document.getElementById('queueDeleteCancel')?.addEventListener('click',()=>deleteDialog.close());
  document.getElementById('queueDeleteConfirm')?.addEventListener('click',confirmDelete);

  search?.addEventListener('input',()=>schedule(false));
  statusFilter?.addEventListener('change',()=>schedule(false));
  document.getElementById('projectList')?.addEventListener('click',()=>setTimeout(()=>refresh(true),120),true);

  const observer=new MutationObserver(()=>schedule(false));
  observer.observe(table,{childList:true,subtree:true});

  refresh(true);
})();
