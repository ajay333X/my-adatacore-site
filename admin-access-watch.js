(()=>{
  'use strict';
  if(window.__adatacoreAdminAccessWatch)return;
  window.__adatacoreAdminAccessWatch=true;
  if(!window.supabase?.createClient)return;

  const U='https://llmhyezgcnbognmmsnzq.supabase.co';
  const K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
  const client=window.supabase.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
  let lastSignature='';
  let checking=false;

  const signature=access=>JSON.stringify({
    allowed:!!access?.allowed,
    super:!!access?.is_super_admin,
    roles:(access?.roles||[]).map(r=>[r.role,r.project_id??null]).sort(),
    projects:(access?.projects||[]).map(p=>[p.id,(p.roles||[]).slice().sort()]).sort((a,b)=>Number(a[0])-Number(b[0]))
  });

  async function check(reason='timer'){
    if(checking)return;
    checking=true;
    try{
      const {data:{session}}=await client.auth.getSession();
      if(!session){location.replace('/auth');return}
      const {data:access,error}=await client.rpc('get_my_admin_access');
      if(error||!access?.allowed){location.replace('/workspace');return}
      const next=signature(access);
      if(!lastSignature){
        lastSignature=next;
        window.__adatacoreAdminAccess=access;
        return;
      }
      if(next!==lastSignature){
        window.__adatacoreAdminAccess=access;
        if(reason!=='initial')location.reload();
        lastSignature=next;
      }
    }catch(_){
      // Network errors do not revoke locally; backend RPCs remain authoritative.
    }finally{checking=false}
  }

  setTimeout(()=>check('initial'),700);
  setInterval(()=>{if(document.visibilityState==='visible')check('timer')},15000);
  window.addEventListener('focus',()=>check('focus'));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check('visibility')});
})();
