(()=>{
  if(window.__adatacoreAccountControls)return;window.__adatacoreAccountControls=true;
  let countries=[],accountControls=null;
  const style=document.createElement('style');style.textContent=`
    .phone-country-grid{display:grid;grid-template-columns:minmax(175px,1.4fr) 92px minmax(150px,1fr);gap:8px;align-items:end}.phone-help{font-size:10px;color:var(--muted);line-height:1.5;margin-top:7px}.daily-cap-banner{margin-bottom:14px;padding:13px 15px;border:1px solid var(--line);border-radius:13px;background:var(--panel);display:flex;align-items:center;justify-content:space-between;gap:14px}.daily-cap-title{font-size:11px;font-weight:800}.daily-cap-meta{font-size:10px;color:var(--muted);margin-top:4px}.daily-cap-number{font-size:18px;font-weight:850;white-space:nowrap}.phone-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:800;text-align:center}@media(max-width:700px){.phone-country-grid{grid-template-columns:1fr}.daily-cap-banner{align-items:flex-start;flex-direction:column}}
  `;document.head.appendChild(style);

  const legacyPhone=document.getElementById('phone'),form=document.getElementById('profileForm');
  if(!legacyPhone||!form)return;
  const phoneBox=legacyPhone.parentElement,label=phoneBox.querySelector('label');if(label)label.textContent='Phone number';legacyPhone.type='hidden';legacyPhone.style.display='none';
  const controls=document.createElement('div');controls.innerHTML=`<div class="phone-country-grid"><div><label class="field">Country / calling code</label><select id="phoneCountry" class="input"><option value="">Select country</option></select></div><div><label class="field">Code</label><input id="phoneCallingCode" class="input phone-code" readonly placeholder="+—"></div><div><label class="field">National number</label><input id="phoneNational" class="input" inputmode="numeric" autocomplete="tel-national" placeholder="Phone number"></div></div><div class="phone-help">Select the country first. Adatacore stores the phone in international E.164 format and will not save a number without a recognized country calling code.</div>`;phoneBox.appendChild(controls);
  const countryEl=document.getElementById('phoneCountry'),callingEl=document.getElementById('phoneCallingCode'),nationalEl=document.getElementById('phoneNational');
  nationalEl.addEventListener('input',()=>{nationalEl.value=nationalEl.value.replace(/\D/g,'').slice(0,14)});
  countryEl.addEventListener('change',()=>{callingEl.value=countries.find(x=>x.iso2===countryEl.value)?.calling_code||''});

  function syncPhone(){if(!accountControls)return;countryEl.value=accountControls.phone_country_iso2||'';callingEl.value=countries.find(x=>x.iso2===countryEl.value)?.calling_code||accountControls.phone_calling_code||'';nationalEl.value=accountControls.phone_national||'';renderDailyCap()}
  function renderDailyCap(){const section=document.getElementById('view-assignments');if(!section||!accountControls)return;let box=document.getElementById('dailyCapBanner');if(!box){box=document.createElement('div');box.id='dailyCapBanner';box.className='daily-cap-banner';section.insertBefore(box,section.firstChild)}const limit=accountControls.daily_task_limit,used=Number(accountControls.daily_tasks_started_today||0),remaining=accountControls.daily_tasks_remaining;const unlimited=limit==null;box.innerHTML=`<div><div class="daily-cap-title">Daily task capacity</div><div class="daily-cap-meta">${unlimited?'No daily cap is set for your account.':`${used} of ${Number(limit)} task${Number(limit)===1?'':'s'} started today · resets at 00:00 UTC`}</div></div><div class="daily-cap-number">${unlimited?'Unlimited':`${Math.max(Number(remaining||0),0)} left`}</div>`;}
  async function loadCountries(){const {data,error}=await db.from('phone_country_codes').select('iso2,country_name,calling_code').order('country_name');if(error)return;countries=data||[];countryEl.innerHTML='<option value="">Select country</option>'+countries.map(c=>`<option value="${String(c.iso2).replace(/"/g,'')}">${String(c.country_name).replace(/</g,'&lt;')} (${String(c.calling_code)})</option>`).join('');syncPhone()}
  async function loadAccountControls(){const {data,error}=await db.rpc('get_my_account_controls');if(error)return;accountControls=data||{};syncPhone()}

  if(typeof renderProfile==='function'){const baseRenderProfile=renderProfile;renderProfile=function(){baseRenderProfile();syncPhone()}}

  form.addEventListener('submit',async e=>{
    e.preventDefault();e.stopImmediatePropagation();
    const saveBtn=document.getElementById('saveBtn'),notice=document.getElementById('saveNotice');saveBtn.disabled=true;notice.textContent='Saving…';notice.className='notice';
    const iso=countryEl.value||null,national=nationalEl.value.trim();
    if((iso&&!national)||(!iso&&national)){notice.textContent='Select a country and enter the phone number together.';notice.className='notice error';saveBtn.disabled=false;return}
    const {data,error}=await db.rpc('update_my_profile',{p_full_name:document.getElementById('fullName').value.trim(),p_dob:document.getElementById('dob').value||null,p_education:document.getElementById('education').value.trim()||null,p_occupation:document.getElementById('occupation').value.trim()||null,p_country_iso2:iso,p_national_phone:national||null});
    if(error){notice.textContent=String(error.message||'Unable to save profile').replace(/_/g,' ').replace(/^PHONE /,'Phone ');notice.className='notice error';saveBtn.disabled=false;return}
    accountControls=data||accountControls;if(typeof profile!=='undefined'&&profile){profile.fullName=document.getElementById('fullName').value.trim();profile.dateOfBirth=document.getElementById('dob').value||null;profile.education=document.getElementById('education').value.trim()||null;profile.occupation=document.getElementById('occupation').value.trim()||null;profile.phone=accountControls?.phone_national||null}
    if(typeof renderProfile==='function')renderProfile();notice.textContent=accountControls?.phone_e164?`Saved · ${accountControls.phone_e164}`:'Saved';notice.className='notice ok';saveBtn.disabled=false;
  },true);

  document.addEventListener('click',async e=>{
    const b=e.target.closest('.task-open');if(!b||b.dataset.layer!=='L1')return;
    e.preventDefault();e.stopImmediatePropagation();if(b.disabled)return;b.disabled=true;const old=b.textContent;b.textContent='Opening…';
    const {error}=await db.rpc('begin_assigned_task',{p_task_id:Number(b.dataset.id)});
    if(error){const msg=String(error.message||'');b.disabled=false;b.textContent=old;if(msg.includes('DAILY_TASK_LIMIT_REACHED')){const lim=msg.split(':').pop();alert(`Daily task limit reached (${lim}). You can start more tasks after the daily reset.`)}else alert(msg.replace(/_/g,' '));return}
    const title=b.dataset.title;location.href=`/voice-engine?project=${title}&task=${Number(b.dataset.id)}`;
  },true);

  Promise.all([loadCountries(),loadAccountControls()]).then(()=>{syncPhone();renderDailyCap()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadAccountControls()});
})();
