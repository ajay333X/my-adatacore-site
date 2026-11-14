(()=>{
'use strict';
if(window.__acSandboxUniversal)return;window.__acSandboxUniversal=true;
const params=new URLSearchParams(location.search),session=params.get('session')||'';
if(!/^[0-9a-f-]{36}$/i.test(session))return;
const $=id=>document.getElementById(id);
const supa=window.supabase;if(!supa?.createClient)return;
const db=supa.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',{auth:{persistSession:true,autoRefreshToken:true}});
const style=document.createElement('style');
style.textContent='.sx-universal{margin:15px 0;padding:16px;border:1px solid var(--sx-line,#dfe5ee);border-radius:12px;background:var(--sx-panel,#f9fafb)}.sx-universal h3{font-size:14px;margin:0 0 8px}.sx-universal p{font-size:12px;line-height:1.65;margin:8px 0}.sx-universal audio{display:block;max-width:100%;margin:12px 0}.sx-universal-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:13px}.sx-universal strong{font-weight:750}.sx-universal-status{font-size:11px;line-height:1.5;margin-top:10px}.sx-universal .sx-btn[disabled]{opacity:.55;cursor:wait}';
document.head.appendChild(style);
let project=null,recorder=null,stream=null,parts=[],audioUrl=null,activeTask=null;
const clean=()=>{try{if(recorder?.state==='recording')recorder.stop()}catch(_){};stream?.getTracks()?.forEach(t=>t.stop());stream=null;recorder=null;};
const clearAudio=()=>{clean();if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null}parts=[]};
async function identify(){
 const {data,error}=await db.rpc('admin_sandbox_workspace',{p_session_id:session});if(error)throw error;
 const sid=Number(data?.sandbox?.project_id),projects=data?.sandbox?.projects||[];
 project=projects.find(p=>Number(p.id)===sid);
 if(!project)throw Error('This session does not have valid project access.');
 const type=String(project.type||'custom'),voice=type==='voice_recording',transcript=type==='transcription';
 const label=(voice?'Voice Recording':transcript?'Transcription':'Custom Project');
 const eyebrow=document.querySelector('.sx-hero .sx-eyebrow');if(eyebrow)eyebrow.textContent='Sandbox / '+label+' / Project '+sid;
 const title=$('newTitle');if(title)title.value=voice?'Voice recording practice':transcript?'Transcription practice':project.name+' practice';
 const source=document.querySelector('label[for="newSource"]');if(source)source.textContent=voice?'Voice script / performance instructions (test only)':transcript?'Sample audio reference / expected words (test only)':'Sample instructions / task reference (test only)';
 const queueText=document.querySelector('#taskList')?.parentElement?.querySelector('p');if(queueText)queueText.textContent='Private sandbox for '+project.name+'. Production tasks are not changed.';
 const heading=document.querySelector('section.sx-panel:last-of-type p');if(heading)heading.textContent='Project-specific practice uses isolated test tasks. It does not create real submissions, payouts, or notifications. Voice audio is browser-local only and is not submitted or stored by Adatacore.';
 const info=document.createElement('div');info.className='sx-universal';info.id='sxSandboxProjectNote';
 info.innerHTML='<h3></h3><p></p>';
 info.querySelector('h3').textContent=project.name+' · '+label+' · '+data.sandbox.level;
 info.querySelector('p').textContent=voice?'Practice voice scripts and record a local audio preview. The L1/L2 dummy task pipeline saves review text and feedback, NOT the recording.':transcript?'Transcription projects can also use the isolated real-source test editor from the dummy dashboard.':'This project can be assigned to test accounts and its L1/L2 review cycle can be simulated here. A dedicated component adapter is required to reproduce the full production interface.';
 const notice=$('notice');notice?.insertAdjacentElement('afterend',info);
 if(voice){const obs=new MutationObserver(()=>injectVoice());obs.observe($('editor'),{childList:true,subtree:false});injectVoice()}
}
function injectVoice(){
 const root=$('editor');if(!root||root.querySelector('#sxVoiceRecorder'))return;
 const target=root.querySelector('#draft');if(!target)return;
 const card=document.createElement('div');card.className='sx-universal';card.id='sxVoiceRecorder';
 card.innerHTML='<h3>Microphone practice (browser only)</h3><p>Record and listen to a sample take before submitting text feedback. Audio stays in this browser tab and is never uploaded. Closing or reloading this page discards it.</p><div class="sx-universal-actions"><button type="button" class="sx-btn primary" id="sxStartVoice">Start recording</button><button type="button" class="sx-btn" id="sxStopVoice" disabled>Stop recording</button><button type="button" class="sx-btn" id="sxDiscardVoice">Discard take</button></div><div class="sx-universal-status" id="sxVoiceStatus" role="status">Microphone idle</div><div id="sxVoicePlayback"></div>';
 target.insertAdjacentElement('afterend',card);
 $('sxStartVoice').onclick=startRecording;
 $('sxStopVoice').onclick=stopRecording;
 $('sxDiscardVoice').onclick=()=>{clearAudio();const play=$('sxVoicePlayback');if(play)play.replaceChildren();setStatus('Local recording discarded.')};
 if(audioUrl)showAudio();
}
function setStatus(t){if($('sxVoiceStatus'))$('sxVoiceStatus').textContent=t}
async function startRecording(){
 if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')return setStatus('This browser does not support microphone recording.');
 clearAudio();
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:true});
  const type=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t))||'';
  recorder=new MediaRecorder(stream,type?{mimeType:type}:undefined);parts=[];
  recorder.ondataavailable=e=>{if(e.data?.size)parts.push(e.data)};
  recorder.onstop=()=>{
   stream?.getTracks()?.forEach(t=>t.stop());stream=null;
   if(parts.length){audioUrl=URL.createObjectURL(new Blob(parts,{type:recorder.mimeType||'audio/webm'}));showAudio();setStatus('Take ready for local playback. Audio is not uploaded.')}
   else setStatus('No recording captured.');
  };
  recorder.start();$('sxStartVoice').disabled=true;$('sxStopVoice').disabled=false;setStatus('Recording microphone…');
 }catch(e){clean();setStatus('Microphone unavailable: '+String(e.message||e))}
}
function stopRecording(){if(recorder?.state==='recording'){recorder.stop();if($('sxStartVoice'))$('sxStartVoice').disabled=false;if($('sxStopVoice'))$('sxStopVoice').disabled=true}}
function showAudio(){const host=$('sxVoicePlayback');if(!host||!audioUrl)return;host.replaceChildren();const player=document.createElement('audio');player.controls=true;player.src=audioUrl;host.appendChild(player)}
window.addEventListener('pagehide',clearAudio,{once:true});
identify().catch(e=>{const box=document.createElement('div');box.className='sx-note sx-error';box.textContent='Project compatibility check failed: '+String(e.message||e);$('notice')?.insertAdjacentElement('afterend',box)});
})();