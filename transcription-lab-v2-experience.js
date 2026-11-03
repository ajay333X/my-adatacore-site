
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const state={pid:null,items:[],jobs:[],active:'overview'};
  window.txV2Filters={source:''};
  const showTab=name=>{document.querySelector('[data-tx-tab="'+name+'"]')?.click();state.active=name;document.querySelectorAll('[data-v2-nav]').forEach(el=>el.classList.toggle('is-active',el.dataset.v2Nav===name));};
  const tabs=[...document.querySelectorAll('[data-tx-tab]')];
  tabs.forEach(el=>el.addEventListener('click',()=>{state.active=el.dataset.txTab;document.querySelectorAll('[data-v2-nav]').forEach(x=>x.classList.toggle('is-active',x.dataset.v2Nav===state.active))}));
  document.querySelectorAll('[data-v2-nav]').forEach(el=>el.addEventListener('click',()=>showTab(el.dataset.v2Nav)));
  const action=name=>{
    if(name==='overview'||name==='queue'||name==='intake')showTab(name);
    else if(name==='import'){$('importExisting')?.click();}
    else if(name==='upload'){$('uploadExternal')?.click();}
    else if(name==='ai'){showTab('queue');$('aiGenerate')?.click();}
    else if(name==='search'){showTab('queue');$('search')?.focus();}
    else if(name==='new'){$('newProject')?.click();}
    else if(name==='refresh'){$('queueRefresh')?.click();}
    else if(name==='vault')location.href='/admin/transcription-vault?project='+(state.pid||93);
    else if(name==='settings')location.href='/admin/project-lab?project='+(state.pid||93);
  };
  document.querySelectorAll('[data-v2-action]').forEach(el=>el.addEventListener('click',()=>action(el.dataset.v2Action)));
  const fmtTime=s=>{s=Math.max(0,Number(s)||0);return s>=3600?Math.floor(s/3600)+'h '+Math.round((s%3600)/60)+'m':s>=60?Math.floor(s/60)+'m '+Math.round(s%60)+'s':Math.round(s)+'s';};
  function updateFacts(detail){
    state.pid=detail.projectId;state.items=detail.items||[];state.jobs=detail.jobs||[];
    const vaultUrl='/admin/transcription-vault?project='+(state.pid||93);
    if($('vaultLink'))$('vaultLink').href=vaultUrl;
    const railVault=document.querySelector('.v2-rail a[title="Audio Vault"]');
    if(railVault)railVault.href=vaultUrl;
    const items=state.items,total=items.length,finished=items.filter(i=>['submitted','in_review','changes_requested','approved','reviewed'].includes(i.status)).length;
    const approved=items.filter(i=>['approved','reviewed'].includes(i.status)).length;
    const sources=[...new Set(items.map(i=>i.source_project_title).filter(Boolean))].sort();
    const count=total?Math.round(100*finished/total):0;
    $('v2Count').textContent=String(total);
    $('v2Duration').textContent=fmtTime(items.reduce((s,i)=>s+Number(i.duration_seconds||0),0));
    $('v2Sources').textContent=String(sources.length);
    $('v2Quality').textContent=total?approved+' final approved · '+count+'% transcribed':'Ready for your first audio import';
    $('v2QueueDescription').textContent=total+' modules in this project · '+fmtTime(items.reduce((s,i)=>s+Number(i.duration_seconds||0),0))+' of recorded audio';
    const select=$('v2SourceFilter');if(select){
      const previous=window.txV2Filters.source||'';
      select.replaceChildren(new Option('All source projects',''),...sources.map(v=>new Option(v,v)));
      let stored='';try{stored=localStorage.getItem('txv2:source:'+(state.pid||93))||''}catch(_){}
      const next=sources.includes(previous)?previous:(sources.includes(stored)?stored:'');
      select.value=next;window.txV2Filters.source=next;
      if(next!==previous)$('search')?.dispatchEvent(new Event('input',{bubbles:true}));
    }
    $('v2CurrentProject').textContent=detail.projectName||'Transcription TTS';
    $('v2TotalSourcesCopy').textContent=sources.length?'Connected to '+sources.length+' source '+(sources.length===1?'project':'projects'):'Choose recordings from the app';
  }
  document.addEventListener('txv2:data',e=>updateFacts(e.detail||{}));
  const sourceSelect=$('v2SourceFilter');
  sourceSelect?.addEventListener('change',()=>{window.txV2Filters.source=sourceSelect.value;try{localStorage.setItem('txv2:source:'+(state.pid||93),sourceSelect.value)}catch(_){}$('search')?.dispatchEvent(new Event('input',{bubbles:true}));});
  const buttons=[...document.querySelectorAll('[data-v2-filter]')];
  function setStatus(status){
    const sel=$('statusFilter');if(!sel)return;
    sel.value=status;
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    buttons.forEach(el=>el.classList.toggle('is-active',el.dataset.v2Filter===status));
  }
  buttons.forEach(b=>b.addEventListener('click',()=>setStatus(b.dataset.v2Filter)));
  $('statusFilter')?.addEventListener('change',()=>buttons.forEach(el=>el.classList.toggle('is-active',el.dataset.v2Filter===$('statusFilter').value)));
  const dialog=$('v2CommandDialog'),input=$('v2CommandInput'),list=$('v2CommandList');
  const commands=[
    ['overview','Overview','Open your transcription dashboard','1'],
    ['queue','Live queue','Review and organize audio','2'],
    ['intake','Intake & AI','Choose audio and AI settings','3'],
    ['import','Import recordings','Browse all recorded sources','I'],
    ['upload','Upload audio','Add new files in bulk','U'],
    ['search','Search modules','Find a recording or source','/'],
    ['vault','Audio vault','Prepare AI-assisted drafts',''],
    ['settings','Project settings','Access, rates and workflow',''],
    ['refresh','Refresh queue','Pull the latest project data','R']
  ];
  function paintCommands(){
    const q=(input.value||'').trim().toLowerCase();
    const rows=commands.filter(x=>(x[1]+' '+x[2]).toLowerCase().includes(q));
    list.replaceChildren();
    if(!rows.length){const p=document.createElement('p');p.className='v2-import-meta';p.textContent='No matching actions';list.append(p);return;}
    rows.forEach(c=>{const b=document.createElement('button');b.type='button';b.dataset.command=c[0];const a=document.createElement('span');a.textContent=c[1];const hint=document.createElement('small');hint.textContent=c[2];a.append(document.createElement('br'),hint);b.append(a);if(c[3]){const k=document.createElement('span');k.className='v2-kbd';k.textContent=c[3];b.append(k)}list.append(b);});
  }
  function openCommands(){if(dialog.open)return;input.value='';paintCommands();dialog.showModal();setTimeout(()=>input.focus(),20)}
  $('v2CommandOpen')?.addEventListener('click',openCommands);
  $('v2CommandClose')?.addEventListener('click',()=>dialog.close());
  input?.addEventListener('input',paintCommands);
  input?.addEventListener('keydown',e=>{if(e.key==='Enter'){const cmd=list.querySelector('[data-command]');if(cmd){e.preventDefault();cmd.click();}}});
  list?.addEventListener('click',e=>{const node=e.target.closest('[data-command]');if(!node)return;dialog.close();action(node.dataset.command);});
  document.addEventListener('keydown',e=>{
    const edit=e.target.closest('input,textarea,select,[contenteditable="true"]'),open=!!document.querySelector('dialog[open]');
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommands();return}
    if(open||edit||e.altKey||e.ctrlKey||e.metaKey)return;
    if(e.key==='/'){e.preventDefault();action('search');}
    else if(e.key==='1')showTab('overview');
    else if(e.key==='2')showTab('queue');
    else if(e.key==='3')showTab('intake');
    else if(e.key.toLowerCase()==='i')action('import');
    else if(e.key.toLowerCase()==='u')action('upload');
  });
  const sourceSearch=$('v2SourceSearch'),sourceRows=$('sourceRows');
  function filterSources(){
    if(!sourceRows)return;
    const needle=(sourceSearch.value||'').trim().toLowerCase();let count=0;
    sourceRows.querySelectorAll('.source-row').forEach(row=>{const visible=row.textContent.toLowerCase().includes(needle);row.hidden=!visible;if(visible)count++});
    const info=$('v2SourceSummary');if(info)info.textContent=count+' matching recordings';
  }
  sourceSearch?.addEventListener('input',filterSources);
  if(sourceRows)new MutationObserver(filterSources).observe(sourceRows,{childList:true});
  $('importExisting')?.addEventListener('click',()=>{if(sourceSearch)sourceSearch.value='';});
  const initTab=document.querySelector('.tx-workspace-tab.active')?.dataset.txTab||'overview';
  state.active=initTab;
  document.querySelectorAll('[data-v2-nav]').forEach(el=>el.classList.toggle('is-active',el.dataset.v2Nav===initTab));
})();
