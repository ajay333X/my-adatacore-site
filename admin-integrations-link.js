(()=>{
'use strict';
async function add(){
  const sidebar=document.querySelector('.sidebar');
  if(!sidebar||!window.supabase?.createClient)return;
  try{
    const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',{auth:{persistSession:true,autoRefreshToken:true}});
    const {data:access,error}=await db.rpc('get_my_admin_access');
    if(error||access?.is_super_admin!==true)return;
    // Keep the original Slack management page and access guard; expose it as a
    // first-class admin navigation destination instead of generic Integrations.
    const existing=sidebar.querySelector('a[href="/admin-integrations"]');
    if(existing){
      existing.textContent='Slack Management';
      existing.dataset.adminSlackLink='1';
      existing.setAttribute('aria-label','Slack Management');
      window.adatacoreModernAdmin?.refresh?.();
      return;
    }
    const a=document.createElement('a');
    a.className='nav-link';
    a.href='/admin-integrations';
    a.dataset.adminSlackLink='1';
    a.textContent='Slack Management';
    a.setAttribute('aria-label','Slack Management');
    const core=sidebar.querySelector('a[href="/admin/coreforge"]');
    if(core)core.insertAdjacentElement('beforebegin',a);
    else{
      const contributor=[...sidebar.querySelectorAll('a.nav-link')].find(x=>/contributor view/i.test(x.textContent||''));
      if(contributor)contributor.insertAdjacentElement('beforebegin',a);
      else sidebar.appendChild(a);
    }
    window.adatacoreModernAdmin?.refresh?.();
  }catch(error){console.warn('Slack admin navigation unavailable',error)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(add,130),{once:true});
else setTimeout(add,130);
})();