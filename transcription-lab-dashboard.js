(()=>{
  'use strict';
  if(window.__adatacoreTxLabDashboard)return;
  window.__adatacoreTxLabDashboard=true;

  const $=id=>document.getElementById(id);
  const root=document.querySelector('.lab-main');
  const projectList=$('projectList');
  if(!root||!projectList||!window.supabase)return;

  const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
  let refreshTimer=null;
  let refreshSeq=0;

  const projectId=()=>Number(new URLSearchParams(location.search).get('project'))||null;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const isReady=item=>item&&item.queue_state==='queued'&&item.status==='unassigned'&&!item.task_id&&!item.assigned_to&&!item.review_task_id;
  const isActive=item=>item&&['assigned','in_progress'].includes(item.status);
  const isReview=item=>item&&['submitted','in_review','changes_requested'].includes(item.status);
  const isDone=item=>item&&['approved','reviewed'].includes(item.status);
  const isTranscribed=item=>isReview(item)||isDone(item);
  const seconds=item=>Number.isFinite(Number(item?.duration_seconds))?Math.max(0,Number(item.duration_seconds)):0;
  const languageName=code=>({hi:'Hindi',en:'English',mr:'Marathi',bn:'Bengali',ta:'Tamil',te:'Telugu',gu:'Gujarati',kn:'Kannada',ml:'Malayalam',pa:'Punjabi',ur:'Urdu'})[code]||String(code||'—').toUpperCase();

  function durationLabel(totalSeconds){
    const sec=Math.round(Number(totalSeconds)||0);
    if(sec<60)return `${sec}s`;
    const minutes=Math.floor(sec/60);
    if(minutes<60)return `${minutes}m ${String(sec%60).padStart(2,'0')}s`;
    const hours=Math.floor(minutes/60),mins=minutes%60;
    return `${hours}h ${mins}m`;
  }

  function setTab(name,remember=true){
    const wanted=['overview','queue','intake'].includes(name)?name:'overview';
    document.querySelectorAll('[data-tx-tab]').forEach(button=>{
      const active=button.dataset.txTab===wanted;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',active?'true':'false');
      button.tabIndex=active?0:-1;
    });
    document.querySelectorAll('[data-tx-view]').forEach(view=>{
      const active=view.dataset.txView===wanted;
      view.classList.toggle('active',active);
      view.hidden=!active;
    });
    if(remember){try{sessionStorage.setItem('adatacore-txlab-view',wanted)}catch(_){ }}
    if(wanted==='queue')setTimeout(()=>window.dispatchEvent(new Event('resize')),40);
    if(wanted==='overview')scheduleRefresh(30);
  }

  const tabButtons=[...document.querySelectorAll('[data-tx-tab]')];
  tabButtons.forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.txTab)));
  tabButtons.forEach(button=>button.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const current=tabButtons.indexOf(button);
    let next=current;
    if(event.key==='ArrowLeft')next=(current-1+tabButtons.length)%tabButtons.length;
    if(event.key==='ArrowRight')next=(current+1)%tabButtons.length;
    if(event.key==='Home')next=0;
    if(event.key==='End')next=tabButtons.length-1;
    tabButtons[next]?.focus();
    setTab(tabButtons[next]?.dataset.txTab);
  }));
  document.querySelectorAll('[data-tx-open]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.txOpen)));

  const initial=(()=>{try{return sessionStorage.getItem('adatacore-txlab-view')||'overview'}catch(_){return 'overview'}})();
  setTab(initial,false);

  async function rpc(name,args){
    const {data,error}=await db.rpc(name,args);
    if(error)throw Error(error.message);
    return data;
  }

  function metric(id,value,meta){
    const valueNode=$(id);
    const metaNode=$(`${id}Meta`);
    if(valueNode)valueNode.textContent=value;
    if(metaNode)metaNode.textContent=meta||'';
  }

  function projectPill(text,warn=false){return `<span style="display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;border:1px solid ${warn?'#ecd8ab':'#dfe4ec'};background:${warn?'#fff9ec':'#f8fafc'};color:${warn?'#8b5e18':'#475467'};font-size:10px;font-weight:700">${esc(text)}</span>`}

  function renderProjectSettings(s){
    if(!s)return;
    if($('projectName'))$('projectName').textContent=s.name||'Transcription';
    if($('projectDescription'))$('projectDescription').textContent=s.description||'';
    const desc=$('projectDescription');
    if(!desc)return;
    let meta=$('txSyncedProjectSettings');
    if(!meta){meta=document.createElement('div');meta.id='txSyncedProjectSettings';meta.style.cssText='display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-top:8px';desc.insertAdjacentElement('afterend',meta)}
    const hourly=Number(s.hourly_rate||0),currency=String(s.currency||'USD').toUpperCase();
    meta.innerHTML=[
      projectPill(s.lifecycle_status==='active'?'Active':String(s.lifecycle_status||'—')),
      projectPill(s.published?'Published':'Unpublished',!s.published),
      projectPill(languageName(s.language)),
      projectPill(`L1 ${Number(s.l1_rate||0).toFixed(2)}`),
      projectPill(`L2 ${Number(s.l2_rate||0).toFixed(2)}`),
      projectPill(`Audio ${currency} ${hourly.toFixed(4)}/hr`,hourly===0)
    ].join('');
    let warning=$('txProjectSyncWarning');
    if(!warning){warning=document.createElement('div');warning.id='txProjectSyncWarning';warning.style.cssText='margin-top:8px;padding:9px 11px;border-radius:9px;font-size:10px;line-height:1.5';meta.insertAdjacentElement('afterend',warning)}
    if(hourly===0){warning.style.display='block';warning.style.background='#fff9ec';warning.style.border='1px solid #ecd8ab';warning.style.color='#8b5e18';warning.innerHTML='<strong>Billing check:</strong> transcription hourly rate is 0. L1/L2 Project Lab rates do not control audio-hour earnings.'}
    else warning.style.display='none';
  }

  function attention(items,aiJobs,archived,settings){
    const ready=items.filter(isReady).length;
    const review=items.filter(isReview).length;
    const active=items.filter(isActive).length;
    const failed=aiJobs.filter(job=>job.status==='failed').length;
    const out=[];
    if(settings&&Number(settings.hourly_rate||0)===0)out.push({tone:'warn',title:'Transcription hourly rate is 0',copy:'Set the audio-hour rate in Project Lab → Settings if contributor transcription should be paid by audio duration.'});
    if(failed)out.push({tone:'bad',title:`${failed} AI draft${failed===1?'':'s'} failed`,copy:'Open Intake & AI or select the affected audio to retry generation.'});
    if(!ready)out.push({tone:'warn',title:'No audio is ready to assign',copy:'Import or restore audio before contributors can claim new L1 work.'});
    else if(ready<3)out.push({tone:'warn',title:`Only ${ready} audio module${ready===1?' is':'s are'} ready`,copy:'The live queue is getting low. Consider importing more audio soon.'});
    if(review>=5)out.push({tone:'warn',title:`${review} modules are waiting on QA`,copy:'Review throughput is behind transcription throughput for this project.'});
    if(!active&&ready)out.push({tone:'good',title:'Queue is ready for contributors',copy:`${ready} module${ready===1?' is':'s are'} available for L1 assignment.`});
    if(archived.length)out.push({tone:'neutral',title:`${archived.length} archived module${archived.length===1?'':'s'}`,copy:'Archived audio is safely outside the live assignment queue and can be restored anytime.'});
    if(!out.length)out.push({tone:'good',title:'Pipeline looks healthy',copy:'No immediate queue, QA, configuration, or AI drafting issue needs attention.'});
    return out.slice(0,4);
  }

  function renderAttention(entries){
    const target=$('dashboardAttention');
    if(!target)return;
    target.innerHTML=entries.map(entry=>`<div class="tx-attention-item ${entry.tone==='neutral'?'':entry.tone}"><span class="tx-attention-dot"></span><span class="tx-attention-copy"><strong>${esc(entry.title)}</strong><span>${esc(entry.copy)}</span></span></div>`).join('');
  }

  function renderNext(items){
    const target=$('dashboardNextQueue');
    if(!target)return;
    const rows=items.filter(isReady).sort((a,b)=>(Number(a.queue_position)||999999)-(Number(b.queue_position)||999999)).slice(0,6);
    target.innerHTML=rows.length?rows.map(item=>`<div class="tx-next-row"><span class="tx-next-number">#${Number(item.queue_position)||'—'}</span><span class="tx-next-copy"><strong>${esc(item.display_name||item.recording_path?.split('/').pop()||'Audio')}</strong><small>${esc(item.source_project_title||'Transcription upload')} · ${esc(item.source_folder||'Root')}</small></span><span class="tx-next-duration">${durationLabel(seconds(item))}</span></div>`).join(''):'<div class="empty" style="padding:28px 12px">No unassigned audio is waiting in the live queue.</div>';
  }

  function renderPipeline(items){
    const total=items.length;
    const ready=items.filter(isReady).length;
    const active=items.filter(isActive).length;
    const review=items.filter(isReview).length;
    const done=items.filter(isDone).length;
    const transcribed=items.filter(isTranscribed).length;
    const completion=total?Math.round(transcribed/total*100):0;
    const fill=$('dashboardProgressFill');
    if(fill)fill.style.width=`${Math.max(0,Math.min(100,completion))}%`;
    if($('dashboardProgressValue'))$('dashboardProgressValue').textContent=`${completion}%`;
    if($('dashboardProgressCopy'))$('dashboardProgressCopy').textContent=total?`${transcribed} of ${total} live modules transcribed · ${done} final approved`:'No live audio yet';
    if($('pipelineReady'))$('pipelineReady').textContent=ready;
    if($('pipelineActive'))$('pipelineActive').textContent=active;
    if($('pipelineReview'))$('pipelineReview').textContent=review;
    if($('pipelineDone'))$('pipelineDone').textContent=done;
  }

  function normalizeAiProviderLabel(){
    const node=$('aiConnection');
    if(!node)return;
    if(node.textContent.includes('OpenAI model access verified'))node.textContent=node.textContent.replace('OpenAI model access verified','Groq Whisper access verified');
  }

  async function refreshDashboard(){
    const pid=projectId();
    if(!pid)return;
    const seq=++refreshSeq;
    try{
      const [lab,aiResult,archivedResult,settings]=await Promise.all([
        rpc('tx_get_lab',{p_project_id:pid}),
        rpc('tx_ai_lab',{p_project:pid}).catch(()=>({jobs:[]})),
        rpc('tx_get_archived',{p_project:pid}).catch(()=>[]),
        rpc('admin_get_transcription_project_settings',{p_project_id:pid}).catch(()=>null)
      ]);
      if(seq!==refreshSeq||projectId()!==pid)return;
      const items=Array.isArray(lab?.items)?lab.items:[];
      const jobs=Array.isArray(aiResult?.jobs)?aiResult.jobs:[];
      const archived=Array.isArray(archivedResult)?archivedResult:[];
      const ready=items.filter(isReady);
      const active=items.filter(isActive);
      const review=items.filter(isReview);
      const transcribed=items.filter(isTranscribed);
      const done=items.filter(isDone);
      const totalDuration=items.reduce((sum,item)=>sum+seconds(item),0);
      const readyDuration=ready.reduce((sum,item)=>sum+seconds(item),0);
      const transcribedDuration=transcribed.reduce((sum,item)=>sum+seconds(item),0);
      const aiReady=jobs.filter(job=>job.status==='ready').length;
      const aiFailed=jobs.filter(job=>job.status==='failed').length;

      renderProjectSettings(settings);
      metric('totalCount',items.length,totalDuration?`${durationLabel(totalDuration)} known audio`:'Live queue modules');
      metric('readyCount',ready.length,readyDuration?`${durationLabel(readyDuration)} ready`:'Ready for L1');
      metric('workingCount',active.length,'Assigned or transcribing');
      metric('dashboardTranscribedCount',transcribed.length,review.length?`${review.length} waiting / in QA`:'Submitted or further');
      metric('reviewedCount',done.length,transcribedDuration?`${durationLabel(transcribedDuration)} transcribed`:'Final approved');
      metric('dashboardAiCount',aiReady,aiFailed?`${aiFailed} failed draft${aiFailed===1?'':'s'}`:'Groq drafts ready');
      if($('dashboardArchivedCount'))$('dashboardArchivedCount').textContent=archived.length;
      if($('queueTabCount'))$('queueTabCount').textContent=ready.length;
      renderPipeline(items);
      renderAttention(attention(items,jobs,archived,settings));
      renderNext(items);
      normalizeAiProviderLabel();
    }catch(error){
      const target=$('dashboardAttention');
      if(target)target.innerHTML=`<div class="tx-attention-item bad"><span class="tx-attention-dot"></span><span class="tx-attention-copy"><strong>Dashboard could not refresh</strong><span>${esc(error.message)}</span></span></div>`;
    }
  }

  function scheduleRefresh(delay=120){
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(refreshDashboard,delay);
  }

  projectList.addEventListener('click',event=>{
    if(event.target.closest('[data-project]'))scheduleRefresh(350);
  });
  $('queueRefresh')?.addEventListener('click',()=>scheduleRefresh(500));
  $('txArchivedManager')?.addEventListener('click',()=>scheduleRefresh(250));
  $('dashboardArchivedOpen')?.addEventListener('click',()=>$('txArchivedManager')?.click());
  $('importConfirm')?.addEventListener('click',()=>scheduleRefresh(650));
  $('uploadConfirm')?.addEventListener('click',()=>scheduleRefresh(900));
  $('assignConfirm')?.addEventListener('click',()=>scheduleRefresh(650));

  const nameNode=$('projectName');
  if(nameNode)new MutationObserver(()=>scheduleRefresh(80)).observe(nameNode,{childList:true,subtree:true,characterData:true});
  const aiConnection=$('aiConnection');
  if(aiConnection)new MutationObserver(normalizeAiProviderLabel).observe(aiConnection,{childList:true,subtree:true,characterData:true});

  window.addEventListener('focus',()=>scheduleRefresh(20));
  window.addEventListener('storage',event=>{const pid=projectId();if(pid&&event.key===`adatacore-project-updated:${pid}`)scheduleRefresh(20)});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleRefresh(50)});
  setInterval(()=>{if(!document.hidden&&document.querySelector('[data-tx-view="overview"]')?.classList.contains('active'))refreshDashboard()},20000);

  scheduleRefresh(250);

  const longAudioScript=document.createElement('script');
  longAudioScript.src='/transcription-long-audio.js?v=20260902-1';
  longAudioScript.async=true;
  document.head.appendChild(longAudioScript);
})();
