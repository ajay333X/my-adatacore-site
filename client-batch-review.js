(()=>{'use strict';
const $=id=>document.getElementById(id),token=new URLSearchParams(location.search).get('token')||'',endpoint='https://llmhyezgcnbognmmsnzq.supabase.co/functions/v1/transcription-client-bundle';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDuration=ms=>{const s=Math.max(0,Math.round(Number(ms||0)/1000)),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),r=s%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`:`${m}:${String(r).padStart(2,'0')}`};
const fmtDate=v=>v?new Date(v).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const decisionLabel=d=>d==='approved'?'Approved':d==='changes_requested'?'Changes requested':'Awaiting client review';
const decisionClass=d=>d==='approved'?'pill-green':d==='changes_requested'?'pill-red':'pill-gray';
async function load(){
  if(token.length<32){$('notice').textContent='This review collection link is incomplete.';$('notice').classList.add('error');return}
  try{
    const r=await fetch(`${endpoint}?token=${encodeURIComponent(token)}`,{cache:'no-store'}),doc=await r.json();
    if(!r.ok)throw Error(doc.error||'Unable to open review collection.');
    const stats=doc.stats||{};
    $('pageTitle').textContent=doc.bundle?.title||doc.project?.name||'Client review collection';
    $('pageSub').textContent=`${doc.project?.name||'Transcription'} · ${stats.task_count||0} submitted task${Number(stats.task_count||0)===1?'':'s'} · ${stats.remaining_count||0} awaiting client decision · link expires ${fmtDate(doc.bundle?.expires_at)}`;
    $('taskCount').textContent=Number(stats.task_count||0).toLocaleString();
    $('reviewedCount').textContent=Number(stats.reviewed_count||0).toLocaleString();
    $('approvedCount').textContent=Number(stats.approved_count||0).toLocaleString();
    $('changesCount').textContent=Number(stats.changes_requested_count||0).toLocaleString();
    $('totalDuration').textContent=fmtDuration(stats.total_duration_ms);
    $('totalWords').textContent=Number(stats.total_word_count||0).toLocaleString();
    $('notice').textContent='Play audio here or open any task to review its synchronized transcript, notes, clarity rating, and submit an approval decision.';
    const rows=Array.isArray(doc.items)?doc.items:[];
    $('taskList').innerHTML=rows.length?rows.map((x,i)=>{const d=x.client_decision||null;return `<article class="card task-card"><div class="task-top"><div><div class="task-title">${i+1}. ${esc(x.display_name||'Audio')}</div><div class="task-meta">${esc(x.task_id||'Task')} · ${esc(x.source_project_title||'Upload')} / ${esc(x.source_folder||'Root')} · submitted ${esc(fmtDate(x.submitted_at))}</div><div class="task-stats"><span class="pill pill-gray">${esc(fmtDuration(x.duration_ms))}</span><span class="pill pill-gray">${Number(x.segment_count||0)} segments</span><span class="pill pill-gray">${Number(x.word_count||0).toLocaleString()} words</span><span class="pill ${decisionClass(d?.decision)}">${esc(decisionLabel(d?.decision))}</span></div>${d?`<div class="decision-note"><strong>${esc(decisionLabel(d.decision))}</strong> by ${esc(d.reviewer_name||'Client')} · ${esc(fmtDate(d.created_at))}${d.note?`<br>${esc(d.note)}`:''}</div>`:''}</div><span class="pill pill-brand">${esc(String(x.status||'submitted').replaceAll('_',' '))}</span></div><div class="player-row"><audio controls preload="metadata" src="${esc(x.audio_url||'')}"></audio><a class="btn btn-primary" href="/client-transcript-review.html?bundle=${encodeURIComponent(token)}&item=${encodeURIComponent(x.item_id)}">Open transcript & review →</a></div></article>`}).join(''):'<div class="card empty">No tasks are available in this collection.</div>';
  }catch(e){
    $('notice').textContent=e.message;
    $('notice').classList.add('error');
    $('taskList').innerHTML=`<div class="card empty">${esc(e.message)}</div>`;
  }
}
load();
})();
