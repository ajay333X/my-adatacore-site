(()=>{
'use strict';
if(window.__adatacoreAudioDatasetLink)return;
window.__adatacoreAudioDatasetLink=true;
async function mount(){
 const sidebar=document.querySelector('.sidebar');
 if(!sidebar||!window.supabase?.createClient)return;
 try{
  const client=window.supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',{auth:{persistSession:true,autoRefreshToken:true}});
  const {data,error}=await client.rpc('get_my_admin_access');
  if(error||data?.is_super_admin!==true||sidebar.querySelector('[data-audio-dataset-link]'))return;
  const link=document.createElement('a');
  link.className='nav-link';
  link.href='/admin/audio-dataset-studio';
  link.dataset.audioDatasetLink='1';
  link.textContent='Audio Dataset Studio';
  link.title='Private, license-aware audio source collection and transcription workspace';
  const group=sidebar.querySelector('.ac-nav-section[data-ac-category="projects"] .ac-nav-inner')||sidebar.querySelector('.nav-group');
  (group||sidebar).appendChild(link);
  window.adatacoreModernAdmin?.refresh?.();
 }catch(e){console.warn('Audio Dataset Studio navigation unavailable',e)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,200),{once:true});
else setTimeout(mount,200);
})();