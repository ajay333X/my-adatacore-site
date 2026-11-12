(()=>{
'use strict';
if(window.__acVoiceTaskFinder)return;window.__acVoiceTaskFinder=true;
if(!window.supabase?.createClient)return;
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const normalized=s=>String(s||'').trim().replace(/^VS-/i,'');
const label=id=>'VS-'+String(id).toUpperCase();
let dialog,button,busy=false;
function open(){
 dialog.hidden=false;dialog.querySelector('input').focus();
}
function close(){dialog.hidden=true}
function mount(){
 if(document.getElementById('acVoiceFinderButton'))return;
 const anchor=document.getElementById('finderTrigger')||document.querySelector('.admin-header-actions');
 if(!anchor)return;
 const style=document.createElement('style');
 style.textContent='.ac-voice-finder-wrap[hidden]{display:none!important}.ac-voice-finder-wrap{position:fixed;z-index:13000;inset:0;background:rgba(18,24,38,.62);display:grid;place-items:center;padding:20px}.ac-voice-finder-panel{background:var(--panel,#fff);color:var(--text,#202733);width:min(600px,100%);padding:24px;border-radius:18px;box-shadow:0 26px 90px #0004}.ac-voice-finder-panel h2{font-size:21px;margin:0 0 6px}.ac-voice-finder-panel p{font-size:12px;color:var(--muted,#677487);line-height:1.6}.ac-voice-finder-panel input{width:100%;box-sizing:border-box;padding:13px;border-radius:10px;border:1px solid var(--line,#d8dee5);background:var(--panel2,#f8f9fa);color:inherit;font-size:13px}.ac-voice-finder-actions{margin-top:14px;display:flex;gap:10px;flex-wrap:wrap}.ac-voice-finder-result{margin-top:12px;min-height:18px;font-size:12px;line-height:1.6;overflow-wrap:anywhere}.ac-voice-finder-result a{display:inline-block;margin-top:9px;padding:10px 15px;border-radius:9px;background:#246e62;color:white;font-weight:750;text-decoration:none}.ac-voice-finder-close{float:right;cursor:pointer;font:700 20px system-ui;border:0;background:transparent;color:inherit}';
 document.head.append(style);
 button=document.createElement('button');button.id='acVoiceFinderButton';button.type='button';button.className='btn btn-secondary';button.textContent='Find Voice Task';
 anchor.after(button);button.onclick=open;
 dialog=document.createElement('div');dialog.id='acVoiceTaskFinder';dialog.className='ac-voice-finder-wrap';dialog.hidden=true;
 dialog.innerHTML='<div class="ac-voice-finder-panel" role="dialog" aria-modal="true" aria-labelledby="acVoiceSearchTitle"><button type="button" class="ac-voice-finder-close" aria-label="Close voice task search">×</button><h2 id="acVoiceSearchTitle">Find a Voice Studio task</h2><p>Search using the complete VS- task ID. Includes waiting, recording, flagged and submitted sessions.</p><form id="acVoiceSearchForm"><input id="acVoiceSearchInput" autocomplete="off" spellcheck="false" placeholder="VS-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" aria-label="Voice task ID" required><div class="ac-voice-finder-actions"><button class="btn btn-primary" type="submit">Find task</button><a class="btn btn-secondary" href="/admin/project-lab?project=94#recordings">Central QA — Voice</a></div></form><div class="ac-voice-finder-result" id="acVoiceSearchResult" role="status" aria-live="polite"></div></div>';
 document.body.append(dialog);
 dialog.querySelector('.ac-voice-finder-close').onclick=close;
 dialog.addEventListener('click',e=>{if(e.target===dialog)close()});
 dialog.querySelector('form').onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;
  const id=normalized(document.getElementById('acVoiceSearchInput').value);
  const result=document.getElementById('acVoiceSearchResult');
  result.textContent='';
  try{
   if(!UUID.test(id))throw Error('Enter the full task ID. Example: VS-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
   const {data,error}=await db.from('vs_sessions').select('id,mode,state,project_id').eq('id',id).eq('project_id',94).maybeSingle();
   if(error)throw error;
   if(!data)throw Error('Task not found. Verify that you copied the complete Voice Studio task ID.');
   const [tracks,flags]=await Promise.all([
    db.from('vs_tracks').select('actor_id').eq('session_id',id),
    db.from('vs_task_flags').select('id').eq('session_id',id)]);
   if(tracks.error)throw tracks.error;if(flags.error)throw flags.error;
   const summary=document.createElement('div');
   summary.textContent=label(data.id)+' · '+data.mode+' · '+data.state+' · '+(tracks.data||[]).length+' track(s) · '+(flags.data||[]).length+' flag(s)';
   const link=document.createElement('a');link.href='/admin/project-lab?project=94&voice_task='+encodeURIComponent(label(data.id))+'#recordings';link.textContent='Open task in Central QA';
   result.append(summary,link);
  }catch(error){result.textContent=error.message||String(error)}
  finally{busy=false}
 };
 document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='q'){
   e.preventDefault();e.stopPropagation();open();
  }
  if(e.key==='Escape'&&!dialog.hidden)close();
 },true);
}
async function boot(){
 try{
  const {data:{user}}=await db.auth.getUser();if(!user)return;
  const {data,error}=await db.rpc('vs_is_admin',{});
  if(error||data!==true)return;
  let n=0;const t=setInterval(()=>{if(document.getElementById('finderTrigger')||n++>40){clearInterval(t);mount()}},150);
 }catch(error){console.warn('Voice task search unavailable:',error)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
