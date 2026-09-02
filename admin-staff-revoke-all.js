(()=>{
  'use strict';
  if(window.__adatacoreStaffRevokeAll)return;
  window.__adatacoreStaffRevokeAll=true;
  if(!window.supabase?.createClient)return;

  const U='https://llmhyezgcnbognmmsnzq.supabase.co';
  const K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
  const client=window.supabase.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
  let people=[];
  const norm=v=>String(v??'').trim().toLowerCase();

  async function loadPeople(){
    try{
      const {data,error}=await client.rpc('admin_assignment_center_snapshot');
      if(!error)people=Array.isArray(data?.people)?data.people:[];
    }catch(_){ }
  }

  function resolvePerson(){
    const value=norm(document.getElementById('staffPersonSearch')?.value);
    if(!value)return null;
    return people.find(p=>[p.email,p.uid,p.full_name].some(v=>norm(v)===value))||null;
  }

  function mount(){
    const save=document.getElementById('staffRoleSave');
    if(!save||document.getElementById('staffRevokeAll'))return false;
    const button=document.createElement('button');
    button.id='staffRevokeAll';
    button.type='button';
    button.className='btn btn-danger';
    button.textContent='Revoke all staff access';
    button.title='Disable every staff role and return this person to contributor-only access';
    save.insertAdjacentElement('afterend',button);
    const grid=save.closest('.staff-role-grid');
    if(grid)grid.style.gridTemplateColumns='1.2fr .8fr 1fr auto auto';

    const note=document.createElement('div');
    note.className='staff-role-note';
    note.textContent='Revoke all staff access returns the selected person to contributor-only mode and removes direct Admin access.';
    grid?.insertAdjacentElement('afterend',note);

    button.onclick=async()=>{
      const msg=document.getElementById('staffRoleMessage');
      let person=resolvePerson();
      if(!person){await loadPeople();person=resolvePerson()}
      if(!person){if(msg)msg.textContent='Search for and select an exact person first.';return}
      const label=person.email||person.full_name||person.uid||'this person';
      if(!window.confirm(`Revoke all staff access for ${label}? They will return to contributor-only access.`))return;
      button.disabled=true;if(msg)msg.textContent='Revoking all staff access…';
      try{
        const {error}=await client.rpc('admin_set_user_role',{p_user_id:person.id,p_role:'user'});
        if(error)throw error;
        if(msg)msg.textContent='All staff access revoked. This person is now contributor-only.';
        document.getElementById('staffRoleRefresh')?.click();
      }catch(error){if(msg)msg.textContent=error.message||'Unable to revoke staff access.'}
      finally{button.disabled=false}
    };
    return true;
  }

  loadPeople();
  if(!mount()){
    const observer=new MutationObserver(()=>{if(mount())observer.disconnect()});
    observer.observe(document.body,{childList:true,subtree:true});
  }
})();
