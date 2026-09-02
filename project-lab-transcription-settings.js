(()=>{
  'use strict';
  if(window.__adatacoreProjectLabTxSettings)return;
  window.__adatacoreProjectLabTxSettings=true;
  if(!window.supabase?.createClient)return;

  const projectId=Number(new URLSearchParams(location.search).get('project')||0);
  if(!projectId)return;
  const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',{auth:{persistSession:true,autoRefreshToken:true}});
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let settings=null;

  async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data}
  function signal(){try{localStorage.setItem(`adatacore-project-updated:${projectId}`,String(Date.now()))}catch(_){}}
  function message(text,bad=false){const n=$('txProjectSettingsMessage');if(!n)return;n.textContent=text;n.style.color=bad?'#b42334':'var(--muted)'}

  function ensureCard(){
    if($('txProjectSettingsCard'))return true;
    const view=$('view-settings');
    const firstCard=view?.querySelector('.card.lab-card');
    if(!view||!firstCard)return false;
    const card=document.createElement('div');
    card.id='txProjectSettingsCard';
    card.className='card lab-card';
    card.style.marginTop='12px';
    card.innerHTML=`
      <div class="section-bar" style="margin-top:0">
        <div><h2>Transcription configuration</h2><p>These settings are shared directly with Transcription Lab and contributor audio billing.</p></div>
        <span id="txProjectSyncBadge" class="pill pill-green">Synced</span>
      </div>
      <div class="field-grid">
        <div class="field"><label>Transcription language</label><select id="txProjectLanguage" class="input"><option value="hi">Hindi</option><option value="en">English</option><option value="mr">Marathi</option><option value="bn">Bengali</option><option value="ta">Tamil</option><option value="te">Telugu</option><option value="gu">Gujarati</option><option value="kn">Kannada</option><option value="ml">Malayalam</option><option value="pa">Punjabi</option><option value="ur">Urdu</option></select></div>
        <div class="field"><label>Audio billing currency</label><select id="txProjectCurrency" class="input"><option>USD</option><option>INR</option><option>EUR</option><option>GBP</option><option>CAD</option><option>AUD</option></select></div>
        <div class="field"><label>Transcription hourly rate</label><input id="txProjectHourlyRate" class="input" type="number" min="0" step="0.0001"></div>
        <div class="field"><label>Current general rates</label><div id="txProjectGeneralRates" class="input" style="display:flex;align-items:center;background:var(--panel2);cursor:default"></div></div>
        <div class="field wide"><div id="txProjectBillingNote" style="padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel2);font-size:10px;line-height:1.6"></div></div>
      </div>
      <div class="toolbar" style="margin-top:12px"><button id="txProjectSettingsSave" class="btn btn-primary">Save transcription settings</button><span id="txProjectSettingsMessage" class="tiny muted"></span></div>`;
    firstCard.insertAdjacentElement('afterend',card);
    $('txProjectSettingsSave').onclick=save;
    return true;
  }

  function render(){
    if(!settings||!ensureCard())return;
    $('txProjectLanguage').value=settings.language||'hi';
    const currency=String(settings.currency||'USD').toUpperCase();
    if(![...$('txProjectCurrency').options].some(o=>o.value===currency))$('txProjectCurrency').add(new Option(currency,currency));
    $('txProjectCurrency').value=currency;
    $('txProjectHourlyRate').value=Number(settings.hourly_rate||0);
    $('txProjectGeneralRates').textContent=`L1 ${Number(settings.l1_rate||0).toFixed(2)} · L2 ${Number(settings.l2_rate||0).toFixed(2)}`;
    const zero=Number(settings.hourly_rate||0)===0;
    $('txProjectBillingNote').innerHTML=zero
      ?'<strong style="color:#b36f14">Audio billing is currently 0 per hour.</strong><br>L1/L2 rates above are general project rates and do not control transcription audio-hour earnings. Set an hourly rate here if contributors should earn by audio duration.'
      :`Contributor transcription earnings use <strong>${esc(currency)} ${Number(settings.hourly_rate).toFixed(4)} per audio hour</strong>. L1/L2 general rates remain separate.`;
    $('txProjectSyncBadge').textContent='Synced with Transcription Lab';
  }

  async function load(){
    try{
      settings=await rpc('admin_get_transcription_project_settings',{p_project_id:projectId});
      render();
    }catch(error){
      if(/Not a transcription project/i.test(error.message))return;
      if(ensureCard())message(error.message,true);
    }
  }

  async function save(){
    const button=$('txProjectSettingsSave');
    if(!button)return;
    const rate=Number($('txProjectHourlyRate').value);
    if(!Number.isFinite(rate)||rate<0)return message('Hourly rate must be zero or greater.',true);
    button.disabled=true;message('Saving…');
    try{
      settings=await rpc('admin_update_transcription_project_settings',{
        p_project_id:projectId,
        p_language:$('txProjectLanguage').value,
        p_hourly_rate:rate,
        p_currency:$('txProjectCurrency').value
      });
      render();signal();message('Saved. Transcription Lab now reads these exact settings.');
    }catch(error){message(error.message,true)}
    finally{button.disabled=false}
  }

  const genericSave=$('saveSettingsBtn');
  if(genericSave)genericSave.addEventListener('click',()=>setTimeout(()=>{load();signal()},900));
  const refresh=$('refreshBtn');
  if(refresh)refresh.addEventListener('click',()=>setTimeout(load,500));
  window.addEventListener('focus',()=>load());
  setTimeout(load,120);
})();
