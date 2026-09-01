(() => {
  if (window.__adatacoreAccountControls) return;
  window.__adatacoreAccountControls = true;
  let accountControls = null, loading = false;
  const style = document.createElement('style');
  style.textContent = `.phone-country-grid{display:grid;grid-template-columns:minmax(180px,1fr) minmax(150px,1fr);gap:12px}.phone-help{font-size:12px;color:var(--muted);line-height:1.6;margin-top:8px}.daily-cap-banner{margin-bottom:14px;padding:15px;border:1px solid var(--line);border-radius:13px;background:var(--panel);display:flex;align-items:center;justify-content:space-between;gap:14px}.daily-cap-title{font-size:13px;font-weight:750}.daily-cap-meta{font-size:12px;color:var(--muted);margin-top:5px}.daily-cap-number{font-size:20px;font-weight:800;white-space:nowrap}.daily-cap-error{color:var(--red)}@media(max-width:700px){.phone-country-grid{grid-template-columns:1fr}.daily-cap-banner{align-items:flex-start;flex-direction:column}}`;
  document.head.appendChild(style);
  const legacyPhone=document.getElementById('phone'),form=document.getElementById('profileForm');
  if(!legacyPhone||!form)return;
  const phoneBox=legacyPhone.parentElement;phoneBox.style.gridColumn='1 / -1';
  // Keep the legacy hidden field for the existing profile renderer.
  legacyPhone.type='hidden';const mount=document.createElement('div');phoneBox.querySelector('label')?.remove();phoneBox.appendChild(mount);
  const phone=AdatacorePhone.mount(mount);
  const section=document.getElementById('view-assignments'),box=document.createElement('div');box.id='dailyCapBanner';box.className='daily-cap-banner';box.setAttribute('role','status');section.prepend(box);
  function renderDailyCap(error='') {
    if(error){box.textContent=error;return}
    if(!accountControls){box.textContent='Loading daily task allowance…';return}
    const limit=accountControls.daily_task_limit,used=Number(accountControls.daily_tasks_started_today||0),remaining=Number(accountControls.daily_tasks_remaining||0);
    box.innerHTML=`<div><div class="daily-cap-title">Daily task allowance</div><div class="daily-cap-meta">${used} started today · ${limit==null?'No daily limit':`Limit: ${Number(limit)}`} · resets at 00:00 UTC (05:30 IST)</div><div class="daily-cap-meta">Each new task or review uses one slot. Resuming the same work does not use another.</div></div><div class="daily-cap-number">${limit==null?'Unlimited':`${remaining} left`}</div>`;
  }
  async function loadAccountControls() {
    if(loading)return;loading=true;
    try {const {data,error}=await db.rpc('get_my_account_controls');if(error)throw error;accountControls=data;phone.set(data);renderDailyCap();}
    catch(_){renderDailyCap('Unable to load the daily allowance. Refresh to try again.');}
    finally{loading=false;}
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();e.stopImmediatePropagation();
    const button=document.getElementById('saveBtn'),notice=document.getElementById('saveNotice');if(button.disabled)return;
    if(!accountControls){notice.textContent='Account details are still loading. Please refresh if this continues.';notice.className='notice error';return}
    let value;try{value=phone.get()}catch(error){notice.textContent=error.message;notice.className='notice error';phone.focus();return}
    button.disabled=true;notice.textContent='Saving…';notice.className='notice';
    const fields={fullName:document.getElementById('fullName').value.trim(),dateOfBirth:document.getElementById('dob').value||null,education:document.getElementById('education').value.trim()||null,occupation:document.getElementById('occupation').value.trim()||null};
    try {
      const {data,error}=await db.rpc('update_my_profile',{p_full_name:fields.fullName,p_dob:fields.dateOfBirth,p_education:fields.education,p_occupation:fields.occupation,p_country_iso2:value.country,p_national_phone:value.national});if(error)throw error;
      accountControls=data;Object.assign(profile,fields,{phone:data.phone_national});phone.set(data,true);renderProfile();renderDailyCap();notice.textContent=data.phone_e164?`Saved · ${data.phone_e164}`:'Saved';notice.className='notice ok';
    } catch(error){notice.textContent=String(error.message||'Unable to save. Please try again.').replace(/_/g,' ');notice.className='notice error';}
    finally{button.disabled=false;}
  },true);
  document.addEventListener('click',async e=>{
    const b=e.target.closest('.task-open');if(!b||b.dataset.layer!=='L1'||b.dataset.transcription)return;
    e.preventDefault();e.stopImmediatePropagation();if(b.disabled)return;
    b.disabled=true;const old=b.textContent;b.textContent='Opening…';
    try{const {error}=await db.rpc('begin_assigned_task',{p_task_id:Number(b.dataset.id)});if(error)throw error;location.href=`/voice-engine?project=${b.dataset.title}&task=${Number(b.dataset.id)}`;}
    catch(error){b.disabled=false;b.textContent=old;await loadAccountControls();const message=String(error.message||'');box.textContent=message.includes('DAILY_TASK_LIMIT_REACHED')?'You have reached your daily task limit. New tasks unlock at 00:00 UTC (05:30 IST).':message.replace(/_/g,' ');section.prepend(box);location.hash='assignments';}
  },true);
  renderDailyCap();loadAccountControls();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadAccountControls()});
  window.addEventListener('hashchange',()=>{if(location.hash==='#assignments'||location.hash==='#profile')loadAccountControls()});
})();
