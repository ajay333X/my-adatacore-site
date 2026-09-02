(()=>{
  'use strict';
  if(window.__adatacoreAssignmentRoleLoader)return;window.__adatacoreAssignmentRoleLoader=true;
  const U='https://llmhyezgcnbognmmsnzq.supabase.co',K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
  const authDb=window.supabase?.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
  const fail=msg=>{document.querySelector('.qa-main,.ac-main')?.replaceChildren(Object.assign(document.createElement('div'),{className:'card qa-empty',textContent:msg}));};
  async function execute(source){const s=document.createElement('script');s.textContent=source;document.body.appendChild(s)}
  (async()=>{
    if(!authDb)return fail('Unable to initialize secure Quick Assignment.');
    const {data:{user}}=await authDb.auth.getUser();if(!user)return location.replace('/auth');
    const {data:access,error}=await authDb.rpc('get_my_admin_access');
    if(error||!access?.allowed||(!access.is_super_admin&&!access.capabilities?.includes('assignments')))return location.replace('/admin');
    const response=await fetch('/assignment-center.js?v=20260902-2',{cache:'no-store'});if(!response.ok)return fail('Quick Assignment logic could not be loaded.');
    const source=await response.text();
    if(!access.is_super_admin){const badge=document.querySelector('.qa-actions .pill');if(badge)badge.textContent='Scoped admin · Project Manager'}
    execute(source);
  })().catch(e=>{console.error(e);fail('Unable to open Quick Assignment: '+String(e.message||e))});
})();