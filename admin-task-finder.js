(()=>{
  const cleanTaskKey=value=>String(value||'').trim().replace(/^task\s*[#:\-]?\s*/i,'').trim().toUpperCase();
  const isPublicTaskId=value=>/^[A-HJ-NP-Z][2-9][A-HJ-NP-Z][2-9][A-HJ-NP-Z][2-9][A-HJ-NP-Z][2-9][A-HJ-NP-Z][2-9][A-HJ-NP-Z][2-9][A-HJ-NP-Z][2-9]$/.test(cleanTaskKey(value));
  const legacyNumericTask=value=>/^\d+$/.test(cleanTaskKey(value));
  const taskKey=value=>isPublicTaskId(value)||legacyNumericTask(value)?cleanTaskKey(value):null;
  const statusClass=status=>['approved','completed','submitted'].includes(String(status||'').toLowerCase())?'pill-green':['rejected','blocked'].includes(String(status||'').toLowerCase())?'pill-red':'pill-brand';
  const safeMoney=v=>typeof fmtMoney==='function'?fmtMoney(v):'$'+Number(v||0).toFixed(2);
  const safeDate=v=>typeof fmtDate==='function'?fmtDate(v):(v?new Date(v).toLocaleString():'—');
  const publicId=(obj,fallback='—')=>obj?.public_task_id||fallback;

  const style=document.createElement('style');
  style.textContent=`
    .task-finder-result{border:1px solid rgba(124,92,255,.24);background:rgba(124,92,255,.055)}
    .task-finder-result:hover{background:rgba(124,92,255,.1)}
    .task-chain{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}
    .task-chain-btn{border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:8px;padding:7px 9px;font-size:10px;font-weight:800;cursor:pointer;letter-spacing:.02em}
    .task-chain-btn.current{border-color:rgba(124,92,255,.5);background:rgba(124,92,255,.1);color:var(--brand)}
    .task-chain-arrow{color:var(--muted2);font-size:11px}
    .task-public-id{font:800 13px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.035em}
    .task-rubric-rating{font-weight:800;text-transform:capitalize}
    .task-rubric-rating.good{color:#25a776}.task-rubric-rating.ok{color:#c88722}.task-rubric-rating.bad{color:#d84a63}
    .task-note{font-size:11px;color:var(--muted);line-height:1.6}
  `;
  document.head.appendChild(style);

  if(typeof finderTrigger!=='undefined'){
    const kbd=finderTrigger.querySelector('kbd');
    finderTrigger.childNodes.forEach(n=>{if(n.nodeType===Node.TEXT_NODE&&n.textContent.trim())n.textContent='Find participant or task '});
    if(kbd)finderTrigger.appendChild(kbd);
  }
  if(typeof finderInput!=='undefined'){
    finderInput.placeholder='Search email, contributor UID, or Task ID…';
    finderInput.setAttribute('aria-label','Search participant or task');
  }
  const finderTitle=document.getElementById('finderTitle');
  if(finderTitle)finderTitle.textContent='Global finder · Search by email, contributor UID, or exact alphanumeric Task ID.';

  function addTaskCandidate(){
    const key=taskKey(finderInput?.value);
    if(!key||!finderResults||snapshotEl.classList.contains('visible'))return;
    const existing=finderResults.innerHTML;
    const label=isPublicTaskId(key)?key:`Legacy task ${key}`;
    const taskRow=`<button class="finder-result task-finder-result" data-task-key="${esc(key)}" type="button"><div><div class="finder-result-name task-public-id">${esc(label)}</div><div class="finder-result-meta">Open complete L1/L2 lifecycle · submission · reviewer · payment</div></div><span class="pill pill-brand">Task</span></button>`;
    finderResults.innerHTML=taskRow+(existing.includes('finder-empty')?'':existing);
  }

  async function lookupTask(key){
    key=taskKey(key)||cleanTaskKey(key);
    if(!key)return;
    snapshotEl.className='participant-snapshot visible';
    snapshotEl.innerHTML='<div class="snapshot-loading">Loading complete task lifecycle…</div>';
    finderResults.style.display='none';
    const {data,error}=await db.rpc('admin_get_task_snapshot_by_key',{p_task_key:key});
    if(error){snapshotEl.innerHTML=`<div class="snapshot-loading">${esc(error.message)}</div>`;return}
    if(!data){snapshotEl.innerHTML=`<div class="snapshot-loading">Task ${esc(key)} was not found.</div>`;return}
    renderTaskSnapshot(data);
  }

  function personCard(label,p){
    if(!p)return `<div class="snapshot-field"><span>${label}</span><strong>Not assigned</strong></div>`;
    return `<div class="snapshot-field"><span>${label}</span><strong>${esc(p.name||p.uid||p.email||'—')}</strong><div class="subtle" style="margin-top:4px">${esc(p.email||'')} ${p.uid?'· UID '+esc(p.uid):''}</div></div>`;
  }

  function renderTaskSnapshot(d){
    const t=d.task||{},links=d.links||{},l1=d.l1_task||null,l2=d.l2_task||null,s=d.submission||null,r=d.review||null,p=d.payment||null,rec=d.recording||null,timeline=d.timeline||{};
    const searched=d.searched_public_task_id||t.public_task_id||String(d.searched_task_id||'');
    const l1Public=links.l1_public_task_id||publicId(l1,null),l2Public=links.l2_public_task_id||publicId(l2,null);
    const chain=[];
    if(l1Public)chain.push(`<button class="task-chain-btn ${l1Public===searched?'current':''}" data-open-task="${esc(l1Public)}">L1 · ${esc(l1Public)}</button>`);
    if(l1Public&&l2Public)chain.push('<span class="task-chain-arrow">→</span>');
    if(l2Public)chain.push(`<button class="task-chain-btn ${l2Public===searched?'current':''}" data-open-task="${esc(l2Public)}">L2 · ${esc(l2Public)}</button>`);
    if(links.submission_id)chain.push(`<span class="task-chain-arrow">· Submission #${Number(links.submission_id)}</span>`);

    const rubricEntries=r?.rubric&&typeof r.rubric==='object'?Object.entries(r.rubric):[];
    const rubricHtml=rubricEntries.length?rubricEntries.map(([name,val])=>`<tr><td><strong>${esc(String(name).replace(/^(Audio|Content)\s*·\s*/,''))}</strong></td><td><span class="task-rubric-rating ${esc(val?.rating||'')}">${esc(val?.rating||'—')}</span></td><td>${esc(val?.feedback||'—')}</td></tr>`).join(''):'<tr><td colspan="3" class="muted">No completed L2 rubric yet.</td></tr>';
    const timelineLabels={l1_assigned_at:'L1 assigned',l1_submitted_at:'L1 submitted',l2_assigned_at:'L2 assigned',l2_claimed_at:'L2 claimed',l2_reviewed_at:'L2 reviewed',approved_at:'Submission approved',rejected_at:'Submission rejected',payment_scheduled_for:'Payment scheduled',payment_processing_at:'Payment processing',paid_at:'Payment paid'};
    const timelineHtml=Object.entries(timeline).filter(([,v])=>v).map(([k,v])=>`<tr><td><strong>${esc(timelineLabels[k]||k)}</strong></td><td>${safeDate(v)}</td></tr>`).join('')||'<tr><td colspan="2" class="muted">No lifecycle events yet.</td></tr>';
    const paymentStatus=p?.status||'Not created';
    const paymentClass=p?.status==='paid'?'pill-green':p?.status==='on_hold'?'pill-red':'pill-brand';
    const reviewStatus=r?.decision?r.decision:(r?.claimed_at?'Claimed / awaiting review':'Not reviewed');
    const currentPublic=t.public_task_id||searched||'—';

    snapshotEl.innerHTML=`
      <div class="snapshot-head">
        <div>
          <div class="snapshot-name"><span class="task-public-id">${esc(currentPublic)}</span> · ${esc(t.layer||'—')}</div>
          <div class="snapshot-meta">${esc(t.project||'Project')} · assigned ${safeDate(t.assigned_at)}</div>
          <div class="snapshot-badges"><span class="pill ${statusClass(t.status)}">${esc(t.status||'unknown')}</span><span class="pill pill-gray">${esc(t.layer||'—')}</span><span class="pill pill-gray">Rate ${safeMoney(t.rate)}</span></div>
          <div class="task-chain">${chain.join('')}</div>
        </div>
        <div class="snapshot-actions">${rec?.audio_path?'<button class="btn btn-secondary" data-play-task-audio="1">Play audio</button>':''}${r?.id?'<a class="btn btn-secondary" href="/admin/reviews">L2 review results</a>':''}</div>
      </div>
      <div class="snapshot-stats">
        <div class="card snapshot-stat"><div class="stat-label">Current Task ID</div><strong class="task-public-id">${esc(currentPublic)}</strong><div class="stat-foot">${esc(t.layer||'—')} · ${esc(t.status||'—')}</div></div>
        <div class="card snapshot-stat"><div class="stat-label">L1 Task ID</div><strong class="task-public-id">${esc(l1Public||'—')}</strong><div class="stat-foot">${l1?esc(l1.status||'—'):'Not linked yet'}</div></div>
        <div class="card snapshot-stat"><div class="stat-label">L2 Task ID</div><strong class="task-public-id">${esc(l2Public||'—')}</strong><div class="stat-foot">${l2?esc(l2.status||'—'):'Not linked yet'}</div></div>
        <div class="card snapshot-stat"><div class="stat-label">Submission</div><strong>${links.submission_id?'#'+Number(links.submission_id):'—'}</strong><div class="stat-foot">${s?esc(s.status||'—'):'Not submitted'}</div></div>
        <div class="card snapshot-stat"><div class="stat-label">L1 earning</div><strong>${s?safeMoney(s.amount):'—'}</strong><div class="stat-foot">Submission earning</div></div>
        <div class="card snapshot-stat"><div class="stat-label">Payment</div><strong style="font-size:15px">${esc(paymentStatus)}</strong><div class="stat-foot">${p?.paid_at?'Paid '+safeDate(p.paid_at):p?.scheduled_for?'Scheduled '+safeDate(p.scheduled_for):'Current payout state'}</div></div>
        <div class="card snapshot-stat"><div class="stat-label">L2 result</div><strong style="font-size:15px">${esc(reviewStatus)}</strong><div class="stat-foot">${r?.reviewed_at?safeDate(r.reviewed_at):r?.claimed_at?'Claimed '+safeDate(r.claimed_at):'No review yet'}</div></div>
        <div class="card snapshot-stat"><div class="stat-label">Recording</div><strong>${rec?Number(rec.duration_seconds||0)+'s':'—'}</strong><div class="stat-foot">${rec?'Private audio stored':'No linked recording'}</div></div>
      </div>
      <div class="snapshot-grid">
        <section class="card snapshot-card"><h3>People</h3><div class="snapshot-profile">${personCard('L1 contributor',d.l1_contributor)}${personCard('L2 reviewer',d.l2_reviewer)}</div></section>
        <section class="card snapshot-card"><h3>Task relationship</h3><div class="snapshot-profile"><div class="snapshot-field"><span>Searched Task ID</span><strong class="task-public-id">${esc(searched)}</strong></div><div class="snapshot-field"><span>Project</span><strong>${esc(t.project||'—')}</strong></div><div class="snapshot-field"><span>L1 Task ID</span><strong class="task-public-id">${esc(l1Public||'—')}</strong></div><div class="snapshot-field"><span>L2 Task ID</span><strong class="task-public-id">${esc(l2Public||'—')}</strong></div><div class="snapshot-field"><span>L1 rate</span><strong>${l1?safeMoney(l1.rate):'—'}</strong></div><div class="snapshot-field"><span>L2 rate</span><strong>${l2?safeMoney(l2.rate):'—'}</strong></div></div></section>
        <section class="card snapshot-card"><h3>Submission & payment</h3><div class="snapshot-profile"><div class="snapshot-field"><span>Submission</span><strong>${s?'#'+Number(s.id):'—'}</strong></div><div class="snapshot-field"><span>Submitted</span><strong>${s?safeDate(s.submitted_at):'—'}</strong></div><div class="snapshot-field"><span>Submission status</span><strong>${esc(s?.status||'—')}</strong></div><div class="snapshot-field"><span>Earned amount</span><strong>${s?safeMoney(s.amount):'—'}</strong></div><div class="snapshot-field"><span>Payment status</span><strong><span class="pill ${paymentClass}">${esc(paymentStatus)}</span></strong></div><div class="snapshot-field"><span>Payment reference</span><strong>${esc(p?.reference||'—')}</strong></div></div></section>
        <section class="card snapshot-card"><h3>Recording</h3><div class="snapshot-profile"><div class="snapshot-field"><span>Recording ID</span><strong>${esc(rec?.id||'—')}</strong></div><div class="snapshot-field"><span>Duration</span><strong>${rec?Number(rec.duration_seconds||0)+' seconds':'—'}</strong></div><div class="snapshot-field"><span>Stored</span><strong>${rec?safeDate(rec.submitted_at):'—'}</strong></div><div class="snapshot-field"><span>Audit state</span><strong>${esc(rec?.audit_status||'—')}</strong></div></div>${rec?.audio_path?'<div class="task-note" style="margin-top:12px">The recording is stored privately. Use “Play audio” above to open a temporary signed URL.</div>':''}</section>
        <section class="card snapshot-card snapshot-section-full"><h3>L2 review rubric</h3><div class="snapshot-table-wrap"><table class="snapshot-table"><thead><tr><th>Criterion</th><th>Rating</th><th>Feedback</th></tr></thead><tbody>${rubricHtml}</tbody></table></div>${r?.feedback?`<div class="task-note" style="margin-top:12px"><strong>Overall feedback:</strong> ${esc(r.feedback)}</div>`:''}</section>
        <section class="card snapshot-card snapshot-section-full"><h3>Task lifecycle</h3><div class="snapshot-table-wrap"><table class="snapshot-table"><thead><tr><th>Event</th><th>Time</th></tr></thead><tbody>${timelineHtml}</tbody></table></div></section>
      </div>`;
    snapshotEl.dataset.taskAudio=rec?.audio_path||'';
  }

  finderInput.addEventListener('input',()=>setTimeout(addTaskCandidate,0));
  finderResults.addEventListener('click',e=>{
    const taskButton=e.target.closest('[data-task-key]');
    if(taskButton){e.preventDefault();lookupTask(taskButton.dataset.taskKey);}
  });
  finderInput.addEventListener('keydown',e=>{
    if(e.key!=='Enter')return;
    const key=taskKey(finderInput.value);
    if(key){e.preventDefault();e.stopImmediatePropagation();lookupTask(key);}
  },true);
  snapshotEl.addEventListener('click',e=>{
    const link=e.target.closest('[data-open-task]');
    if(link){e.preventDefault();lookupTask(link.dataset.openTask);return}
    const play=e.target.closest('[data-play-task-audio]');
    if(play){e.preventDefault();const path=snapshotEl.dataset.taskAudio;if(path)playRecording(path);}
  });
})();
