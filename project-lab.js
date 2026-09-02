(()=>{
  const CORE_SRC='/project-lab-core.js?v=20260902-live-sync-1';
  const U='https://llmhyezgcnbognmmsnzq.supabase.co';
  const K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
  const projectId=Number(new URLSearchParams(location.search).get('project')||0);
  const syncDb=window.supabase?.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
  let baselineSettings='';
  let lastDigest='';
  let checking=false;
  let lastCheckAt=0;

  function settingsSnapshot(){
    const ids=['setName','setType','setL1Rate','setL2Rate','setLifecycle','setPublished','setDescription','setConfig','setStyle'];
    return JSON.stringify(ids.map(id=>document.getElementById(id)?.value??''));
  }

  function settingsDirty(){
    return !!baselineSettings && settingsSnapshot()!==baselineSettings;
  }

  function digest(d){
    const p=d?.project||{},i=d?.inventory||{},m=d?.metrics||{},a=d?.activity?.[0]||{};
    return JSON.stringify([
      p.updated_at,p.name,p.type,p.lifecycle_status,p.published,p.l1_rate,p.l2_rate,p.description,p.config,p.style_config,
      i.l1_available,i.l2_available,
      m.tasks_total,m.tasks_pending,m.tasks_submitted,m.tasks_cancelled,m.people,m.submissions,m.pending_reviews,m.approved,m.rejected,m.approved_earnings,m.paid,m.reviews,
      a.id,a.created_at,a.action
    ]);
  }

  async function readDigest(){
    if(!projectId||!syncDb)return '';
    const {data,error}=await syncDb.rpc('admin_get_project_lab',{p_project_id:projectId});
    if(error)return '';
    return digest(data);
  }

  async function checkForExternalChanges(force=false){
    if(checking||document.hidden||settingsDirty())return;
    const now=Date.now();
    if(!force&&now-lastCheckAt<5000)return;
    checking=true;lastCheckAt=now;
    try{
      const next=await readDigest();
      if(next&&lastDigest&&next!==lastDigest){
        location.reload();
        return;
      }
      if(next)lastDigest=next;
    }finally{checking=false;}
  }

  const core=document.createElement('script');
  core.src=CORE_SRC;
  core.onload=()=>{
    setTimeout(async()=>{
      baselineSettings=settingsSnapshot();
      lastDigest=await readDigest();
    },0);

    document.getElementById('saveSettingsBtn')?.addEventListener('click',()=>{
      setTimeout(()=>{
        const toast=document.getElementById('labToast');
        if(toast?.textContent?.includes('Project settings saved')){
          baselineSettings=settingsSnapshot();
          readDigest().then(v=>{if(v)lastDigest=v;});
        }
      },900);
    });
  };
  core.onerror=()=>{
    const main=document.querySelector('.lab-main');
    if(main)main.innerHTML='<div class="card empty">Project Lab failed to load. Please refresh the page.</div>';
  };
  document.body.appendChild(core);

  window.addEventListener('focus',()=>checkForExternalChanges(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkForExternalChanges(true);});
  setInterval(()=>checkForExternalChanges(false),30000);
})();
