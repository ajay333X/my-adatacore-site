(()=>{
'use strict';
if(window.__adatacoreStudioInlineApplications)return;
window.__adatacoreStudioInlineApplications=true;
const BASE='https://llmhyezgcnbognmmsnzq.supabase.co',KEY='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const db=window.supabase?.createClient(BASE,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const languages={hi:'Hindi',bn:'Bengali',ta:'Tamil',ml:'Malayalam',te:'Telugu',mr:'Marathi',kn:'Kannada',gu:'Gujarati',pa:'Punjabi',or:'Odia',as:'Assamese',ur:'Urdu',ne:'Nepali',sa:'Sanskrit',kok:'Konkani',mai:'Maithili',sd:'Sindhi',ks:'Kashmiri',mni:'Manipuri',bo:'Bodo',doi:'Dogri',sat:'Santali'};
const decisions={pending:'Review later',selected:'Selected to proceed',permission_needed:'Permission needed',skipped:'Not suitable',imported:'Imported'};
let rows=[],reviews=new Map(),currentId='',activeDetails=null,currentUser=null,loading=false,initialized=false,selectedAudioUrl='';
const formatLength=ms=>{const s=Math.round(Math.max(0,Number(ms)||0)/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const badge=s=>'<span class="ds-badge '+(s==='imported'||s==='selected'?'good':s==='skipped'?'bad':'warn')+'">'+esc(decisions[s]||'Not reviewed')+'</span>';
function message(text,fail=false){
 const box=$('dsAppMessage');if(!box)return;
 box.textContent=text;box.style.color=fail?'#b4433e':'#287b68';
}
async function rpc(name,args={}){const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data}
function renderStats(){
 const count=s=>rows.filter(x=>(reviews.get(x.id)?.decision||'pending')===s).length;
 $('dsAppStats').innerHTML=[
  ['Application recordings',rows.length],
  ['Selected',count('selected')],
  ['Permission needed',count('permission_needed')],
  ['Imported',count('imported')]
 ].map(([label,value])=>'<div class="ds-card ds-stat"><small>'+esc(label)+'</small><strong>'+value+'</strong></div>').join('');
}
function render(){
 if(!initialized)return;
 renderStats();
 const query=$('dsAppSearch').value.trim().toLowerCase();
 const chosenLanguage=$('dsAppLanguage').value,chosenDecision=$('dsAppDecisionFilter').value;
 const items=rows.filter(x=>{
  const state=reviews.get(x.id)?.decision||'pending';
  return (chosenLanguage==='all'||x.language_code===chosenLanguage)
   &&(chosenDecision==='all'||state===chosenDecision)
   &&(!query||[x.name,x.language_label,x.language_code,x.id].some(v=>String(v||'').toLowerCase().includes(query)));
 });
 $('dsAppList').innerHTML=items.length?items.map(x=>{
  const d=reviews.get(x.id)?.decision||'pending';
  return '<button class="ds-app-button '+(currentId===x.id?'active':'')+'" data-app-open="'+esc(x.id)+'" type="button">'+
   '<strong>'+esc(x.name||'Voice applicant')+'</strong><div class="ds-meta">'+esc(x.language_label||x.language_code)+
   ' · '+formatLength(x.sample_size)+' · '+esc(x.status)+' · '+esc(x.id.slice(0,8))+'</div>'+
   '<div class="ds-app-badges">'+badge(d)+(d==='imported'?'<span class="ds-badge good">Ready for clips</span>':'')+'</div></button>';
 }).join(''):'<div class="ds-empty"><strong>No matching recordings</strong>Use another filter or refresh your applications.</div>';
}
async function refresh(){
 if(loading)return;
 loading=true;$('dsAppRefresh').disabled=true;
 message('Reading voice recordings and review decisions from Applications…');
 try{
  const {data:account,error}=await db.auth.getUser();
  if(error||!account?.user)throw Error('Sign in as a Super Admin to access application recordings.');
  const rights=await rpc('get_my_admin_access');
  if(!rights?.is_super_admin)throw Error('Only active Super Admin accounts may access this private intake.');
  currentUser=account.user;
  const [applications,r]=await Promise.all([
   rpc('admin_application_queue_v2',{p_status:null,p_track:'voice_acting',p_language:null,p_query:null}),
   db.from('dataset_studio_applicant_reviews').select('*').limit(1500)
  ]);
  if(r.error)throw Error(r.error.message);
  reviews=new Map((r.data||[]).map(x=>[x.application_id,x]));
  rows=(Array.isArray(applications)?applications:[]).filter(x=>x.track==='voice_acting'&&Number(x.sample_size)>0&&Object.prototype.hasOwnProperty.call(languages,String(x.language_code||'').split('-')[0].toLowerCase()));
  const current=$('dsAppLanguage').value;
  const codes=[...new Set(rows.map(x=>x.language_code))].sort();
  $('dsAppLanguage').innerHTML='<option value="all">All Indic languages</option>'+codes.map(code=>'<option value="'+esc(code)+'">'+esc(languages[code.split('-')[0]]||code)+' · '+esc(code)+'</option>').join('');
  $('dsAppLanguage').value=codes.includes(current)?current:'all';
  render();message(rows.length+' private submitted Indic voice recordings available for your review.');
 }catch(e){
  message('Unable to load applications: '+e.message,true);
  if(!rows.length)$('dsAppList').innerHTML='<div class="ds-empty"><strong>Application audio unavailable</strong>Check your Super Admin access and try Refresh.</div>';
 }finally{loading=false;$('dsAppRefresh').disabled=false}
}
async function open(id){
 if(!rows.some(x=>x.id===id))return;
 currentId=id;activeDetails=null;render();
 const destination=$('dsAppDetail');destination.innerHTML='<div class="ds-empty">Opening original application recording…</div>';
 try{
  const detail=await rpc('admin_application_detail',{p_application_id:id});
  if(currentId!==id)return;
  const app=detail.application||{},profile=detail.profile||{},review=reviews.get(id)||{};
  const base=rows.find(x=>x.id===id);
  activeDetails={application:app,profile,base};
  const previous=review.decision||'pending';
  const choices=Object.entries(decisions).filter(([k])=>k!=='imported'||previous==='imported').map(([key,label])=>
    '<option value="'+key+'"'+(previous===key?' selected':'')+'>'+esc(label)+'</option>').join('');
  const alreadyImported=Boolean(review.imported_source_id);
  destination.innerHTML=
   '<div class="ds-tone"><strong>'+esc(profile.name||base?.name||'Voice applicant')+'</strong><br>'+
    esc(app.language_label||base?.language_label||'Indic language')+' · '+formatLength(app.recording_duration_ms)+' · Original hiring status: '+esc(app.status||'Unknown')+
    '<br><span class="ds-faint">Application '+esc(id)+'</span></div>'+
   '<div class="ds-heading">Original submitted audio</div>'+
   '<div id="dsAppAudio"><div class="ds-note">Loading private audio preview…</div></div>'+
   '<p class="ds-app-muted">Audition recordings may be scripted speech rather than spontaneous conversation. Listen before you select a segment.</p>'+
   '<div class="ds-divider"></div>'+
   '<label class="ds-field">Your dataset-sourcing decision<select id="dsAppChoice"'+(alreadyImported?' disabled':'')+'>'+choices+'</select></label>'+
   '<label class="ds-field" style="margin-top:13px">Reviewer notes<textarea id="dsAppNote" maxlength="3000" placeholder="Why this is / is not suitable: clarity, language, accent, background noise…">'+esc(review.reviewer_note||'')+'</textarea></label>'+
   '<div class="ds-divider"></div>'+
   '<div class="ds-heading">Permission to reuse this voice recording</div>'+
   '<div class="ds-app-concern">Recruitment consent is not commercial dataset consent. Get separate, explicit authorization from the applicant for the intended dataset/customer-demo use before pulling the file.</div>'+
   '<label class="ds-app-consent"><input type="checkbox" id="dsAppConsent"'+(review.explicit_consent_confirmed?' checked':'')+'>'+
   '<span>I verified the applicant has explicitly authorized reusing this specific recording in datasets and demonstrations.</span></label>'+
   '<label class="ds-field">Permission record / reference<textarea id="dsAppEvidence" maxlength="1000" rows="2" placeholder="Dated agreement or consent record ID (at least 12 characters), not credentials">'+esc(review.consent_evidence||'')+'</textarea></label>'+
   '<div class="ds-app-controls">'+
   (alreadyImported
    ?'<button type="button" id="dsAppOpenEditor" class="ds-btn ds-btn-primary">Open in Clip Editor →</button>'
    :'<button type="button" id="dsAppSave" class="ds-btn">Save decision</button><button type="button" id="dsAppPull" class="ds-btn ds-btn-primary">Pull audio & open Clip Editor →</button>')+
   '</div>'+
   (alreadyImported?'<p class="ds-app-imported">✓ This recording is already in the private Dataset Studio Source Collector.</p>':'')+
   '<p class="ds-app-muted" style="margin-top:15px">A pulled copy will be stored privately. The original application recording, hiring status, and applicant identity remain unchanged. Nothing will be publicly published.</p>';
  if(alreadyImported)$('dsAppOpenEditor').addEventListener('click',()=>openImported(review.imported_source_id));
  else{
   $('dsAppSave').addEventListener('click',()=>saveOnly(id));
   $('dsAppPull').addEventListener('click',()=>pull(id));
  }
  if(app.recording_bucket!=='application_assessments'||!app.recording_path){
    $('dsAppAudio').innerHTML='<div class="ds-note">The original application audio is unavailable here.</div>';
    if($('dsAppPull'))$('dsAppPull').disabled=true;
    return;
  }
  const {data:signed,error}=await db.storage.from('application_assessments').createSignedUrl(app.recording_path,900);
  if(currentId!==id)return;
  if(error||!signed?.signedUrl){
   $('dsAppAudio').innerHTML='<div class="ds-app-concern">Secure preview unavailable. You can listen in the existing Admin → Applications tool.</div>';
   if($('dsAppPull'))$('dsAppPull').disabled=true;return;
  }
  const holder=$('dsAppAudio');if(holder){
   holder.innerHTML='';
   const player=document.createElement('audio');player.className='ds-app-player';player.controls=true;player.preload='metadata';player.src=signed.signedUrl;holder.append(player);
  }
 }catch(e){if(currentId===id)destination.innerHTML='<div class="ds-empty"><strong>Cannot open this recording</strong>'+esc(e.message)+'</div>'}
}
function formReview(id){
 if(id!==currentId||!activeDetails)throw Error('Select an application first.');
 const decision=$('dsAppChoice').value,note=$('dsAppNote').value.trim();
 const consent=$('dsAppConsent').checked,evidence=$('dsAppEvidence').value.trim();
 if(!Object.prototype.hasOwnProperty.call(decisions,decision)||decision==='imported')throw Error('Select a valid review decision.');
 if(consent&&evidence.length<12)throw Error('Add a verifiable permission reference of at least 12 characters.');
 return {application_id:id,reviewed_by:currentUser.id,decision,reviewer_note:note,
  explicit_consent_confirmed:consent,consent_evidence:evidence,reviewed_at:new Date().toISOString()};
}
async function persist(id){
 const review=formReview(id);
 const {data,error}=await db.from('dataset_studio_applicant_reviews').upsert(review,{onConflict:'application_id'}).select('*').single();
 if(error)throw Error(error.message);
 reviews.set(id,data);render();return data;
}
async function saveOnly(id){
 const button=$('dsAppSave');button.disabled=true;
 try {await persist(id);message('Decision saved for dataset sourcing. Hiring status is unchanged.')}
 catch(e){message('Unable to save review: '+e.message,true)}
 finally{button.disabled=false}
}
async function openImported(id){
 if(!id)return message('Imported audio source could not be located.',true);
 const btn=$('dsAppOpenEditor')||$('dsAppPull');if(btn)btn.disabled=true;
 try {
  await window.adatacoreDatasetStudio.openImportedSource(id);
  message('Recording ready in Clip Editor. Choose your one-minute segment, save, and transcribe.');
 }catch(e){
  message('Audio source was imported but could not open the editor: '+e.message,true);
 }finally{if(btn)btn.disabled=false}
}
async function pull(id){
 const button=$('dsAppPull');
 button.disabled=true;
 try{
  const payload=formReview(id);
  if(payload.decision!=='selected')throw Error('Set the decision to "Selected to proceed" before pulling.');
  if(!payload.explicit_consent_confirmed||payload.consent_evidence.length<12)
   throw Error('A separate, verifiable reuse-permission record is required to pull this applicant voice.');
  await persist(id);
  message('Securely copying the authorized recording from Applications to Dataset Studio…');
  const {data,error}=await db.functions.invoke('dataset-applicant-import',{body:{application_id:id}});
  if(error){
   let detail=error.message||'Unable to pull recording.';
   try{const body=await error.context?.json?.();if(body?.error)detail=body.error}catch(_){}
   throw Error(detail);
  }
  if(data?.error)throw Error(data.error);
  const sourceId=data?.source_id;
  if(!sourceId)throw Error('The audio service did not return a valid source record.');
  reviews.set(id,{...(reviews.get(id)||{}),decision:'imported',imported_source_id:sourceId});
  message('Audio pulled successfully. Opening the Clip Editor…');render();
  await openImported(sourceId);
 }catch(e){message('Cannot pull recording: '+e.message,true)}
 finally{if(currentId===id&&$('dsAppPull'))$('dsAppPull').disabled=false}
}
async function begin(){
 if(initialized)return;
 const panel=$('view-applications'),tab=document.querySelector('.ds-tab[data-tab="applications"]');
 if(!db||!panel||!tab)return;
 initialized=true;
 $('dsAppRefresh').addEventListener('click',refresh);
 for(const id of ['dsAppLanguage','dsAppDecisionFilter','dsAppSearch']){
  $(id).addEventListener(id==='dsAppSearch'?'input':'change',render);
 }
 $('dsAppList').addEventListener('click',e=>{const b=e.target.closest('[data-app-open]');if(b)open(b.dataset.appOpen)});
 tab.addEventListener('click',()=>{if(!loading&&rows.length===0)refresh()});
 window.addEventListener('adatacore:dataset-studio-ready',()=>{if(location.hash==='#applications')refresh()},{once:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',begin,{once:true});
else begin();
})();