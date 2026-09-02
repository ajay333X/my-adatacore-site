(()=>{
  'use strict';
  if(window.__adatacoreAssignmentRoleLoader)return;window.__adatacoreAssignmentRoleLoader=true;
  const U='https://llmhyezgcnbognmmsnzq.supabase.co',K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
  const authDb=window.supabase?.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
  const fail=msg=>{document.querySelector('.ac-main')?.replaceChildren(Object.assign(document.createElement('div'),{className:'card empty',textContent:msg}));};
  async function execute(source){const s=document.createElement('script');s.textContent=source;document.body.appendChild(s)}
  (async()=>{
    if(!authDb)return fail('Unable to initialize secure Assignment Center.');
    const {data:{user}}=await authDb.auth.getUser();if(!user)return location.replace('/auth');
    const {data:access,error}=await authDb.rpc('get_my_admin_access');
    if(error||!access?.allowed||(!access.is_super_admin&&!access.capabilities?.includes('assignments')))return location.replace('/admin');
    const response=await fetch('/assignment-center.js?v=1',{cache:'no-store'});if(!response.ok)return fail('Assignment Center logic could not be loaded.');let source=await response.text();
    if(!access.is_super_admin){
      const pattern=/async function guard\(\)\{setBusy\(true\);const \{data:\{user\}\}=await db\.auth\.getUser\(\);if\(!user\)\{location\.replace\('\/auth'\);return false\}const \{data:u\}=await db\.from\('users'\)\.select\('role,accountStatus'\)\.eq\('id',user\.id\)\.maybeSingle\(\);if\(!u\|\|u\.role!=='admin'\|\|u\.accountStatus!=='active'\)\{location\.replace\('\/dashboard'\);return false\}return true\}/;
      const replacement="async function guard(){setBusy(true);const {data:{user}}=await db.auth.getUser();if(!user){location.replace('/auth');return false}const {data:access,error}=await db.rpc('get_my_admin_access');if(error||!access?.allowed||!access.capabilities?.includes('assignments')){location.replace('/admin');return false}return true}";
      if(!pattern.test(source))return fail('Assignment Center access guard changed; no unsafe fallback was used.');source=source.replace(pattern,replacement);
      const badge=document.querySelector('.ac-actions .pill');if(badge)badge.textContent='Scoped admin · Project Manager';
      const sub=document.querySelector('.ac-sub');if(sub)sub.textContent='Assigned projects · people · access · task limits';
    }
    execute(source);
  })().catch(e=>{console.error(e);fail('Unable to open Assignment Center: '+String(e.message||e))});
})();
