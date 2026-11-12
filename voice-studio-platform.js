(()=>{'use strict';
const P=94,U='https://llmhyezgcnbognmmsnzq.supabase.co',K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',db=supabase.createClient(U,K);
const $=s=>document.getElementById(s),fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
let me,admin=false,session=null,script=null,mode='',stream=null,pc=null,peerStream=null,rec=null,blob=null,secs=0,timer=0,poll=0,signalTimer=0,signalId=0,readBusy=false,offerSent=false,connected=false,iceQueue=[],previewUrl=null,uploading=false,lastLobbyBeat=0,duoRefreshBusy=false;
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
adminSection.innerHTML='<button class="back" id="vsAdminBack">← Voice Studio</button><div class="eyebrow">ADMIN / VOICE STUDIO</div><h1 style="font-size:38px">Production control room.</h1><div class="grid"><div class="card"><h2>Generate AI scripts</h2><label>Scripts to generate (1–100)</label><input id="vsGenCount" type="number" min="1" max="100" value="10"><label>Language</label><select id="vsGenLang"><option>Hindi</option><option>English</option><option>Hinglish</option></select><label>Mode</label><select id="vsGenMode"><option value="solo">Solo</option><option value="duo">Duo</option></select><label>Length</label><select id="vsGenLength"><option value="60">1 minute</option><option value="120" selected>2 minutes</option><option value="180">3 minutes</option></select><label>Scenario</label><input id="vsGenScenario" value="Mixed customer support"><label>Emotions</label><input id="vsGenEmotions" value="calm, empathetic, frustrated, reassuring"><button class="btn primary" id="vsGen">Generate & save</button><p id="vsGenResult"></p></div><div class="card"><h2>Assign contributors</h2><p>Use an existing Adatacore account. Participants see only their own assigned projects.</p><label>Contributor email</label><input id="vsMember" type="email" placeholder="account@example.com"><label>Daily task allowance</label><input id="vsLimit" type="number" min="0" max="1000" value="20"><label>Action</label><select id="vsAccess"><option value="true">Grant access</option><option value="false">Revoke access</option></select><button class="btn primary" id="vsAssign">Save access</button><p id="vsAssignResult"></p></div></div><div class="card" style="margin-top:18px"><h2>Project status</h2><div class="vs-row" id="vsMetrics"></div><button class="btn" id="vsRefresh">Refresh sessions</button><div id="vsSessions" style="margin-top:20px"></div></div>';
document.querySelector('main').append(adminSection);
$('vsAdminBack').onclick=()=>view('home');
async function refreshAdmin(){
 try{
 const stats=await rpc('vs_admin_overview',{});
 $('vsMetrics').textContent='';
 for(const [key,value] of Object.entries(stats)){const span=document.createElement('span');span.className='vs-stat';span.textContent=key.replaceAll('_',' ')+': '+String(value);$('vsMetrics').append(span)}
 const {data,error}=await db.from('vs_sessions').select('id,mode,state,created_at').eq('project_id',P).order('created_at',{ascending:false}).limit(30);if(error)throw error;
 const ids=(data||[]).map(x=>x.id);let tracks=[],reviews=[];
 if(ids.length){
  const [t,r]=await Promise.all([
   db.from('vs_tracks').select('session_id,storage_path,duration_seconds,transcript,transcript_source').in('session_id',ids),
   db.from('vs_reviews').select('session_id,verdict,quality_score,feedback').in('session_id',ids)
  ]);
  if(t.error)throw t.error;if(r.error)throw r.error;tracks=t.data||[];reviews=r.data||[];
 }
 const host=$('vsSessions');host.textContent='';
 for(const s of data||[]){
  const line=document.createElement('article');line.className='vs-stat';line.style.cssText='margin:10px 0;padding:16px;display:block';
  const title=document.createElement('strong');title.textContent=new Date(s.created_at).toLocaleString()+' · '+s.mode+' · '+s.state;line.append(title);
  for(const t of tracks.filter(t=>t.session_id===s.id)){
   const b=document.createElement('button');b.className='btn small';b.textContent='Listen to recording';b.onclick=async()=>{
    const {data,error}=await db.storage.from('voice-studio').createSignedUrl(t.storage_path,120);
    if(error)note(fail(error));else window.open(data.signedUrl,'_blank','noopener,noreferrer');
   };line.append(b);
   if(t.transcript){
    const details=document.createElement('details');details.style.cssText='margin-top:9px;font-size:12px';
    const summary=document.createElement('summary');summary.textContent='Automatic transcript (unverified draft)';summary.style.cursor='pointer';
    const pre=document.createElement('div');pre.textContent=t.transcript;pre.lang='hi';pre.style.cssText='white-space:pre-wrap;max-height:180px;overflow:auto;border-radius:9px;padding:12px;background:#f4f8f7;color:#304a51';
    details.append(summary,pre);line.append(details);
   }
  }
  if(s.state==='submitted'){
   const previous=reviews.find(x=>x.session_id===s.id);
   const review=document.createElement('div');review.style.cssText='margin-top:15px;padding-top:14px;border-top:1px solid #e6e8ef';
   const label=document.createElement('div');label.textContent=previous?'Reviewed: '+previous.verdict+' · '+previous.quality_score+'/5':'Pending quality review';
   label.style.cssText='font-weight:700;margin-bottom:9px';review.append(label);
   const verdict=document.createElement('select');verdict.setAttribute('aria-label','Review verdict');
   for(const value of ['approved','needs_changes','rejected']){const o=document.createElement('option');o.value=value;o.textContent=value.replaceAll('_',' ');verdict.append(o)}
   verdict.value=previous?.verdict||'approved';
   const quality=document.createElement('select');quality.setAttribute('aria-label','Quality score');
   for(let n=1;n<=5;n++){const o=document.createElement('option');o.value=String(n);o.textContent=n+' / 5';quality.append(o)}
   quality.value=String(previous?.quality_score||4);
   const feedback=document.createElement('textarea');feedback.setAttribute('aria-label','Reviewer feedback');feedback.maxLength=4000;feedback.rows=2;feedback.placeholder='Specific, actionable feedback for the voice actor';feedback.value=previous?.feedback||'';feedback.style.cssText='width:100%;margin-top:8px;padding:10px;border:1px solid #dfe2e8;border-radius:9px;font:inherit';
   const saveButton=document.createElement('button');saveButton.className='btn primary small';saveButton.textContent=previous?'Update review':'Submit review';
   const result=document.createElement('span');result.style.cssText='margin-left:10px;font-size:12px';
   saveButton.onclick=async()=>{
    saveButton.disabled=true;result.textContent='Saving…';
    try{
     const {error}=await db.from('vs_reviews').upsert({session_id:s.id,reviewer_id:me.id,verdict:verdict.value,quality_score:Number(quality.value),feedback:feedback.value.trim()},{onConflict:'session_id'});
     if(error)throw error;result.textContent='Review saved successfully.';label.textContent='Reviewed: '+verdict.value+' · '+quality.value+'/5';saveButton.textContent='Update review';
    }catch(e){result.textContent='Review failed: '+fail(e)}finally{saveButton.disabled=false}
   };
   review.append(verdict,quality,feedback,saveButton,result);line.append(review);
  }
  host.append(line);
 }
 if(!data?.length)host.textContent='No recording sessions yet.';
 }catch(e){note('Admin review list unavailable: '+fail(e))}
}
async function loadMine(){
 if(!me||admin)return;
 try{
  const {data,error}=await db.from('vs_sessions').select('id,mode,created_at,state').eq('project_id',P).eq('mode','solo').eq('state','submitted').order('created_at',{ascending:false}).limit(12);
  if(error)throw error;
  let host=$('vsMySubmissions');
  if(!host){host=document.createElement('section');host.id='vsMySubmissions';host.className='card';host.style.marginTop='20px';$('home').append(host)}
  host.textContent='';const heading=document.createElement('h2');heading.textContent='My recording submissions';host.append(heading);
  if(!data?.length){const para=document.createElement('p');para.textContent='Your completed recordings and reviewer feedback will appear here.';host.append(para);return}
  const ids=data.map(x=>x.id);const rv=await db.from('vs_reviews').select('session_id,verdict,quality_score,feedback,reviewed_at').in('session_id',ids);
  if(rv.error)throw rv.error;
  for(const s of data){const row=document.createElement('div');row.style.cssText='padding:12px 0;border-top:1px solid #eaedf0;font-size:13px';
   const review=(rv.data||[]).find(x=>x.session_id===s.id);
   const stamp=document.createElement('strong');stamp.textContent=new Date(s.created_at).toLocaleString()+' · '+(review?review.verdict.replaceAll('_',' ')+' · '+review.quality_score+'/5':'Awaiting quality review');
   row.append(stamp);
   if(review?.feedback){const para=document.createElement('p');para.textContent=review.feedback;row.append(para)}
   host.append(row);
  }
 }catch(e){note('Submission history unavailable: '+fail(e))}
}
$('vsRefresh').onclick=()=>void refreshAdmin();
$('vsAssign').onclick=async()=>{let b=$('vsAssign');b.disabled=true;try{await rpc('vs_assign_member',{p_email:$('vsMember').value.trim(),p_enabled:$('vsAccess').value==='true',p_limit:Number($('vsLimit').value)});$('vsAssignResult').textContent='Access updated successfully.';await refreshAdmin()}catch(e){$('vsAssignResult').textContent=fail(e)}finally{b.disabled=false}};
$('vsGen').onclick=async()=>{const b=$('vsGen'),total=Number($('vsGenCount').value);if(!Number.isInteger(total)||total<1||total>100){$('vsGenResult').textContent='Select between 1 and 100 scripts.';return}b.disabled=true;let created=0;try{const {data:{session:s}}=await db.auth.getSession();if(!s)throw Error('Sign in required');while(created<total){const count=Math.min(5,total-created);$('vsGenResult').textContent='Creating scripts '+(created+1)+'–'+(created+count)+' of '+total+'…';const response=await fetch(U+'/functions/v1/voice-studio-generate',{method:'POST',headers:{Authorization:'Bearer '+s.access_token,apikey:K,'Content-Type':'application/json'},body:JSON.stringify({project_id:P,count,mode:$('vsGenMode').value,language:$('vsGenLang').value,scenario:$('vsGenScenario').value,emotions:$('vsGenEmotions').value.split(',').map(x=>x.trim()),duration_seconds:Number($('vsGenLength').value)})});const result=await response.json();if(!response.ok)throw Error(result.error+' '+(result.detail||''));if(!Number.isInteger(result.created)||result.created<1)throw Error('The AI returned no valid scripts');created+=result.created}$('vsGenResult').textContent=created+' scripts stored successfully.';await refreshAdmin()}catch(e){$('vsGenResult').textContent=created+' of '+total+' created. '+fail(e)}finally{b.disabled=false}};
let scripts=[];
async function init(){
 const supportId=new URLSearchParams(location.search).get('impersonation');
 if(supportId){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(supportId))throw Error('Invalid admin contributor-view session');
  const {data:preview,error:previewError}=await db.rpc('admin_get_contributor_impersonation',{p_session_id:supportId});
  if(previewError||!preview?.target)throw Error('Admin contributor-view session has expired or is unauthorized');
  const banner=document.createElement('div');
  banner.setAttribute('role','status');
  banner.style.cssText='padding:12px 20px;background:#211b33;color:#fff;font:600 12px/1.6 Inter,system-ui;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap';
  const message=document.createElement('span');
  message.textContent='Admin contributor-view · Testing Voice Studio for '+(preview.target.fullName||preview.target.email||'assigned contributor')+'. Recordings and submissions use your admin account, not their identity.';
  const back=document.createElement('a');
  back.href='/workspace?impersonation='+encodeURIComponent(supportId);
  back.textContent='Return to contributor view';
  back.style.cssText='color:white;text-decoration:underline;font-weight:800';
  banner.append(message,back);
  document.body.prepend(banner);
 }
 const {data:{user}}=await db.auth.getUser();if(!user){location.assign('/auth');return}me=user;admin=await rpc('vs_is_admin',{});
 if(!await rpc('vs_can_join',{p_project:P})){document.querySelector('main').innerHTML='<div class="card"><h2>Project access required</h2><p>Voice Studio has not been published for your account or you are not assigned.</p><a href="/workspace">Return to dashboard</a></div>';return}
 let {data,error}=await db.from('vs_scripts').select('*').eq('project_id',P).eq('language','Hindi');if(error)throw error;scripts=data||[];
 if(admin){const b=document.createElement('button');b.className='btn small';b.textContent='Admin controls';b.onclick=()=>{view('vsAdmin');refreshAdmin()};document.querySelector('.header-actions').prepend(b)}
 $('openSolo').disabled=false;$('openSolo').onclick=()=>void enter('solo');$('openDuo').disabled=false;$('openDuo').onclick=()=>void enter('duo');$('openDuo').title='Two-person browser audio (WebRTC, no paid TURN account required). Some restrictive networks may block direct connections.';
 document.querySelector('#solo [data-back]').onclick=()=>void leaveSolo();
 if(!admin)void loadMine();note('Account verified. Voice Studio '+(admin?'administrator preview':'participant access')+'. Duo calling uses a direct browser connection where supported; restrictive networks may require a relay.');
}
async function enter(which){
 try{if(!['solo','duo'].includes(which))throw Error('Unsupported studio mode');cleanup();rec=null;blob=null;mode=which;session=await rpc('vs_enter',{p_project:P,p_mode:which});
 if(session.mode!==which){
  // The server may return an unfinished session from another mode.
  // Never discard a recording without the participant's explicit consent.
  if(session.state==='recording')throw Error('Finish your current recording before switching studio modes.');
  const ok=window.confirm('You have an unfinished '+session.mode+' session. Leave it and open '+which+' instead?');
  if(!ok){session=null;mode='';return}
  await rpc('vs_leave',{p_session:session.id});
  session=await rpc('vs_enter',{p_project:P,p_mode:which});
  if(session.mode!==which)throw Error('Unable to switch studio modes. Please reload and try again.');
 }
 script=scripts.find(x=>x.id===session.script_id);if(!script)throw Error('Assigned Hindi script is unavailable. Please contact the administrator.');blob=null;secs=0;
 if(which==='solo'){
 view('solo');$('scriptTitle').textContent=script.title;$('scriptBody').textContent=script.body;
 $('emotionMeta').textContent=script.emotion;
 $('durationMeta').textContent=Math.floor(script.duration_seconds/60)+' min'+(script.duration_seconds%60?' '+script.duration_seconds%60+' sec':'');
 $('scriptPage').textContent='Hindi · solo';
 $('recordTime').textContent='00:00';$('recordStatus').textContent='Ready when you are';
 $('startRecord').disabled=false;$('stopRecord').disabled=true;$('saveRecord').disabled=true;$('resetRecord').disabled=true;
 $('saveRecord').textContent='Submit audio →';
 $('playback').hidden=true;$('playback').removeAttribute('src');$('soloStatus').textContent='';
 if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;window.VoiceStudioExtras?.reset();window.VoiceStudioExtras?.setDuration(script.duration_seconds);setupSolo();
}
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
 if(uploading||!blob)return;
 if(mode==='duo'&&rec?.state==='recording'){roomStatus('Stop recording before submitting your track.');return}
 uploading=true;
 if(mode==='duo'){$('vsSubmit').disabled=true;$('vsRetry').disabled=true;roomStatus('Uploading your recording securely…')}
 try{
 if(!blob||blob.size<1024)throw Error('Empty audio');
 let type=blob.type.split(';')[0],ext=type==='audio/mp4'?'.mp4':type==='audio/ogg'?'.ogg':'.webm',path=session.id+'/'+me.id+ext;
 const {error}=await db.storage.from('voice-studio').upload(path,blob,{contentType:type,upsert:false});
 if(error&&!error.message.toLowerCase().includes('already exists'))throw error;
 session=await rpc('vs_submit',{p_session:session.id,p_path:path,p_seconds:Math.max(secs,1),p_mime:type,p_bytes:blob.size});
 if(mode==='solo'){
  $('recordStatus').textContent='Recording securely submitted.';$('saveRecord').disabled=true;
  const liveTranscript=window.VoiceStudioExtras?.transcript()||'';
  if(liveTranscript.trim()){
   try{await rpc('vs_save_transcript',{p_session:session.id,p_text:liveTranscript})}
   catch(e){$('soloStatus').textContent='Audio submitted. Automatic transcript could not be saved: '+fail(e)}
  }
  window.VoiceStudioExtras?.submitted();
 }
 else{
  $('vsSubmit').hidden=true;$('vsRetry').hidden=true;$('vsStop').hidden=true;
  $('vsDuoPreview').hidden=true;
  duoTrackStatus('Submitted to QA',session.state==='submitted'?'Submitted':'Waiting for partner');
  roomStatus(session.state==='submitted'?'Both tracks received. Task '+voiceTaskId(session.id)+' is ready for Central QA.':'Your audio was submitted successfully. Waiting for partner to submit their track. Task '+voiceTaskId(session.id));
 }
 note('Audio stored in the private Voice Studio bucket.');if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
 }finally{
   uploading=false;
   if(mode==='duo'&&session?.state!=='submitted'&&blob){
    const ownTrack=await db.from('vs_tracks').select('actor_id').eq('session_id',session.id).eq('actor_id',me.id).maybeSingle();
    if(!ownTrack.data){$('vsSubmit').disabled=false;$('vsRetry').disabled=false;$('vsRetry').hidden=false;}
   }
  }
}
function resetPreview(){
 if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;blob=null;rec=null;secs=0;
 $('recordTime').textContent='00:00';$('playback').pause();$('playback').removeAttribute('src');$('playback').hidden=true;
 $('startRecord').disabled=false;$('stopRecord').disabled=true;$('resetRecord').disabled=true;$('saveRecord').disabled=true;
 $('recordStatus').textContent='Ready for a new take.';$('soloStatus').textContent='Your previous take has been discarded; nothing was uploaded.';window.VoiceStudioExtras?.reset();
}
async function leaveSolo(skipConfirm=false){
 if(uploading){note('The recording is uploading. Please complete the submission before leaving.');return}
 if(rec?.state==='recording'){note('Stop recording before leaving the studio.');return}
 if(blob&&!skipConfirm){
  if(!window.VoiceStudioSubmitDialog){note('Submission controls are unavailable. Please reload the studio.');return}
  window.VoiceStudioSubmitDialog.showDiscard({seconds:secs,onDiscard:()=>leaveSolo(true)});
  return;
 }
 try{
  if(session&&session.state!=='submitted')await rpc('vs_leave',{p_session:session.id});
 }catch(e){note('Could not close session: '+fail(e));return}
 if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;
 window.VoiceStudioExtras?.reset();cleanup();rec=null;blob=null;mode='';session=null;script=null;view('home');note('Session closed. Your unsent recording was discarded.');
}
function setupSolo(){
 $('startRecord').onclick=async()=>{
  if(uploading||rec?.state==='recording'||session?.state==='submitted')return;
  try{
   if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('This browser does not support microphone recording.');
   await mic();
   if(session.state==='matched')session=await rpc('vs_consent',{p_session:session.id});
   if(session.state==='rehearsal')session=await rpc('vs_begin',{p_session:session.id});
   if(session.state!=='recording')throw Error('Session is not ready to record.');
   if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;blob=null;secs=0;
   $('recordTime').textContent='00:00';$('playback').hidden=true;$('playback').removeAttribute('src');
   $('startRecord').disabled=true;$('stopRecord').disabled=false;$('saveRecord').disabled=true;$('resetRecord').disabled=true;
   $('recordStatus').textContent='Recording active — please deliver the assigned script.';
   $('soloStatus').textContent='';
   record(()=>{
    window.VoiceStudioExtras?.stop(secs);
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
    $('stopRecord').disabled=true;
    if(!blob||blob.size<1024){$('recordStatus').textContent='No usable audio captured.';$('resetRecord').disabled=false;return}
    previewUrl=URL.createObjectURL(blob);$('playback').src=previewUrl;$('playback').hidden=false;
    $('saveRecord').disabled=false;$('resetRecord').disabled=false;
    $('recordStatus').textContent='Recording complete — review your playback before submitting.';
    $('soloStatus').textContent='Not yet submitted. Choose Submit recording or Record again.';
   });
   window.VoiceStudioExtras?.start(stream,script.duration_seconds);
   timer=setInterval(()=>{secs++;$('recordTime').textContent=fmt(secs);if(secs>=script.duration_seconds&&rec?.state==='recording')rec.stop()},1000);
  }catch(e){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}$('startRecord').disabled=false;$('recordStatus').textContent='Recording could not start.';note(fail(e))}
 };
 $('stopRecord').onclick=()=>{if(rec?.state==='recording')rec.stop()};
 $('resetRecord').onclick=()=>{if(!uploading)resetPreview()};
 $('saveRecord').onclick=()=>{
  if(uploading||!blob||session?.state==='submitted')return;
  const ui=window.VoiceStudioSubmitDialog;
  if(!ui){note('Unable to open the submission confirmation. Please reload Voice Studio.');return}
  const q=window.VoiceStudioExtras?.quality(),warnings=[];
  if(secs<Math.min(35,script.duration_seconds*.55))warnings.push('This take is shorter than the assigned duration.');
  if(q?.clipping)warnings.push('Your microphone level may have distorted parts of this recording.');
  if(q?.mostlyQuiet)warnings.push('Some sections of the recording appear unusually quiet.');
  ui.showSubmit({
   seconds:secs,
   transcriptIncluded:Boolean(window.VoiceStudioExtras?.transcript()),
   warnings,
   onSubmit:async()=>{
    if(!blob||!session||session.state==='submitted')throw Error('No recording is available to submit.');
    $('saveRecord').disabled=true;$('resetRecord').disabled=true;
    $('recordStatus').textContent='Submitting your audio securely…';
    try{
     await save();
     $('soloStatus').textContent='Your audio has been submitted successfully.';
     $('startRecord').disabled=true;$('resetRecord').disabled=true;
    }catch(error){
     if(session?.state==='submitted'){
      $('soloStatus').textContent='Your audio has been submitted successfully.';
      return;
     }
     $('recordStatus').textContent='Upload failed — please try submitting again.';
     $('soloStatus').textContent='Your recording is still available to retry.';
     $('saveRecord').disabled=false;$('resetRecord').disabled=false;
     throw error;
    }
   }
  });
 };
}
function roomStatus(t){if($('vsRoomStatus'))$('vsRoomStatus').textContent=t}
const voiceTaskId=id=>id?'VS-'+String(id).toUpperCase():'—';
function duoStage(index,label){
 const stages=['Matching','Mic consent','Audio connected','Rehearsal','Recording','Submitted'];
 const host=$('vsStageList');if(!host)return;
 host.replaceChildren();
 stages.forEach((title,i)=>{
  const item=document.createElement('span');
  item.className='vs-stage'+(i<index?' done':i===index?' current':'');
  item.textContent=(i<index?'✓ ':i===index?'● ':'○ ')+title;
  host.append(item);
 });
 const summary=$('vsProgressSummary');if(summary)summary.textContent=label||stages[index]||'';
}
function duoAudioStatus(message,level='pending'){
 const el=$('vsAudioConnection');if(!el)return;
 el.textContent=message;el.dataset.state=level;
}
function duoTrackStatus(local,partner){
 const a=$('vsLocalTrack'),b=$('vsPartnerTrack');
 if(a)a.textContent=local;
 if(b)b.textContent=partner;
}

function setupDuo(){
 const host=document.querySelector('#duo .card.lobby');
 host.innerHTML='<div class="vs-duo-header"><div><span class="vs-duo-overline">LIVE SESSION / TWO-PERSON AUDIO</span><h2 id="vsRoomTitle">Finding another voice actor…</h2><p id="vsRoomStatus" role="status" aria-live="polite">Searching for another approved contributor.</p></div><div class="vs-duo-task-id"><span>Recording task ID</span><strong id="vsDuoTaskId">Assigning…</strong><button type="button" class="btn small" id="vsCopyId">Copy ID</button></div></div><div class="vs-stage-list" id="vsStageList" aria-label="Session progress"></div><div class="vs-progress-caption" id="vsProgressSummary"></div><div class="vs-duo-stats"><div><small>Participants</small><strong id="vsParticipants">1 / 2</strong></div><div><small>Audio connection</small><strong id="vsAudioConnection" data-state="pending">Not connected</strong></div><div><small>Rehearsal remaining</small><strong id="vsCountdown">01:00</strong></div><div><small>Recorded</small><strong id="vsClock">00:00</strong></div><div><small>Other actors waiting</small><strong id="vsWaiting">0</strong></div></div><div class="vs-duo-tracks"><div><span>Your recording</span><strong id="vsLocalTrack">Not started</strong></div><div><span>Partner recording</span><strong id="vsPartnerTrack">Not started</strong></div></div><div class="vs-room"><pre id="vsDuoScript" hidden></pre><div class="vs-audio-player"><audio id="vsRemote" autoplay controls playsinline hidden></audio><button type="button" class="btn" id="vsHearPartner" hidden>▶ Hear partner</button></div><div id="vsDuoPreview" class="vs-duo-preview" hidden><h3>Review your take before submitting</h3><audio id="vsPreviewAudio" controls preload="metadata"></audio><p>The recording stays on this device until you select Submit recording.</p></div><div class="actions"><button class="btn primary" id="vsConsent" hidden>Accept & connect microphone</button><button class="btn primary" id="vsStart" hidden disabled>Start recording</button><button class="btn danger" id="vsStop" hidden>Stop my recording</button><button class="btn primary" id="vsSubmit" hidden>Submit recording to QA</button><button class="btn" id="vsRetry" hidden>Retry upload</button><button class="btn" id="vsLeave">Leave session</button></div></div><p class="vs-sub">Each participant stops and submits their own track separately. Both tracks share one task ID and appear in Central QA after submission. Direct WebRTC may expose IP information and may require a TURN relay on restrictive networks.</p>';
 $('vsConsent').onclick=()=>void consent();
 $('vsStart').onclick=()=>void begin();
 $('vsStop').onclick=()=>{if(rec?.state==='recording')rec.stop()};
 $('vsSubmit').onclick=()=>save().catch(e=>roomStatus('Upload error: '+fail(e)));
 $('vsRetry').onclick=()=>save().catch(e=>roomStatus('Upload error: '+fail(e)));
 $('vsHearPartner').onclick=()=>{const a=$('vsRemote');if(a?.srcObject)a.play().then(()=>duoAudioStatus('Partner audio playing','good')).catch(()=>duoAudioStatus('Press play on the audio controls','warn'))};
 $('vsCopyId').onclick=()=>navigator.clipboard?.writeText(voiceTaskId(session?.id)).then(()=>roomStatus('Task ID copied.'),()=>roomStatus('Copy the task ID shown above.'));
 $('vsLeave').onclick=()=>void leave();
 signalId=0;offerSent=false;connected=false;iceQueue=[];pc=null;rec=null;lastLobbyBeat=0;
 duoStage(0,'Waiting for the second participant');
 duoAudioStatus('Waiting for partner');
 duoTrackStatus('Not started','Not started');
}
async function duoUpdate(){
 if(mode!=='duo'||!session||duoRefreshBusy)return;
 duoRefreshBusy=true;
 try{
  // Heartbeat means a waiting browser tab remains matchable, even after five minutes.
  if(session.state==='waiting'&&Date.now()-lastLobbyBeat>10000){
   lastLobbyBeat=Date.now();
   await rpc('vs_wait_heartbeat',{p_session:session.id});
  }
  const {data,error}=await db.from('vs_sessions').select('*').eq('id',session.id).single();
  if(error)throw error;
  session=data;
  $('vsDuoTaskId').textContent=voiceTaskId(session.id);
  $('vsParticipants').textContent=session.actor_b?'2 / 2':'1 / 2';
  $('vsWaiting').textContent=String(await rpc('vs_waiting',{p_project:P}));
  const {data:submittedTracks,error:tracksError}=await db.from('vs_tracks').select('actor_id').eq('session_id',session.id);
  if(!tracksError){
   const done=(submittedTracks||[]).some(t=>t.actor_id===me.id);
   const partner=(submittedTracks||[]).some(t=>t.actor_id!==me.id);
   duoTrackStatus(done?'Submitted to QA':blob?'Ready to submit':rec?.state==='recording'?'Recording…':'Not started',partner?'Submitted':session.state==='submitted'?'Submitted':'Waiting');
  }
  if(session.state==='expired'){
   // Recover automatically when a tab wakes up after its queue lease expired.
   session=await rpc('vs_enter',{p_project:P,p_mode:'duo'});
   if(session.mode!=='duo')throw Error('An unfinished Solo recording is blocking Duo. Finish or leave it first.');
   script=scripts.find(x=>x.id===session.script_id);
   if(!script)throw Error('The matched Hindi script is unavailable');
   setupDuo();
   roomStatus('Previous waiting session expired. You are back in the matching queue.');
   return;
  }
  if(session.state==='cancelled'){clearInterval(poll);roomStatus('This session was cancelled. Return to the studio to start again.');return;}
  if(session.state==='waiting'){
   duoStage(0,'Waiting for another approved participant');
   duoAudioStatus('Waiting for partner');
   $('vsRoomTitle').textContent='Finding another voice actor…';
   roomStatus('Searching for another approved participant. Keep this page open; matching refreshes automatically.');
   return;
  }
  $('vsRoomTitle').textContent=session.state==='submitted'?'Conversation completed':'Matched with Voice Actor '+(session.actor_a===me.id?'B':'A');
  $('vsDuoScript').textContent=script.body;$('vsDuoScript').hidden=false;
  const accepted=session.actor_a===me.id?session.consent_a:session.consent_b;
  $('vsConsent').hidden=accepted||!['matched','rehearsal'].includes(session.state);
  if(session.state==='matched')duoStage(1,'Match found · both participants must accept microphone access');
  if(session.state==='matched')roomStatus('Match found. Both participants must accept before audio connects.');
  if(session.state==='rehearsal'){
   if(session.consent_a&&session.consent_b&&!pc)await startPeer();
   duoStage(connected?3:2,connected?'Conversation practice · speak normally':'Connecting secure audio with your partner…');
   const left=Math.max(0,60-Math.floor((Date.now()-new Date(session.rehearsal_started_at).getTime())/1000));
   $('vsCountdown').textContent=fmt(left);
   $('vsStart').hidden=session.actor_a!==me.id;$('vsStart').disabled=left>0||!connected;
   roomStatus(!connected?'Waiting for two-way audio. Check the connection indicator and click Hear partner if needed.':left?'Talk with your partner. This one-minute conversation is not recorded.':'Rehearsal complete. Voice Actor A can start recording.');
  }
  if(session.state==='recording'&&!rec&&!blob){$('vsStart').hidden=true;await beginRecording()}
  if(session.state==='recording')duoStage(4,rec?.state==='recording'?'Recording live · stop when your take is complete':blob?'Recording stopped · preview and submit':'Waiting for recording to begin');
  if(session.state==='submitted')duoStage(5,'Recording task completed · ready for QA');
  if(session.state==='submitted'){
   clearInterval(poll);$('vsStop').hidden=true;$('vsSubmit').hidden=true;
   roomStatus('Both recordings received. Task '+voiceTaskId(session.id)+' is ready in Central QA.');
  }
  if(pc)await signals();
 }catch(error){roomStatus('Unable to refresh matching: '+fail(error));}
 finally{duoRefreshBusy=false}
}
async function consent(){try{await mic();session=await rpc('vs_consent',{p_session:session.id});$('vsConsent').hidden=true;await duoUpdate()}catch(e){roomStatus(fail(e));$('vsConsent').disabled=false}}
async function signal(kind,payload){const {error}=await db.from('vs_signals').insert({session_id:session.id,sender:me.id,kind,payload});if(error)throw error}
async function turnIce(){
 // Use the existing authenticated relay if configured, but never require a paid TURN account.
 // Public STUN only helps peers discover routes; it is not an audio relay.
 const fallback=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}];
 try{
  const {data:{session:a}}=await db.auth.getSession();
  if(!a)return fallback;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),2500);
  try{
   const r=await fetch(U+'/functions/v1/voice-studio-ice',{method:'POST',headers:{Authorization:'Bearer '+a.access_token,apikey:K,'Content-Type':'application/json'},body:'{}',signal:controller.signal});
   if(!r.ok)return fallback;
   const response=await r.json();
   const servers=Array.isArray(response.iceServers)?response.iceServers.filter(x=>x&&x.urls):[];
   return servers.length?[...servers,...fallback]:fallback;
  }finally{clearTimeout(timeout)}
 }catch(_){return fallback}
}
async function startPeer(){
 await mic();const ice=await turnIce();pc=new RTCPeerConnection({iceServers:ice,iceTransportPolicy:'all'});
 stream.getTracks().forEach(t=>pc.addTrack(t,stream));
 pc.ontrack=e=>{
  peerStream=e.streams[0]||new MediaStream([e.track]);
  const audio=$('vsRemote');audio.srcObject=peerStream;audio.hidden=false;
  $('vsHearPartner').hidden=false;
  audio.play().then(()=>duoAudioStatus('Partner audio playing','good')).catch(()=>duoAudioStatus('Partner audio available · click Hear partner','warn'));
 };
 pc.onconnectionstatechange=()=>{
  connected=pc.connectionState==='connected';
  if(connected){duoAudioStatus('Connected to partner','good');duoStage(3,'Two-way audio connected · practice conversation');}
  else if(pc.connectionState==='failed'){duoAudioStatus('Connection failed · relay may be required','warn');roomStatus('Audio could not connect on this network. Try another network or configure a TURN relay.');}
  else if(pc.connectionState==='disconnected'){duoAudioStatus('Reconnecting…','warn');roomStatus('Voice connection interrupted. Reconnecting…');}
  else duoAudioStatus('Connecting: '+pc.connectionState);
 };
 pc.onicecandidate=e=>{if(e.candidate)signal('candidate',e.candidate.toJSON()).catch(x=>roomStatus(fail(x)))};
 signalTimer=setInterval(()=>signals().catch(e=>roomStatus(fail(e))),900);
 await signals();
 if(session.actor_a===me.id&&!offerSent){offerSent=true;const s=await pc.createOffer();await pc.setLocalDescription(s);await signal('offer',{type:s.type,sdp:s.sdp})}
}
async function signals(){
 if(!pc||readBusy)return;readBusy=true;
 try{const {data,error}=await db.from('vs_signals').select('id,sender,kind,payload').eq('session_id',session.id).gt('id',signalId).order('id').limit(100);if(error)throw error;
 for(let e of data||[]){signalId=e.id;if(e.sender===me.id)continue;
 if(e.kind==='offer'&&!pc.remoteDescription){await pc.setRemoteDescription(e.payload);for(const c of iceQueue.splice(0)){try{await pc.addIceCandidate(c)}catch{}}let a=await pc.createAnswer();await pc.setLocalDescription(a);await signal('answer',{type:a.type,sdp:a.sdp})}
 else if(e.kind==='answer'&&pc.signalingState==='have-local-offer'){await pc.setRemoteDescription(e.payload);for(const c of iceQueue.splice(0)){try{await pc.addIceCandidate(c)}catch{}}}
 else if(e.kind==='candidate'){if(pc.remoteDescription){try{await pc.addIceCandidate(e.payload)}catch{}}else iceQueue.push(e.payload)}
 else if(e.kind==='stop')duoTrackStatus(blob?'Ready to submit':rec?.state==='recording'?'Recording…':'Not started','Partner stopped · waiting for submission');
 }}finally{readBusy=false}
}
async function begin(){try{session=await rpc('vs_begin',{p_session:session.id});await beginRecording()}catch(e){roomStatus(fail(e))}}
async function beginRecording(){
 if(rec||blob)return;
 await mic();secs=0;
 if(Date.now()-new Date(session.recording_started_at).getTime()>script.duration_seconds*1000){
  roomStatus('The recording window expired. Return to the studio to start another session.');return;
 }
 record(()=>{
  const preview=$('vsDuoPreview'),audio=$('vsPreviewAudio');
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  previewUrl=URL.createObjectURL(blob);
  audio.src=previewUrl;preview.hidden=false;
  $('vsStop').hidden=true;$('vsSubmit').hidden=false;$('vsRetry').hidden=true;
  duoTrackStatus('Stopped · preview before submitting','Waiting for partner');
  duoStage(4,'Your recording is ready to preview and submit');
  roomStatus('Recording stopped. Listen to your take and select Submit recording to send it to QA. Task '+voiceTaskId(session.id));
  signal('stop',{actor:me.id}).catch(()=>{});
 });
 $('vsStart').hidden=true;$('vsStop').hidden=false;$('vsSubmit').hidden=true;
 duoTrackStatus('Recording…','Waiting for partner');
 duoStage(4,'Recording in progress · use Stop my recording to finish your track');
 roomStatus('Recording live. Stop your own track when finished; the partner can finish independently.');
 timer=setInterval(()=>{
  secs++;$('vsClock').textContent=fmt(secs);
  if(Date.now()-new Date(session.recording_started_at).getTime()>=script.duration_seconds*1000&&rec?.state==='recording')rec.stop();
 },1000);
}
async function leave(){
 if(uploading){roomStatus('Upload is in progress. Please complete it before leaving.');return}
 if(rec?.state==='recording'){
  roomStatus('Stop your recording before leaving the session.');return;
 }
 if(blob&&mode==='duo'){
  const own=await db.from('vs_tracks').select('actor_id').eq('session_id',session.id).eq('actor_id',me.id).maybeSingle();
  if(!own.data&&!window.confirm('Your recording has not been submitted. Leaving will discard this take. Continue?'))return;
 }
 clearInterval(poll);clearInterval(signalTimer);
 try{
  if(session&&session.state!=='submitted'){
   const {data:myTrack}=await db.from('vs_tracks').select('actor_id').eq('session_id',session.id).eq('actor_id',me.id).maybeSingle();
   // An actor who submitted must never cancel their partner's active recording.
   if(!myTrack)await rpc('vs_leave',{p_session:session.id});
  }
 }catch(e){note(fail(e))}
 cleanup();
 if(previewUrl)URL.revokeObjectURL(previewUrl);
 previewUrl=null;blob=null;rec=null;session=null;mode='';script=null;view('home');note('Session closed.');
}
window.addEventListener('pagehide',()=>{window.VoiceStudioExtras?.dispose();if(previewUrl)URL.revokeObjectURL(previewUrl);cleanup()});
init().catch(e=>note('Studio authorization error: '+fail(e)));
})();