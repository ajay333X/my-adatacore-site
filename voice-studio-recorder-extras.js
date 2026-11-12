(()=>{
'use strict';
const $=id=>document.getElementById(id);
const c=$('vsWaveCanvas'),control=$('vsCaptionsToggle'),caption=$('vsCaptionText'),pane=$('vsCaptionPane'),
  speechState=$('vsSpeechStatus'),micState=$('vsMicState'),target=$('vsTargetTime'),captionCount=$('vsCaptionCount'),playback=$('playback');
if(!c||!control||!caption||!playback)return;
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
const state={
 recording:false,visual:false,preview:false,elapsed:0,duration:150,wave:[],lastSample:0,frame:0,ctx:null,source:null,analyser:null,
 data:null,level:'idle',silenceStart:0,tooQuietSeconds:0,clippedFrames:0,speech:null,speechWanted:false,
 restarting:0,restartTimer:0,phrases:[],partial:'',sessionFinal:'',transcript:'',
 };
let resizeObserver;
const mmss=seconds=>String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(Math.floor(seconds%60)).padStart(2,'0');
function updateCaptionText(){
 state.transcript=[...state.phrases,state.sessionFinal,state.partial].filter(Boolean).join(' ').replace(/\s+/g,' ').trim().slice(0,12000);
 caption.textContent=state.transcript|| (state.recording?'Listening for Hindi speech…':'No speech was recognized in this take.');
 const words=state.transcript?state.transcript.split(/\s+/).filter(Boolean).length:0;
 captionCount.textContent=words+' words';
}
if(!SR){control.disabled=true;control.title='This browser does not provide live speech recognition.';speechState.textContent='Unavailable in this browser';}
else{speechState.textContent='Off · optional browser service';}
function refreshTarget(){
 const elapsed=state.recording?state.elapsed:state.preview?(Number.isFinite(playback.currentTime)?playback.currentTime:0):0;
 target.textContent=state.recording?'Recording '+mmss(elapsed)+' / '+mmss(state.duration):state.preview?
  ('Playback '+mmss(elapsed)+' / '+mmss(Number.isFinite(playback.duration)?playback.duration:state.elapsed)):'Target '+mmss(state.duration);
}
function canvasSize(){
 const bounds=c.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1),width=Math.max(120,Math.round((bounds.width||600)*ratio)),height=Math.max(45,Math.round((bounds.height||53)*ratio));
 if(c.width!==width)c.width=width;
 if(c.height!==height)c.height=height;
 return [width,height];
}
function draw(){
 const [width,height]=canvasSize(),g=c.getContext('2d');if(!g)return;
 g.clearRect(0,0,width,height);
 const middle=height/2,source=state.wave;
 const visible=state.recording?source.slice(-100):source;
 const bars=Math.max(16,Math.min(130,Math.floor(width/7))),gap=2.2;
 const barWidth=(width-(bars-1)*gap)/bars;
 g.fillStyle='#e4eeed';g.fillRect(0,middle-.5,width,1);
 const played=state.preview&&Number.isFinite(playback.duration)&&playback.duration>0?Math.min(1,Math.max(0,playback.currentTime/playback.duration)):0;
 for(let i=0;i<bars;i++){
  const st=Math.floor(i*visible.length/bars),end=Math.min(visible.length,Math.max(st+1,Math.ceil((i+1)*visible.length/bars)));
  let amp=0;
  for(let j=st;j<end;j++)amp=Math.max(amp,visible[j]||0);
  const level=Math.max(.06,Math.min(1,Math.sqrt(amp)*1.55));
  const bh=Math.max(3,level*(height-12));
  const x=i*(barWidth+gap),y=middle-bh/2;
  g.fillStyle=state.recording?'#2b978c':state.preview&&i/bars<played?'#1b817b':'#b7d0cc';
  g.fillRect(x,y,Math.max(1,barWidth),bh);
 }
 if(state.preview){
  const x=played*width;g.strokeStyle='#165a64';g.lineWidth=2;g.beginPath();g.moveTo(x,0);g.lineTo(x,height);g.stroke();
 }
 c.classList.toggle('vs-seekable',state.preview&&Number.isFinite(playback.duration)&&playback.duration>0);
 const pct=state.preview?Math.round(played*100):0;c.setAttribute('aria-valuenow',String(pct));
 c.setAttribute('aria-valuetext',state.preview?'Playback '+Math.round(pct)+' percent':'Waveform preview not seekable until recording stops');
 refreshTarget();
}
function setStatus(message,status='idle'){
 micState.textContent='● '+message;micState.dataset.status=status;
}
function stopAnalyser(){
 state.visual=false;if(state.frame)cancelAnimationFrame(state.frame);state.frame=0;
 try{state.source?.disconnect()}catch(_){}
 try{state.analyser?.disconnect()}catch(_){}
 if(state.ctx){try{const p=state.ctx.close();p?.catch?.(()=>{})}catch(_){}}
 state.ctx=null;state.analyser=null;state.source=null;state.data=null;
}
function step(time){
 if(!state.visual||!state.analyser)return;
 const a=state.analyser,arr=state.data;a.getByteTimeDomainData(arr);
 let sum=0,peak=0;
 for(let i=0;i<arr.length;i++){const x=(arr[i]-128)/128;sum+=x*x;peak=Math.max(peak,Math.abs(x))}
 const rms=Math.sqrt(sum/arr.length),normalized=Math.min(1,rms*3.5);
 if(time-state.lastSample>=120){
  state.wave.push(normalized);if(state.wave.length>2400)state.wave.shift();
  state.lastSample=time;if(peak>.95)state.clippedFrames++;
  const quiet=rms<.015;
  if(quiet&&state.silenceStart===0)state.silenceStart=time;
  if(!quiet){if(state.silenceStart&&time-state.silenceStart>2600)state.tooQuietSeconds+=Math.round((time-state.silenceStart)/1000);state.silenceStart=0}
  if(peak>.95)setStatus('Input too loud · reduce volume','clipping');
  else if(quiet&&state.silenceStart&&time-state.silenceStart>3000)setStatus('Low sound · check microphone','quiet');
  else if(!quiet)setStatus('Microphone level looks good','good');
  else setStatus('Listening…');
  draw();
 }
 state.frame=requestAnimationFrame(step);
}
function freezeSpeech(){
 state.speechWanted=false;clearTimeout(state.restartTimer);state.restartTimer=0;
 const engine=state.speech;state.speech=null;
 if(engine){try{engine.stop()}catch(_){}}
}
function startSpeech(){
 if(!SR||!control.checked||!state.recording||state.speechWanted)return;
 state.speechWanted=true;state.restarting=0;speechState.textContent='Starting Hindi recognition…';
 launchSpeech();
}
function launchSpeech(){
 if(!state.speechWanted||!state.recording||!control.checked)return;
 let engine;
 try{
  engine=new SR();state.speech=engine;engine.lang='hi-IN';engine.continuous=true;engine.interimResults=true;engine.maxAlternatives=1;
  state.sessionFinal='';state.partial='';
  engine.onstart=()=>{speechState.textContent='Listening · hi-IN'};
  engine.onresult=event=>{
   let final='',interim='';
   for(let i=0;i<event.results.length;i++){
    const item=event.results[i],value=(item[0]?.transcript||'').trim();
    if(!value)continue;if(item.isFinal)final+=(final?' ':'')+value;else interim+=(interim?' ':'')+value;
   }
   state.sessionFinal=final;state.partial=interim;updateCaptionText();
  };
  engine.onerror=event=>{
   const kind=String(event.error||'error');
   if(['not-allowed','service-not-allowed','audio-capture','language-not-supported'].includes(kind)){
    state.speechWanted=false;clearTimeout(state.restartTimer);
    speechState.textContent='Recognition unavailable: '+kind;
   }else if(kind!=='no-speech'&&kind!=='aborted')speechState.textContent='Recognition issue: '+kind;
  };
  engine.onend=()=>{
   if(state.sessionFinal){state.phrases.push(state.sessionFinal);state.sessionFinal='';}
   if(state.partial&&!state.speechWanted){state.phrases.push(state.partial)}
   state.partial='';updateCaptionText();
   if(state.speechWanted&&state.recording&&control.checked){
    state.restarting++;
    if(state.restarting>35){state.speechWanted=false;speechState.textContent='Speech service stopped · recording continues';return}
    state.restartTimer=setTimeout(launchSpeech,500);
   }
  };
  engine.start();
 }catch(e){state.speechWanted=false;speechState.textContent='Recognition could not start';}
}
control.addEventListener('change',()=>{
 pane.hidden=!control.checked;
 if(!control.checked){
  freezeSpeech();state.phrases=[];state.sessionFinal='';state.partial='';updateCaptionText();
  speechState.textContent='Off · captions not stored';
 }else{
  speechState.textContent=SR?'Enabled · uses browser speech service':'Unavailable';
  if(state.recording)startSpeech();else updateCaptionText();
 }
});
function reset(){
 stopAnalyser();freezeSpeech();
 state.recording=false;state.preview=false;state.elapsed=0;state.wave=[];state.clippedFrames=0;
 state.tooQuietSeconds=0;state.silenceStart=0;state.phrases=[];state.sessionFinal='';state.partial='';state.transcript='';
 state.lastSample=0;pane.hidden=!control.checked;
 if(control.checked)speechState.textContent='Ready for live Hindi captions';
 updateCaptionText();setStatus('Microphone standby');draw();
}
function start(micStream,durationSeconds){
 reset();state.recording=true;state.duration=Math.max(5,Number(durationSeconds)||150);
 try{
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext)throw Error('No AudioContext');
  state.ctx=new AudioContext();state.source=state.ctx.createMediaStreamSource(micStream);
  state.analyser=state.ctx.createAnalyser();state.analyser.fftSize=1024;state.analyser.smoothingTimeConstant=.75;
  state.source.connect(state.analyser);state.data=new Uint8Array(state.analyser.frequencyBinCount*2);
  state.visual=true;state.frame=requestAnimationFrame(step);
  setStatus('Microphone active · speak normally','good');
 }catch(_){stopAnalyser();setStatus('Waveform unavailable · recording continues','quiet')}
 if(control.checked)startSpeech();
 draw();
}
function stop(seconds){
 if(!state.recording)return;
 state.recording=false;state.elapsed=Math.max(0,Number(seconds)||0);
 stopAnalyser();freezeSpeech();
 state.preview=true;
 speechState.textContent=control.checked?'Automatic transcript draft · review carefully':'Captions off';
 // Keep partial text temporarily until onend appends its final result.
 draw();setStatus('Recording captured · click wave to seek');
}
function quality(){
 return {clipping:state.clippedFrames>12,mostlyQuiet:state.tooQuietSeconds>Math.max(6,state.elapsed*.42),
  seconds:state.elapsed,transcript:control.checked?state.transcript:''};
}
function seek(fraction){
 if(!state.preview||!Number.isFinite(playback.duration)||playback.duration<=0)return;
 playback.currentTime=Math.min(playback.duration,Math.max(0,fraction)*playback.duration);draw();
}
c.addEventListener('click',e=>{
 const box=c.getBoundingClientRect();if(box.width>0)seek((e.clientX-box.left)/box.width);
});
c.addEventListener('keydown',e=>{
 if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key)||!state.preview)return;
 e.preventDefault();const length=Number.isFinite(playback.duration)?playback.duration:0;
 if(!length)return;
 if(e.key==='Home')seek(0);else if(e.key==='End')seek(1);
 else seek((playback.currentTime+(e.key==='ArrowRight'?5:-5))/length);
});
playback.addEventListener('loadedmetadata',draw);
playback.addEventListener('timeupdate',draw);
playback.addEventListener('seeked',draw);
playback.addEventListener('play',()=>{
 const tick=()=>{if(!playback.paused&&!playback.ended&&state.preview){draw();requestAnimationFrame(tick)}};requestAnimationFrame(tick);
});
if(window.ResizeObserver){resizeObserver=new ResizeObserver(()=>draw());resizeObserver.observe(c)}
else window.addEventListener('resize',draw);
window.VoiceStudioExtras={
 start,
 stop,
 reset,
 setDuration(n){state.duration=Math.max(5,Number(n)||150);draw()},
 transcript(){return control.checked?state.transcript.slice(0,12000):''},
 quality,
 submitted(){setStatus('Recording submitted successfully','good');draw()},
 dispose(){stopAnalyser();freezeSpeech();resizeObserver?.disconnect()}
};
draw();
})();