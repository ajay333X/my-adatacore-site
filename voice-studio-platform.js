(()=>{'use strict';
const P=94,U='https://llmhyezgcnbognmmsnzq.supabase.co',K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',db=supabase.createClient(U,K);
const $=s=>document.getElementById(s),fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
let me,admin=false,session=null,script=null,mode='',stream=null,pc=null,peerStream=null,rec=null,blob=null,secs=0,timer=0,poll=0,signalTimer=0,signalId=0,readBusy=false,offerSent=false,connected=false;
function note(t){$('vsAlert').textContent=t||''}
function fail(e){return String(e?.message||e||'Unknown error').replaceAll('_',' ')}
async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)throw error;return data}
function view(s){document.querySelectorAll('main > .step').forEach(e=>e.classList.toggle('active',e.id===s));window.scrollTo(0,0)}
function cleanup(){clearInterval(timer);clearInterval(poll);clearInterval(signalTimer);if(pc)pc.close();pc=null;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null}
async function mic(){if(!stream)stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});return stream}
function audioType(){return ['audio/webm','audio/mp4','audio/ogg'].find(t=>MediaRecorder.isTypeSupported(t))||'audio/webm'}
const alert=document.createElement('div');alert.id='vsAlert';alert.style.cssText='font-size:12px;line-height:1.6;color:#525d75;margin-bottom:12px';document.querySelector('main').prepend(alert);
const style=document.createElement('style');style.textContent='.vs-control{margin-top:24px}.vs-control input,.vs-control select{width:100%;padding:11px;border:1px solid #dfe2e8;border-radius:10px;margin:6px 0 12px}.vs-room{max-width:760px;margin:auto}.vs-room button{margin:5px}.vs-room pre{white-space:pre-wrap;text-align:left;background:#f8f9fb;border-radius:13px;padding:20px;font:13px/1.8 Inter,system-ui;max-height:310px;overflow:auto}.vs-row{display:flex;flex-wrap:wrap;gap:15px}.vs-stat{padding:10px;border:1px solid #eee;border-radius:12px}.vs-sub{font-size:12px;color:#6b7481;margin:12px 0}';document.head.append(style);
const adminSection=document.createElement('section');adminSection.id='vsAdmin';adminSection.className='step vs-control';
adminSection.innerHTML='<button class="back" id="vsAdminBack">← Voice Studio</button><div class="eyebrow">ADMIN / PROJECT #94</div><h1 style="font-size:38px">Production control room.</h1><div class="grid"><div class="card"><h2>Generate AI scripts</h2><label>Scripts per request (1–5)</label><input id="vsGenCount" type="number" min="1" max="5" value="3"><label>Language</label><select id="vsGenLang"><option>English</option><option>Hindi</option><option>Hinglish</option></select><label>Mode</label><select id="vsGenMode"><option value="solo">Solo</option><option value="duo">Duo</option></select><label>Length</label><select id="vsGenLength"><option value="60">1 minute</option><option value="120" selected>2 minutes</option><option value="180">3 minutes</option></select><label>Scenario</label><input id="vsGenScenario" value="Mixed customer support"><label>Emotions</label><input id="vsGenEmotions" value="calm, empathetic, frustrated, reassuring"><button class="btn primary" id="vsGen">Generate & save</button><p id="vsGenResult"></p></div><div class="card"><h2>Assign contributors</h2><p>Use an existing Adatacore account. Participants see only their own assigned projects.</p><label>Contributor email</label><input id="vsMember" type="email" placeholder="account@example.com"><label>Daily task allowance</label><input id="vsLimit" type="number" min="0" max="1000" value="20"><label>Action</label><select id="vsAccess"><option value="true">Grant access</option><option value="false">Revoke access</option></select><button class="btn primary" id="vsAssign">Save access</button><p id="vsAssignResult"></p></div></div><div class="card" style="margin-top:18px"><h2>Project status</h2><div class="vs-row" id="vsMetrics"></div><button class="btn" id="vsRefresh">Refresh sessions</button><div id="vsSessions" style="margin-top:20px"></div></div>';
document.querySelector('main').append(adminSection);
$('vsAdminBack').onclick=()=>view('home');
async function refreshAdmin(){
 try{
 let obj=await rpc('vs_admin_overview',{});
 $('vsMetrics').innerHTML=Object.entries(obj).map(([k,v])=>'<span class="vs-stat">'+k.replaceAll('_',' ')+': <b>'+String(v)+'</b></span>').join('');
 const {data,error}=await db.from('vs_sessions').select('id,mode,state,created_at').eq('project_id',P).order('created_at',{ascending:false}).limit(30);if(error)throw error;
 const ids=(data||[]).map(x=>x.id);let tracks=[];
 if(ids.length){let r=await db.from('vs_tracks').select('session_id,storage_path,duration_seconds').in('session_id',ids);if(r.error)throw r.error;tracks=r.data||[]}
 const host=$('vsSessions');host.textContent='';
 for(const s of data||[]){let line=document.createElement('p');line.textContent=new Date(s.created_at).toLocaleString()+' · '+s.mode+' · '+s.state+' ';for(const t of tracks.filter(t=>t.session_id===s.id)){const b=document.createElement('button');b.className='btn small';b.textContent='Listen to track';b.onclick=async()=>{let {data,error}=await db.storage.from('voice-studio').createSignedUrl(t.storage_path,120);if(error)note(fail(error));else window.open(data.signedUrl,'_blank','noopener,noreferrer')};line.append(b)}host.append(line)}
 if(!data?.length)host.textContent='No sessions recorded yet.';
 }catch(e){note(fail(e))}
}
$('vsRefresh').onclick=()=>void refreshAdmin();
$('vsAssign').onclick=async()=>{let b=$('vsAssign');b.disabled=true;try{await rpc('vs_assign_member',{p_email:$('vsMember').value.trim(),p_enabled:$('vsAccess').value==='true',p_limit:Number($('vsLimit').value)});$('vsAssignResult').textContent='Access updated successfully.';await refreshAdmin()}catch(e){$('vsAssignResult').textContent=fail(e)}finally{b.disabled=false}};
$('vsGen').onclick=async()=>{let b=$('vsGen');b.disabled=true;$('vsGenResult').textContent='Generating scripts…';try{const {data:{session:s}}=await db.auth.getSession();if(!s)throw Error('Sign in required');let resp=await fetch(U+'/functions/v1/voice-studio-generate',{method:'POST',headers:{Authorization:'Bearer '+s.access_token,apikey:K,'Content-Type':'application/json'},body:JSON.stringify({project_id:P,count:Number($('vsGenCount').value),mode:$('vsGenMode').value,language:$('vsGenLang').value,scenario:$('vsGenScenario').value,emotions:$('vsGenEmotions').value.split(',').map(x=>x.trim()),duration_seconds:Number($('vsGenLength').value)})});let data=await resp.json();if(!resp.ok)throw Error(data.error+' '+(data.detail||''));$('vsGenResult').textContent=data.created+' scripts saved.';await refreshAdmin()}catch(e){$('vsGenResult').textContent=fail(e)}finally{b.disabled=false}};
let scripts=[];
async function init(){
 const {data:{user}}=await db.auth.getUser();if(!user){location.assign('/auth');return}me=user;admin=await rpc('vs_is_admin',{});
 if(!await rpc('vs_can_join',{p_project:P})){document.querySelector('main').innerHTML='<div class="card"><h2>Project access required</h2><p>Voice Studio has not been published for your account or you are not assigned.</p><a href="/workspace">Return to dashboard</a></div>';return}
 let {data,error}=await db.from('vs_scripts').select('*').eq('project_id',P);if(error)throw error;scripts=data||[];
 if(admin){const b=document.createElement('button');b.className='btn small';b.textContent='Admin controls';b.onclick=()=>{view('vsAdmin');refreshAdmin()};document.querySelector('.header-actions').prepend(b)}
 $('openSolo').onclick=()=>void enter('solo');$('openDuo').onclick=()=>void enter('duo');note('Account verified. Project #94 '+(admin?'administrator preview':'participant access')+'.');
}
async function enter(which){
 try{cleanup();mode=which;session=await rpc('vs_enter',{p_project:P,p_mode:which});script=scripts.find(x=>x.id===session.script_id);if(!script)throw Error('Assigned script unavailable');blob=null;secs=0;
 if(which==='solo'){view('solo');$('scriptTitle').textContent=script.title;$('scriptBody').textContent=script.body;$('emotionMeta').textContent=script.emotion;$('durationMeta').textContent=script.duration_seconds/60+' min target';$('scriptPage').textContent='Assigned';$('scenario').disabled=$('emotion').disabled=$('length').disabled=$('scriptCount').disabled=true;['prevScript','nextScript','scriptRefresh'].forEach(x=>$(x).disabled=true);$('recordTime').textContent='00:00';$('recordStatus').textContent='Microphone ready when you start';$('startRecord').disabled=false;$('stopRecord').disabled=true;$('saveRecord').disabled=true;$('saveRecord').textContent='Retry secure upload';$('playback').hidden=true;setupSolo()}
 else{view('duo');setupDuo();await duoUpdate();poll=setInterval(()=>duoUpdate().catch(e=>roomStatus(fail(e))),1500)}
 }catch(e){note('Unable to start: '+fail(e))}
}
function record(onDone){
 let type=audioType(),parts=[];rec=new MediaRecorder(stream,MediaRecorder.isTypeSupported(type)?{mimeType:type}:undefined);
 rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data)};
 rec.onstop=()=>{clearInterval(timer);blob=new Blob(parts,{type:rec.mimeType||type});onDone()};
 rec.start(1000);
}
async function save(){
 if(!blob||blob.size<1024)throw Error('Empty audio');
 let type=blob.type.split(';')[0],ext=type==='audio/mp4'?'.mp4':type==='audio/ogg'?'.ogg':'.webm',path=session.id+'/'+me.id+ext;
 const {error}=await db.storage.from('voice-studio').upload(path,blob,{contentType:type,upsert:false});
 if(error&&!error.message.toLowerCase().includes('already exists'))throw error;
 session=await rpc('vs_submit',{p_session:session.id,p_path:path,p_seconds:Math.max(secs,1),p_mime:type,p_bytes:blob.size});
 if(mode==='solo'){$('recordStatus').textContent='Recording securely submitted.';$('saveRecord').disabled=true}
 else{roomStatus(session.state==='submitted'?'Both voice tracks submitted.':'Your track submitted. Waiting for partner.');$('vsRetry').hidden=true}
 note('Audio stored in the private Voice Studio bucket.');if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
}
function setupSolo(){
 $('startRecord').onclick=async()=>{try{await mic();session=await rpc('vs_consent',{p_session:session.id});session=await rpc('vs_begin',{p_session:session.id});secs=0;$('startRecord').disabled=true;$('stopRecord').disabled=false;$('recordStatus').textContent='Recording active';record(async()=>{try{await save()}catch(e){$('recordStatus').textContent='Upload failed: '+fail(e);$('saveRecord').disabled=false}});timer=setInterval(()=>{secs++;$('recordTime').textContent=fmt(secs);if(secs>=script.duration_seconds&&rec?.state==='recording')rec.stop()},1000)}catch(e){note(fail(e));cleanup()}};
 $('stopRecord').onclick=()=>{if(rec?.state==='recording')rec.stop()};
 $('saveRecord').onclick=()=>save().catch(e=>note(fail(e)));
 $('resetRecord').disabled=true;
}
function roomStatus(t){if($('vsRoomStatus'))$('vsRoomStatus').textContent=t}
function setupDuo(){
 let host=document.querySelector('#duo .card.lobby');
 host.innerHTML='<div class="orb">♫</div><h2 id="vsRoomTitle">Finding another voice actor…</h2><p id="vsRoomStatus">Waiting for a match. Numbers are drawn from the live queue.</p><div class="stat"><span><b id="vsWaiting">—</b>Waiting actors</span><span><b id="vsCountdown">01:00</b>Conversation countdown</span><span><b id="vsClock">00:00</b>Recorded</span></div><div class="vs-room"><pre id="vsDuoScript" hidden></pre><audio id="vsRemote" autoplay controls playsinline hidden style="width:100%"></audio><div class="actions"><button class="btn primary" id="vsConsent" hidden>Accept & connect microphone</button><button class="btn primary" id="vsStart" hidden disabled>Start recording</button><button class="btn danger" id="vsStop" hidden>Stop & submit my recording</button><button class="btn" id="vsRetry" hidden>Retry upload</button><button class="btn" id="vsLeave">Leave session</button></div></div><p class="vs-sub">No names or emails are shown to your partner. Direct WebRTC connections may expose IP information; a TURN relay is necessary for stronger network privacy and reliable production use.</p>';
 $('vsConsent').onclick=()=>void consent();$('vsStart').onclick=()=>void begin();$('vsStop').onclick=()=>{if(rec?.state==='recording')rec.stop()};$('vsRetry').onclick=()=>save().catch(e=>roomStatus(fail(e)));$('vsLeave').onclick=()=>void leave();
 signalId=0;offerSent=false;connected=false;pc=null;rec=null;
}
async function duoUpdate(){
 if(mode!=='duo'||!session)return;
 let {data,error}=await db.from('vs_sessions').select('*').eq('id',session.id).single();if(error)throw error;session=data;
 $('vsWaiting').textContent=String(await rpc('vs_waiting',{p_project:P}));
 if(['cancelled','expired'].includes(session.state)){clearInterval(poll);roomStatus('This session ended. Return to the studio to start again.');return}
 if(session.state==='waiting'){roomStatus('Waiting for another voice actor to join this project.');return}
 $('vsRoomTitle').textContent=session.state==='submitted'?'Conversation completed':'Matched with Voice Actor '+(session.actor_a===me.id?'B':'A');
 $('vsDuoScript').textContent=script.body;$('vsDuoScript').hidden=false;
 let accepted=session.actor_a===me.id?session.consent_a:session.consent_b;
 $('vsConsent').hidden=accepted||!['matched','rehearsal'].includes(session.state);
 if(session.state==='matched')roomStatus('Match found. Both participants must accept before audio connects.');
 if(session.state==='rehearsal'){
 if(session.consent_a&&session.consent_b&&!pc)await startPeer();
 let left=Math.max(0,60-Math.floor((Date.now()-new Date(session.rehearsal_started_at).getTime())/1000));$('vsCountdown').textContent=fmt(left);
 $('vsStart').hidden=session.actor_a!==me.id;$('vsStart').disabled=left>0||!connected;
 roomStatus(left?'Talk with your partner. This one-minute conversation is not recorded.':'Rehearsal complete. Voice Actor A can start recording.');
 }
 if(session.state==='recording'&&!rec&&!blob){$('vsStart').hidden=true;await beginRecording()}
 if(session.state==='submitted'){clearInterval(poll);roomStatus('Both actors submitted their recordings.');$('vsStop').hidden=true}
 if(pc)await signals();
}
async function consent(){try{await mic();session=await rpc('vs_consent',{p_session:session.id});$('vsConsent').hidden=true;await duoUpdate()}catch(e){roomStatus(fail(e));$('vsConsent').disabled=false}}
async function signal(kind,payload){const {error}=await db.from('vs_signals').insert({session_id:session.id,sender:me.id,kind,payload});if(error)throw error}
async function startPeer(){
 await mic();pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]});
 stream.getTracks().forEach(t=>pc.addTrack(t,stream));
 pc.ontrack=e=>{peerStream=e.streams[0];$('vsRemote').srcObject=peerStream;$('vsRemote').hidden=false;$('vsRemote').play().catch(()=>roomStatus('Press play to hear the other voice actor.'))};
 pc.onconnectionstatechange=()=>{connected=pc.connectionState==='connected';if(['disconnected','failed'].includes(pc.connectionState))roomStatus('Voice connection lost. Try leaving and matching again.')};
 pc.onicecandidate=e=>{if(e.candidate)signal('candidate',e.candidate.toJSON()).catch(x=>roomStatus(fail(x)))};
 signalTimer=setInterval(()=>signals().catch(e=>roomStatus(fail(e))),900);
 await signals();
 if(session.actor_a===me.id&&!offerSent){offerSent=true;const s=await pc.createOffer();await pc.setLocalDescription(s);await signal('offer',s.toJSON())}
}
async function signals(){
 if(!pc||readBusy)return;readBusy=true;
 try{const {data,error}=await db.from('vs_signals').select('id,sender,kind,payload').eq('session_id',session.id).gt('id',signalId).order('id').limit(100);if(error)throw error;
 for(let e of data||[]){signalId=e.id;if(e.sender===me.id)continue;
 if(e.kind==='offer'&&!pc.remoteDescription){await pc.setRemoteDescription(e.payload);let a=await pc.createAnswer();await pc.setLocalDescription(a);await signal('answer',a.toJSON())}
 else if(e.kind==='answer'&&pc.signalingState==='have-local-offer')await pc.setRemoteDescription(e.payload);
 else if(e.kind==='candidate'&&pc.remoteDescription)try{await pc.addIceCandidate(e.payload)}catch{}
 else if(e.kind==='stop'&&rec?.state==='recording')rec.stop();
 }}finally{readBusy=false}
}
async function begin(){try{session=await rpc('vs_begin',{p_session:session.id});await beginRecording()}catch(e){roomStatus(fail(e))}}
async function beginRecording(){
 if(rec||blob)return;await mic();secs=0;
 if(Date.now()-new Date(session.recording_started_at).getTime()>script.duration_seconds*1000){roomStatus('Session recording window expired.');return}
 record(async()=>{try{await save()}catch(e){roomStatus('Upload error: '+fail(e));$('vsRetry').hidden=false}});
 $('vsStart').hidden=true;$('vsStop').hidden=false;roomStatus('Recording active. Follow the dialogue and improvise naturally.');
 timer=setInterval(()=>{secs++;$('vsClock').textContent=fmt(secs);if(Date.now()-new Date(session.recording_started_at).getTime()>=script.duration_seconds*1000&&rec?.state==='recording')rec.stop()},1000);
}
async function leave(){
 if(rec?.state==='recording')rec.stop();clearInterval(poll);clearInterval(signalTimer);
 try{if(session&&session.state!=='submitted')await rpc('vs_leave',{p_session:session.id})}catch(e){note(fail(e))}
 cleanup();session=null;mode='';script=null;view('home');note('Session closed.');
}
window.addEventListener('pagehide',cleanup);
init().catch(e=>note('Studio authorization error: '+fail(e)));
})();