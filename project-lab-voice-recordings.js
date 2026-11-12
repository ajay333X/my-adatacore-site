(()=>{
'use strict';
if(window.__acVoiceAudioLab)return;window.__acVoiceAudioLab=true;
const P=Number(new URLSearchParams(location.search).get('project')||0);
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
const $=id=>document.getElementById(id);
let busy=false;
const taskId=id=>'VS-'+String(id).toUpperCase();
const normalId=value=>String(value||'').trim().replace(/^VS-/i,'').toLowerCase();
const css='<style id="acAudioLabCss">'+
'.ac-recording-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}.ac-recording-stat{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:15px}.ac-recording-stat span{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.ac-recording-stat strong{font-size:25px;display:block;margin-top:5px}.ac-recording-item{border:1px solid var(--line);border-radius:13px;padding:16px;background:var(--panel);margin:10px 0}.ac-recording-title{display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap}.ac-recording-title strong{font-size:12px}.ac-recording-meta{margin-top:6px;color:var(--muted);font-size:10px;line-height:1.55}.ac-recording-track{border-top:1px solid var(--line);padding-top:10px;margin-top:10px}.ac-recording-track audio{display:block;width:100%;max-width:700px;margin:10px 0 0}.ac-recording-track details{margin:12px 0 0}.ac-recording-track summary{cursor:pointer;font-size:11px;font-weight:800}.ac-recording-transcript{white-space:pre-wrap;background:var(--panel2);border-radius:10px;padding:12px;font-size:12px;line-height:1.8;max-height:160px;overflow:auto;margin-top:8px}.ac-recording-qa{margin-top:10px;font-size:11px;font-weight:750;color:var(--muted)}.ac-qa-task-id{margin:10px 0;display:flex;align-items:center;gap:9px;flex-wrap:wrap}.ac-qa-task-id code{font:700 11px ui-monospace,monospace;color:var(--text);overflow-wrap:anywhere}.ac-qa-search{padding:13px 15px;border:1px solid var(--line);border-radius:11px;background:var(--panel);margin:8px 0 16px}.ac-qa-search input{width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line);background:var(--panel2);color:var(--text);font:inherit}.ac-qa-review-form{border-top:1px solid var(--line);padding-top:13px;margin-top:13px;display:grid;gap:10px}.ac-qa-review-form .inputs{display:flex;gap:9px;flex-wrap:wrap}.ac-qa-review-form select,.ac-qa-review-form textarea{padding:10px;border:1px solid var(--line);border-radius:9px;background:var(--panel2);color:var(--text);font:inherit}.ac-qa-review-form textarea{width:100%;min-height:70px}.ac-qa-review-status{font-size:11px;color:var(--muted)}@media(max-width:700px){.ac-recording-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>';
function addView(){
 const anchor=document.querySelector('.lab-nav [data-view="reviews"]'),main=document.querySelector('.lab-main');
 if(!anchor||!main)return false;
 const button=document.createElement('button');button.dataset.view='recordings';button.textContent='◉ Central QA · Voice';anchor.after(button);
 button.onclick=()=>switchView();
 const section=document.createElement('section');section.id='view-recordings';section.className='lab-view';
 section.innerHTML='<div class="view-head"><div><div class="eyebrow">Central QA / Audio production</div><h1>Central QA — Voice recordings</h1><p>Search by unique recording task ID. Review Solo and both Duo tracks together and submit QA feedback.</p></div><div class="toolbar"><button id="acRecordRefresh" class="btn btn-secondary" type="button">Refresh recordings</button><a id="acRecordQaLink" class="btn btn-secondary" href="/voice-studio" target="_blank" rel="noopener">Voice Studio ↗</a></div></div><div class="ac-qa-search"><label for="acTaskSearch"><strong>Find task ID</strong></label><input type="search" id="acTaskSearch" placeholder="VS-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" aria-label="Find Voice Studio task by ID"></div><div id="acRecordingStats" class="ac-recording-stats"></div><div id="acRecordingItems" aria-live="polite">Choose this section to view recordings.</div>';
 main.append(section);document.head.insertAdjacentHTML('beforeend',css);
 const targetTask=new URLSearchParams(location.search).get('voice_task');
 if(targetTask)$('acTaskSearch').value=targetTask;
 new MutationObserver(()=>{if(section.classList.contains('active'))void read()}).observe(section,{attributes:true,attributeFilter:['class']});
 $('acRecordRefresh').onclick=()=>void read();
 $('acTaskSearch').addEventListener('input',()=>{clearTimeout(window.__acQaSearchTimer);window.__acQaSearchTimer=setTimeout(()=>void read(),300)});
 return true;
}
function switchView(){
 document.querySelectorAll('.lab-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view==='recordings'));
 document.querySelectorAll('.lab-view').forEach(v=>v.classList.toggle('active',v.id==='view-recordings'));
 const u=new URL(location.href);u.hash='recordings';history.replaceState(null,'',u.pathname+u.search+u.hash);
 void read();
}
function addStat(label,n){
 const box=document.createElement('div');box.className='ac-recording-stat';
 const a=document.createElement('span');a.textContent=label;
 const b=document.createElement('strong');b.textContent=String(n);
 box.append(a,b);return box;
}
function duration(seconds){return Math.floor(seconds/60)+'m '+seconds%60+'s'}
async function read(){
 if(busy)return;busy=true;
 window.AdacoreDuoQAPlayer?.disposeAll();
 const host=$('acRecordingItems'),stats=$('acRecordingStats');host.textContent='Loading recordings…';
 try{
  const term=normalId($('acTaskSearch')?.value);
  const isUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(term);
  let request=db.from('vs_sessions').select('id,mode,state,created_at,script_id,actor_a,actor_b').eq('project_id',P);
  if(isUuid)request=request.eq('id',term);
  const {data:sessions,error}=await request.order('created_at',{ascending:false}).limit(150);
  if(error)throw error;
  const ids=(sessions||[]).map(s=>s.id);
  let tracks=[],reviews=[],scripts=[],flags=[];
  if(ids.length){
   const results=await Promise.all([
    db.from('vs_tracks').select('session_id,actor_id,storage_path,duration_seconds,bytes,submitted_at,transcript').in('session_id',ids),
    db.from('vs_reviews').select('session_id,verdict,quality_score,feedback,reviewed_at').in('session_id',ids),
    db.from('vs_scripts').select('id,title').eq('project_id',P),
    db.from('vs_task_flags').select('session_id,reason,created_at').in('session_id',ids).order('created_at',{ascending:false})
   ]);
   for(const res of results)if(res.error)throw res.error;
   [tracks,reviews,scripts,flags]=results.map(x=>x.data||[]);
  }
  stats.replaceChildren(addStat('Recent sessions',sessions.length),addStat('Uploaded tracks',tracks.length),addStat('Completed sessions',sessions.filter(s=>s.state==='submitted').length),addStat('Reviewed',reviews.length));
  host.textContent='';
  if(!tracks.length&&!term&&!flags.length){
   const p=document.createElement('div');p.className='card lab-card';p.textContent='No submitted audio yet. Use a task ID to find a pending or flagged session as well.';host.append(p);return;
  }
  for(const s of sessions.filter(s=>(Boolean(term)||tracks.some(t=>t.session_id===s.id)||flags.some(f=>f.session_id===s.id))&&(!term||taskId(s.id).toLowerCase().includes(term)||s.id.toLowerCase().includes(term)))){
   const entry=document.createElement('article');entry.className='ac-recording-item';
   const top=document.createElement('div');top.className='ac-recording-title';
   const heading=document.createElement('strong');heading.textContent=scripts.find(x=>x.id===s.script_id)?.title||'Voice Studio session';
   const pill=document.createElement('span');pill.className='pill pill-gray';pill.textContent=s.state==='submitted'?'Submitted':s.state;
   top.append(heading,pill);entry.append(top);
   const sessionFlags=flags.filter(f=>f.session_id===s.id);
   if(sessionFlags.length){const flagBox=document.createElement('div');flagBox.className='ac-recording-qa';flagBox.style.cssText='padding:10px;border:1px solid #efcc8f;background:#fff8e8;border-radius:9px;margin:10px 0;color:#805417';flagBox.textContent='⚑ '+sessionFlags.length+' participant flag(s) for this task';for(const flag of sessionFlags){const row=document.createElement('div');row.style.cssText='margin:8px 0 0;white-space:pre-wrap';row.textContent=new Date(flag.created_at).toLocaleString()+' · '+flag.reason;flagBox.append(row)}entry.append(flagBox)}
   const task=document.createElement('div');task.className='ac-qa-task-id';const idcode=document.createElement('code');idcode.textContent=taskId(s.id);const copy=document.createElement('button');copy.type='button';copy.className='btn btn-secondary';copy.textContent='Copy task ID';copy.onclick=()=>navigator.clipboard?.writeText(taskId(s.id)).then(()=>copy.textContent='Copied',()=>copy.textContent='Select the ID to copy');task.append(idcode,copy);entry.append(task);
   const sub=document.createElement('div');sub.className='ac-recording-meta';sub.textContent=new Date(s.created_at).toLocaleString()+' · '+s.mode+' · '+tracks.filter(t=>t.session_id===s.id).length+' audio track(s)';entry.append(sub);
   const sessionTracks=tracks.filter(t=>t.session_id===s.id);
   if(sessionTracks.length&&window.AdacoreDuoQAPlayer){
    try{
     const player=window.AdacoreDuoQAPlayer.create({sessionId:s.id,actorA:s.actor_a,actorB:s.actor_b,tracks:sessionTracks,db});
     entry.append(player.element);
    }catch(error){
     const problem=document.createElement('p');problem.className='ac-recording-meta';problem.textContent='Combined playback unavailable: '+(error.message||String(error));entry.append(problem);
    }
   }
   if(!tracks.some(t=>t.session_id===s.id)){
    const pending=document.createElement('p');pending.className='ac-recording-meta';pending.textContent='No audio tracks submitted yet. This task can still be located and flagged. Session status: '+s.state;entry.append(pending);
   }
   for(const t of tracks.filter(t=>t.session_id===s.id)){
    const row=document.createElement('div');row.className='ac-recording-track';
    const details=document.createElement('div');details.className='ac-recording-meta';
    details.textContent='Voice actor '+(s.actor_a===t.actor_id?'A':'B')+' · '+duration(t.duration_seconds)+' · '+Math.round(t.bytes/1024)+' KB';
    row.append(details);
    const play=document.createElement('button');play.className='btn btn-secondary';play.type='button';play.textContent='▶ Play recording';
    play.onclick=async()=>{
     play.disabled=true;play.textContent='Loading audio…';
     try{
      const {data,error}=await db.storage.from('voice-studio').createSignedUrl(t.storage_path,300);
      if(error)throw error;
      let player=row.querySelector('audio');if(!player){player=document.createElement('audio');player.controls=true;player.preload='none';row.append(player)}
      player.src=data.signedUrl;play.textContent='▶ Play again';await player.play().catch(()=>{});
     }catch(e){play.textContent='Playback failed: '+e.message}finally{play.disabled=false}
    };
    row.append(play);
    if(t.transcript){
     const expand=document.createElement('details'),summary=document.createElement('summary'),caption=document.createElement('div');
     summary.textContent='Automatic Hindi transcript (draft)';
     caption.textContent=t.transcript;caption.lang='hi';caption.className='ac-recording-transcript';
     expand.append(summary,caption);row.append(expand);
    }
    entry.append(row);
   }
   const review=reviews.find(r=>r.session_id===s.id),qa=document.createElement('div');qa.className='ac-recording-qa';
   qa.textContent=review?'QA: '+review.verdict+' · '+review.quality_score+'/5':s.state==='submitted'?'Awaiting QA review':'Not yet ready for review';
   entry.append(qa);
   if(review?.feedback){const text=document.createElement('div');text.className='ac-recording-transcript';text.textContent=review.feedback;entry.append(text)}
   if(s.state==='submitted'){
    const form=document.createElement('form');form.className='ac-qa-review-form';
    const title=document.createElement('strong');title.textContent=review?'Update Central QA review':'Review completed recording';
    const controls=document.createElement('div');controls.className='inputs';
    const verdict=document.createElement('select');verdict.setAttribute('aria-label','Review verdict');
    for(const name of ['approved','needs_changes','rejected']){const option=document.createElement('option');option.value=name;option.textContent=name.replaceAll('_',' ');verdict.append(option)}
    verdict.value=review?.verdict||'approved';
    const score=document.createElement('select');score.setAttribute('aria-label','Quality score');
    for(let i=1;i<=5;i++){const option=document.createElement('option');option.value=String(i);option.textContent=i+' / 5';score.append(option)}
    score.value=String(review?.quality_score||4);controls.append(verdict,score);
    const feedback=document.createElement('textarea');feedback.placeholder='Specific QA feedback for the recording task';feedback.maxLength=4000;feedback.value=review?.feedback||'';
    const submit=document.createElement('button');submit.type='submit';submit.className='btn btn-primary';submit.textContent=review?'Update QA review':'Submit QA review';
    const result=document.createElement('span');result.className='ac-qa-review-status';result.setAttribute('role','status');
    form.append(title,controls,feedback,submit,result);
    form.onsubmit=async event=>{
     event.preventDefault();submit.disabled=true;result.textContent='Saving QA review…';
     try{
      const {data:{user},error:authError}=await db.auth.getUser();
      if(authError||!user)throw authError||new Error('Sign in again');
      const {error}=await db.from('vs_reviews').upsert({session_id:s.id,reviewer_id:user.id,verdict:verdict.value,quality_score:Number(score.value),feedback:feedback.value.trim()},{onConflict:'session_id'});
      if(error)throw error;
      result.textContent='Review saved for '+taskId(s.id);qa.textContent='QA: '+verdict.value+' · '+score.value+'/5';submit.textContent='Update QA review';
     }catch(e){result.textContent='Unable to save review: '+e.message}
     finally{submit.disabled=false}
    };
    entry.append(form);
   }
   host.append(entry);
  }
 if(!host.children.length){host.textContent='No Voice Studio session found for that task ID. Enter the complete VS-UUID (including all hyphens) and check the project.'}
 }catch(e){host.textContent='Unable to load voice recordings: '+e.message}
 finally{busy=false}
}
async function boot(){
 if(!P)return;
 for(let i=0;i<100;i++){
  if(window.__adatacoreProjectAccess?.allowed&&document.querySelector('.lab-nav [data-view="reviews"]'))break;
  await new Promise(resolve=>setTimeout(resolve,150));
 }
 const access=window.__adatacoreProjectAccess;
 if(!access?.is_super_admin)return;
 const {data,error}=await db.from('project_lab').select('project_type').eq('id',P).single();
 if(error||!data||!(data.project_type==='voice_recording'||P===94))return;
 if(!addView())return;
 if(location.hash==='#recordings')switchView();
}
boot();
})();