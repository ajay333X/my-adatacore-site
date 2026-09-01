(()=>{
  'use strict';
  if(window.__adatacoreOperationsHealth)return;
  window.__adatacoreOperationsHealth=true;

  const U='https://llmhyezgcnbognmmsnzq.supabase.co';
  const K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
  const client=(typeof db!=='undefined'&&db?.rpc)?db:window.supabase?.createClient?.(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let timer=null;

  const css=document.createElement('style');
  css.textContent=`
    .ops-health{margin-top:20px}.ops-health-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}.ops-health-head h2{margin:3px 0 4px;font-size:18px}.ops-health-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px}.ops-health-stat{padding:14px}.ops-health-stat span{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted2);font-weight:850}.ops-health-stat strong{display:block;font-size:22px;margin-top:6px}.ops-health-stat small{display:block;font-size:9px;color:var(--muted);margin-top:4px;line-height:1.45}.ops-health-panels{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.ops-health-panel{padding:15px}.ops-health-panel h3{font-size:13px;margin:0 0 9px}.ops-health-list{display:grid;gap:7px}.ops-health-row{padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--panel2);font-size:10px;line-height:1.45}.ops-health-row strong{display:block;font-size:10px}.ops-health-row small{display:block;color:var(--muted);margin-top:3px;word-break:break-word}.ops-health-ok{padding:16px;text-align:center;color:var(--muted);font-size:10px}.ops-health-generated{font-size:9px;color:var(--muted)}
    @media(max-width:1180px){.ops-health-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){.ops-health-grid{grid-template-columns:1fr 1fr}.ops-health-panels{grid-template-columns:1fr}.ops-health-head{flex-direction:column}}
  `;
  document.head.appendChild(css);

  function mount(){
    const overview=document.getElementById('overview');
    if(!overview||document.getElementById('opsHealth'))return document.getElementById('opsHealth');
    const box=document.createElement('section');
    box.id='opsHealth';box.className='ops-health';
    const split=overview.querySelector('.split');
    box.innerHTML=`<div class="ops-health-head"><div><div class="eyebrow">Action center</div><h2>Operations health</h2><div class="page-sub">Exceptions that may need an Admin response.</div></div><div><button id="opsHealthRefresh" class="btn btn-secondary" type="button">Refresh health</button><div id="opsHealthGenerated" class="ops-health-generated"></div></div></div><div id="opsHealthBody"><div class="card ops-health-ok">Loading operations health…</div></div>`;
    split?overview.insertBefore(box,split):overview.appendChild(box);
    box.querySelector('#opsHealthRefresh')?.addEventListener('click',refresh);
    return box;
  }

  function stat(label,value,note,kind=''){
    const cls=kind==='warn'&&Number(value)>0?' pill-amber':'';
    return `<div class="card ops-health-stat${cls}"><span>${esc(label)}</span><strong>${Number(value||0)}</strong><small>${esc(note)}</small></div>`;
  }
  function row(title,meta){return `<div class="ops-health-row"><strong>${esc(title)}</strong><small>${esc(meta)}</small></div>`}

  function render(data){
    mount();
    const c=data?.counts||{},warnings=Array.isArray(data?.queue_warnings)?data.queue_warnings:[],errors=Array.isArray(data?.recent_client_errors)?data.recent_client_errors:[],failed=Array.isArray(data?.failed_ai)?data.failed_ai:[];
    const body=document.getElementById('opsHealthBody');if(!body)return;
    body.innerHTML=`<div class="ops-health-grid">${[
      stat('Final audits',c.pending_final_audits,'Pending submission decisions','warn'),
      stat('Transcripts',c.transcripts_waiting_review,'Submitted and waiting for review','warn'),
      stat('AI failures',c.failed_ai_jobs,'Groq draft jobs needing attention','warn'),
      stat('Payout queue',c.payments_waiting,'Pending / scheduled / processing','warn'),
      stat('Stuck work',c.stuck_transcription_work,'Assigned or active over 4 hours','warn'),
      stat('Browser errors',c.client_errors_24h,'Captured during the last 24 hours','warn')
    ].join('')}</div><div class="ops-health-panels"><div class="card ops-health-panel"><h3>Queue warnings</h3><div class="ops-health-list">${warnings.length?warnings.map(w=>row(w.project_name||'Transcription project',`${w.remaining_allowance||0} task allowance remaining · no ready audio`)).join(''):'<div class="ops-health-ok">No empty-queue allowance conflicts.</div>'}</div></div><div class="card ops-health-panel"><h3>Recent technical exceptions</h3><div class="ops-health-list">${errors.length?errors.slice(0,5).map(e=>row(e.message||'Browser error',`${e.route||''} · ${new Date(e.created_at).toLocaleString()}`)).join(''):(failed.length?failed.slice(0,5).map(e=>row(e.error_code||'AI draft failed',e.error_message||'No error detail')).join(''):'<div class="ops-health-ok">No recent client errors or AI failures to show here.</div>')}</div></div></div>`;
    const generated=document.getElementById('opsHealthGenerated');if(generated)generated.textContent=data?.generated_at?'Updated '+new Date(data.generated_at).toLocaleTimeString():'';
  }

  async function refresh(){
    if(!client)return;
    const btn=document.getElementById('opsHealthRefresh');if(btn){btn.disabled=true;btn.textContent='Refreshing…'}
    try{
      const {data,error}=await client.rpc('admin_operations_health');
      if(error)throw error;render(data||{});
    }catch(error){
      mount();const body=document.getElementById('opsHealthBody');if(body)body.innerHTML=`<div class="card ops-health-ok">Unable to load operations health: ${esc(error.message||error)}</div>`;
    }finally{if(btn){btn.disabled=false;btn.textContent='Refresh health'}}
  }

  mount();refresh();
  timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},60000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
})();
