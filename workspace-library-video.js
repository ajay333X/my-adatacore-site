(()=>{'use strict';
if(window.__adatacoreTrainingVideo)return;window.__adatacoreTrainingVideo=true;
const URL='https://llmhyezgcnbognmmsnzq.supabase.co',KEY='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const db=supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let overlay=null,player=null,timer=null,claiming=false,lastTick=0;
function stop(){if(timer)clearInterval(timer);timer=null;if(player){player.pause();player.removeAttribute('src');player.load();player=null}if(overlay)overlay.remove();overlay=null;document.body.style.removeProperty('overflow')}
async function tick(){
 if(claiming||!player||!Number.isFinite(player.duration)||player.duration<=0)return;
 if(player.paused&&!player.ended)return;
 const now=Date.now(),elapsed=lastTick?Math.max(0,(now-lastTick)/1000):0;lastTick=now;
 claiming=true;
 try{
  const r=await db.rpc('contributor_library_watch_tick',{p_item_id:overlay.dataset.itemId,p_duration_seconds:player.duration,p_played_seconds:Math.min(10,elapsed)});
  if(r.error)throw Error(r.error.message);
  const state=r.data||{},status=overlay.querySelector('[data-video-progress]');
  if(status)status.textContent=state.completed?'Completed · requirement satisfied':Math.round(Number(state.watched_seconds||0))+' of '+Math.round(player.duration)+' seconds watched';
  if(state.completed){overlay.querySelector('[data-video-complete]').hidden=false;const button=document.querySelector('[data-library-watch-id="'+overlay.dataset.itemId+'"]');if(button)button.textContent='Watch again';}
 }catch(e){const status=overlay?.querySelector('[data-video-progress]');if(status)status.textContent='Progress could not be saved: '+e.message}
 finally{claiming=false}
}
async function openVideo(button){
 const id=button.dataset.libraryWatchId,path=button.dataset.libraryVideo;
 if(!uuid.test(id)||!path)return;
 button.disabled=true;
 try{
  const r=await db.storage.from('adatacore-project-library').createSignedUrl(path,1800);
  if(r.error||!r.data?.signedUrl)throw Error(r.error?.message||'Unable to open video');
  stop();
  overlay=document.createElement('div');overlay.dataset.itemId=id;overlay.className='ac-training-overlay';
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Required training video');
  overlay.innerHTML='<div class="ac-training-modal"><div class="ac-training-header"><div><strong>Project training video</strong><p>Watch at least 90% of the video to complete this requirement. Skipping ahead does not add watched time.</p></div><button type="button" data-video-close aria-label="Close training video">×</button></div><video controls playsinline preload="metadata" controlsList="nodownload"></video><div class="ac-training-footer"><span data-video-progress>Ready to watch</span><span data-video-complete hidden class="ac-training-success">✓ Completed</span></div></div>';
  document.body.appendChild(overlay);document.body.style.overflow='hidden';
  overlay.querySelector('[data-video-close]').onclick=stop;
  overlay.addEventListener('click',e=>{if(e.target===overlay)stop()});
  player=overlay.querySelector('video');player.src=r.data.signedUrl;
  player.addEventListener('play',()=>{lastTick=Date.now();if(!timer)timer=setInterval(tick,5000)});
  player.addEventListener('pause',()=>{if(timer)clearInterval(timer);timer=null});
  player.addEventListener('ended',()=>{if(timer)clearInterval(timer);timer=null;tick()});
  player.addEventListener('error',()=>{const s=overlay?.querySelector('[data-video-progress]');if(s)s.textContent='This video could not be played in your browser.'});
  await player.play().catch(()=>{});
 }catch(e){alert('Unable to open project video: '+e.message)}
 finally{button.disabled=false}
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-library-video]');if(!b)return;
 e.preventDefault();e.stopImmediatePropagation();openVideo(b);
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay)stop()});
})();