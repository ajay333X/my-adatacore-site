(()=>{
  'use strict';
  if(window.__adatacoreTxProjectSync)return;
  window.__adatacoreTxProjectSync=true;
  if(!window.supabase?.createClient)return;

  const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',{auth:{persistSession:true,autoRefreshToken:true}});
  const $=id=>document.getElementById(id);
  let lastProject=null,refreshTimer=null;
  const projectId=()=>Number(new URLSearchParams(location.search).get('project'))||null;
  const languageName=code=>({hi:'Hindi',en:'English',mr:'Marathi',bn:'Bengali',ta:'Tamil',te:'Telugu',gu:'Gujarati',kn:'Kannada',ml:'Malayalam',pa:'Punjabi',ur:'Urdu'})[code]||String(code||'—').toUpperCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data}

  function ensure(){
    if($('txSyncedProjectSettings'))return true;
    const desc=$('projectDescription');
    if(!desc)return false;
    const wrap=document.createElement('div');
    wrap.id='txSyncedProjectSettings';
    wrap.style.cssText='display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-top:8px';
    desc.insertAdjacentElement('afterend',wrap);
    return true;
  }

  function pill(text,tone=''){return `<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;border:1px solid ${tone==='warn'?'#ecd8ab':'#dfe4ec'};background:${tone==='warn'?'#fff9ec':'#f8fafc'};font-size:10px;color:${tone==='warn'?'#8b5e18':'#475467'}">${esc(text)}</span>`}

  function render(s){
    if(!ensure())return;
    if($('projectName'))$('projectName').textContent=s.name||'Transcription';
    if($('projectDescription'))$('projectDescription').textContent=s.description||'';
    const hourly=Number(s.hourly_rate||0),currency=String(s.currency||'USD').toUpperCase();
    $('txSyncedProjectSettings').innerHTML=[
      pill(s.lifecycle_status==='active'?'Active':String(s.lifecycle_status||'—')),
      pill(s.published?'Published':'Unpublished',s.published?'':'warn'),
      pill(languageName(s.language)),
      pill(`L1 rate ${Number(s.l1_rate||0).toFixed(2)}`),
      pill(`L2 rate ${Number(s.l2_rate||0).toFixed(2)}`),
      pill(`Audio billing ${currency} ${hourly.toFixed(4)}/hr`,hourly===0?'warn':'')
    ].join('');
    let warning=$('txProjectSyncWarning');
    if(!warning){warning=document.createElement('div');warning.id='txProjectSyncWarning';warning.style.cssText='margin-top:8px;padding:9px 11px;border-radius:9px;font-size:10px;line-height:1.5';$('txSyncedProjectSettings').insertAdjacentElement('afterend',warning)}
    if(hourly===0){warning.style.display='block';warning.style.background='#fff9ec';warning.style.border='1px solid #ecd8ab';warning.style.color='#8b5e18';warning.innerHTML='<strong>Billing check:</strong> Transcription hourly rate is 0. L1/L2 Project Lab rates do not control audio-hour earnings.'}
    else warning.style.display='none';
  }

  async function refresh(force=false){
    const pid=projectId();if(!pid)return;
    if(!force&&pid===lastProject&&document.hidden)return;
    try{const s=await rpc('admin_get_transcription_project_settings',{p_project_id:pid});lastProject=pid;render(s)}catch(_){ }
  }
  function schedule(delay=80){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh(true),delay)}

  window.addEventListener('focus',()=>schedule(20));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(20)});
  window.addEventListener('storage',event=>{const pid=projectId();if(pid&&event.key===`adatacore-project-updated:${pid}`)schedule(20)});
  const name=$('projectName');if(name)new MutationObserver(()=>schedule(120)).observe(name,{childList:true,subtree:true});
  setInterval(()=>{if(!document.hidden)refresh(true)},20000);
  setTimeout(()=>refresh(true),180);
})();
