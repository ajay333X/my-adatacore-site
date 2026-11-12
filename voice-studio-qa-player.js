(()=>{'use strict';
if(window.AdacoreDuoQAPlayer)return;
const active=new Set();
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const stamp=s=>{s=Math.floor(Number(s)||0);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
function create({sessionId,actorA,actorB,tracks,db}){
 const host=document.createElement('section');host.className='ac-duo-player';host.setAttribute('aria-label','Synchronized Duo audio player');
 const title=document.createElement('div');title.className='ac-duo-player-head';
 title.innerHTML='<div><strong>Conversation playback</strong><p>Listen to either voice or both together. Both tracks stay separate.</p></div><span class="ac-duo-status" role="status">Ready to load</span>';
 const status=title.querySelector('[role="status"]');
 const modes=document.createElement('div');modes.className='ac-duo-modes';modes.setAttribute('role','group');modes.setAttribute('aria-label','Which voice to hear');
 const buttons={};
 for(const [key,label] of [['both','Both speakers'],['a','Voice A only'],['b','Voice B only']]){
  const b=document.createElement('button');b.type='button';b.className='btn btn-secondary';b.textContent=label;b.dataset.mode=key;b.setAttribute('aria-pressed',String(key==='both'));modes.append(b);buttons[key]=b;
 }
 const transport=document.createElement('div');transport.className='ac-duo-transport';
 transport.innerHTML='<button type="button" class="btn btn-primary" data-control="toggle">▶ Play</button><button type="button" class="btn btn-secondary" data-control="restart">↺ Restart</button><label class="ac-duo-seek-label">Position <input type="range" data-control="seek" min="0" max="1000" step="1" value="0" aria-label="Seek both tracks"></label><span class="ac-duo-timestamp" data-timer>0:00 / 0:00</span><label class="ac-duo-speed">Speed <select data-control="speed" aria-label="Playback speed"><option value=".75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>';
 const toggle=transport.querySelector('[data-control=toggle]'),seek=transport.querySelector('[data-control=seek]'),time=transport.querySelector('[data-timer]'),speed=transport.querySelector('[data-control=speed]');
 const mixer=document.createElement('div');mixer.className='ac-duo-mixer';
 const sound={},inputs={};
 for(const [key,label,actor] of [['a','Voice A',actorA],['b','Voice B',actorB]]){
  const row=document.createElement('div');row.className='ac-duo-channel';
  const heading=document.createElement('div');heading.className='ac-duo-channel-label';
  const name=document.createElement('strong');name.textContent=label;
  const state=document.createElement('span');state.textContent=tracks.some(t=>t.actor_id===actor)?'Audio available':'Track not submitted';
  heading.append(name,state);
  const volumeLabel=document.createElement('label');volumeLabel.textContent='Volume';
  const volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='100';volume.value='100';volume.step='1';volume.setAttribute('aria-label',label+' volume');
  volumeLabel.append(volume);row.append(heading,volumeLabel);
  mixer.append(row);inputs[key]=volume;
  const record=tracks.find(t=>t.actor_id===actor);
  const audio=document.createElement('audio');audio.preload='auto';audio.playsInline=true;audio.crossOrigin='anonymous';audio.style.display='none';row.append(audio);
  sound[key]={audio,record,source:null,gain:null,ready:false};
 }
 host.append(title,modes,transport,mixer);
 let mode='both',loaded=false,loading=false,playing=false,duration=0,context=null,ctxSupported=!!(window.AudioContext||window.webkitAudioContext),frame=0,disposed=false,seekDrag=false;
 const setStatus=(msg,isError=false)=>{status.textContent=msg;status.classList.toggle('error',isError)};
 const valid=()=>Object.values(sound).filter(item=>item.ready);
 const volumeUpdate=()=>{
  for(const key of ['a','b']){
   const s=sound[key],gain=(mode==='both'||mode===key)?Number(inputs[key].value)/100:0;
   if(s.gain)s.gain.gain.value=gain;
   else s.audio.volume=gain;
  }
  for(const key of ['a','b'])buttons[key].setAttribute('aria-pressed',String(mode===key));
  buttons.both.setAttribute('aria-pressed',String(mode==='both'));
 };
 for(const [key,b] of Object.entries(buttons))b.onclick=()=>{mode=key;volumeUpdate()};
 for(const v of Object.values(inputs))v.addEventListener('input',volumeUpdate);
 const master=()=>sound.a.ready?sound.a.audio:sound.b.audio;
 const now=()=>{const p=master();return p?p.currentTime:0};
 const paint=()=>{
  if(disposed)return;
  const t=now(),limit=duration||0;
  time.textContent=stamp(t)+' / '+stamp(limit);
  if(!seekDrag)seek.value=String(limit?Math.round(t/limit*1000):0);
  if(playing){frame=requestAnimationFrame(paint)}
 };
 const stop=()=>{
  playing=false;toggle.textContent='▶ Play';
  for(const s of valid())s.audio.pause();
  cancelAnimationFrame(frame);paint();
 };
 const align=(t)=>{
  for(const s of valid()){try{s.audio.currentTime=clamp(t,0,Number.isFinite(s.audio.duration)?s.audio.duration:duration)}catch(_){}}
  paint();
 };
 const prepare=async()=>{
  if(loaded)return true;if(loading)return false;
  loading=true;setStatus('Loading both audio tracks…');
  try{
   const available=Object.values(sound).filter(s=>s.record);
   if(!available.length)throw Error('No recording has been submitted yet.');
   await Promise.all(available.map(async s=>{
    const {data,error}=await db.storage.from('voice-studio').createSignedUrl(s.record.storage_path,600);
    if(error)throw error;
    s.audio.src=data.signedUrl;
    await new Promise((resolve,reject)=>{
     if(s.audio.readyState>=1){resolve();return}
     const timeout=setTimeout(()=>{cleanup();reject(Error('Audio loading timed out'))},20000);
     const cleanup=()=>{clearTimeout(timeout);s.audio.removeEventListener('loadedmetadata',success);s.audio.removeEventListener('error',bad)};
     const success=()=>{cleanup();resolve()};
     const bad=()=>{cleanup();reject(Error('Unable to read audio track'))};
     s.audio.addEventListener('loadedmetadata',success,{once:true});
     s.audio.addEventListener('error',bad,{once:true});
     s.audio.load();
    });
    s.ready=true;
   }));
   duration=Math.max(...available.map(s=>Number(s.audio.duration)||Number(s.record.duration_seconds)||0));
   if(ctxSupported){
    const AudioContextCtor=window.AudioContext||window.webkitAudioContext;
    context=new AudioContextCtor();
    for(const s of available){
     s.source=context.createMediaElementSource(s.audio);
     s.gain=context.createGain();
     s.source.connect(s.gain);s.gain.connect(context.destination);
    }
   }
   volumeUpdate();
   loaded=true;
   setStatus(available.length===2?'Two tracks loaded · synchronized playback':'One submitted track available');
   paint();return true;
  }catch(error){setStatus('Playback unavailable: '+(error.message||String(error)),true);return false}
  finally{loading=false}
 };
 const start=async()=>{
  if(!await prepare())return;
  try{
   if(context&&context.state==='suspended')await context.resume();
   const t=now();align(t);
   // A single user gesture starts both recordings from the same media time.
   const result=await Promise.allSettled(valid().map(s=>s.audio.play()));
   if(result.some(x=>x.status==='rejected'))throw Error('Autoplay was blocked. Press Play to retry.');
   playing=true;toggle.textContent='Ⅱ Pause';setStatus('Playing '+(mode==='both'?'both speakers':'Voice '+mode.toUpperCase()));
   cancelAnimationFrame(frame);paint();
  }catch(error){stop();setStatus(error.message,true)}
 };
 toggle.onclick=()=>playing?stop():void start();
 transport.querySelector('[data-control=restart]').onclick=()=>{align(0);if(playing)void start()};
 seek.addEventListener('input',()=>{seekDrag=true;time.textContent=stamp(duration*Number(seek.value)/1000)+' / '+stamp(duration)});
 seek.addEventListener('change',()=>{align(duration*Number(seek.value)/1000);seekDrag=false});
 speed.onchange=()=>{for(const s of Object.values(sound))s.audio.playbackRate=Number(speed.value)};
 for(const s of Object.values(sound)){
  s.audio.addEventListener('ended',()=>{if(valid().every(x=>x.audio.ended||x.audio.currentTime>=x.audio.duration-.15))stop()});
 }
 const dispose=()=>{if(disposed)return;stop();disposed=true;for(const s of Object.values(sound)){s.audio.removeAttribute('src');s.audio.load()}if(context)void context.close();active.delete(dispose)};
 active.add(dispose);
 return {element:host,dispose};
}
window.AdacoreDuoQAPlayer={create,disposeAll:()=>{for(const done of [...active])done()}};
})();
