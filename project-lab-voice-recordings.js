(()=>{
'use strict';
if(window.__acVoiceAudioLab)return;window.__acVoiceAudioLab=true;
const P=Number(new URLSearchParams(location.search).get('project')||0);
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
const $=id=>document.getElementById(id);
let busy=false;
const css='<style id="acAudioLabCss">'+
'.ac-recording-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}.ac-recording-stat{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:15px}.ac-recording-stat span{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.ac-recording-stat strong{font-size:25px;display:block;margin-top:5px}.ac-recording-item{border:1px solid var(--line);border-radius:13px;padding:16px;background:var(--panel);margin:10px 0}.ac-recording-title{display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap}.ac-recording-title strong{font-size:12px}.ac-recording-meta{margin-top:6px;color:var(--muted);font-size:10px;line-height:1.55}.ac-recording-track{border-top:1px solid var(--line);padding-top:10px;margin-top:10px}.ac-recording-track audio{display:block;width:100%;max-width:700px;margin:10px 0 0}.ac-recording-track details{margin:12px 0 0}.ac-recording-track summary{cursor:pointer;font-size:11px;font-weight:800}.ac-recording-transcript{white-space:pre-wrap;background:var(--panel2);border-radius:10px;padding:12px;font-size:12px;line-height:1.8;max-height:160px;overflow:auto;margin-top:8px}.ac-recording-qa{margin-top:10px;font-size:11px;font-weight:750;color:var(--muted)}@media(max-width:700px){.ac-recording-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>';
function addView(){
 const anchor=document.querySelector('.lab-nav [data-view="reviews"]'),main=document.querySelector('.lab-main');
 if(!anchor||!main)return false;
 const button=document.createElement('button');button.dataset.view='recordings';button.textContent='◉ Voice recordings';anchor.after(button);
 button.onclick=()=>switchView();
 const section=document.createElement('section');section.id='view-recordings';section.className='lab-view';
 section.innerHTML='<div class="view-head"><div><div class="eyebrow">Audio production</div><h1>Recordings & audio summaries</h1><p>Submitted audio tracks, durations, Hindi transcript drafts and review results are available here.</p></div><div class="toolbar"><button id="acRecordRefresh" class="btn btn-secondary" type="button">Refresh recordings</button><a id="acRecordQaLink" class="btn btn-primary" href="/voice-studio" target="_blank" rel="noopener">Open Voice Studio QA ↗</a></div></div><div id="acRecordingStats" class="ac-recording-stats"></div><div id="acRecordingItems" aria-live="polite">Choose this section to view recordings.</div>';
 main.append(section);document.head.insertAdjacentHTML('beforeend',css);
 new MutationObserver(()=>{if(section.classList.contains('active'))void read()}).observe(section,{attributes:true,attributeFilter:['class']});
 $('acRecordRefresh').onclick=()=>void read();
 return true;
}
function switchView(){
 document.querySelectorAll('.lab-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view==='recordings'));
 document.querySelectorAll('.lab-view').forEach(v=>v.classList.toggle('active',v.id==='view-recordings'));
 history.replaceState(null,'','/admin/project-lab?project='+P+'#recordings');
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
 const host=$('acRecordingItems'),stats=$('acRecordingStats');host.textContent='Loading recordings…';
 try{
  const {data:sessions,error}=await db.from('vs_sessions').select('id,mode,state,created_at,script_id,actor_a,actor_b').eq('project_id',P).order('created_at',{ascending:false}).limit(150);
  if(error)throw error;
  const ids=(sessions||[]).map(s=>s.id);
  let tracks=[],reviews=[],scripts=[];
  if(ids.length){
   const results=await Promise.all([
    db.from('vs_tracks').select('session_id,actor_id,storage_path,duration_seconds,bytes,submitted_at,transcript').in('session_id',ids),
    db.from('vs_reviews').select('session_id,verdict,quality_score,feedback,reviewed_at').in('session_id',ids),
    db.from('vs_scripts').select('id,title').eq('project_id',P)
   ]);
   for(const res of results)if(res.error)throw res.error;
   [tracks,reviews,scripts]=results.map(x=>x.data||[]);
  }
  stats.replaceChildren(addStat('Recent sessions',sessions.length),addStat('Uploaded tracks',tracks.length),addStat('Completed sessions',sessions.filter(s=>s.state==='submitted').length),addStat('Reviewed',reviews.length));
  host.textContent='';
  if(!tracks.length){
   const p=document.createElement('div');p.className='card lab-card';p.textContent='No submitted audio yet. Completed recordings will automatically appear here with playback and transcript drafts.';host.append(p);return;
  }
  for(const s of sessions.filter(s=>tracks.some(t=>t.session_id===s.id))){
   const entry=document.createElement('article');entry.className='ac-recording-item';
   const top=document.createElement('div');top.className='ac-recording-title';
   const heading=document.createElement('strong');heading.textContent=scripts.find(x=>x.id===s.script_id)?.title||'Voice Studio session';
   const pill=document.createElement('span');pill.className='pill pill-gray';pill.textContent=s.state==='submitted'?'Submitted':s.state;
   top.append(heading,pill);entry.append(top);
   const sub=document.createElement('div');sub.className='ac-recording-meta';sub.textContent=new Date(s.created_at).toLocaleString()+' · '+s.mode+' · '+tracks.filter(t=>t.session_id===s.id).length+' audio track(s)';entry.append(sub);
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
   host.append(entry);
  }
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