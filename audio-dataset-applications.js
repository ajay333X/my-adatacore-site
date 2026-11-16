(()=>{
'use strict';
const BASE='https://llmhyezgcnbognmmsnzq.supabase.co';
const KEY='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const db=window.supabase?.createClient(BASE,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={hi:'Hindi',bn:'Bengali',ta:'Tamil',ml:'Malayalam',te:'Telugu',mr:'Marathi',kn:'Kannada',gu:'Gujarati',pa:'Punjabi',or:'Odia',as:'Assamese',ur:'Urdu',ne:'Nepali',sa:'Sanskrit',kok:'Konkani',mai:'Maithili',sd:'Sindhi',ks:'Kashmiri',mni:'Manipuri',bo:'Bodo',doi:'Dogri',sat:'Santali'};
const choices={pending:'Review later',selected:'Selected to proceed',permission_needed:'Permission needed',skipped:'Not suitable',imported:'Imported to dataset'};
let rows=[],reviewMap=new Map(),selected=null,detail=null,loading=false,user=null;
function message(value,error=false){$('status').textContent=String(value);$('status').style.color=error?'#b14939':'#136b68'}
function badge(s){return '<span class="badge '+esc(s)+'">'+esc(choices[s]||choices.pending)+'</span>'}
function runtime(v){const seconds=Math.max(0,Math.round(Number(v||0)/1000));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')}
async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data}
async function auth(){
 if(!db){$('gate').textContent='Authentication SDK unavailable. Please reload the page.';return false}
 try{
  const {data:auth,error}=await db.auth.getUser();if(error||!auth?.user){location.replace('/auth');return false}
  user=auth.user;
  const access=await rpc('get_my_admin_access',{});
  if(!access?.is_super_admin)throw Error('This private tool is available only to active Super Admins.');
  $('gate').remove();$('screen').hidden=false;return true;
 }catch(e){$('gate').textContent=e.message;return false}
}
async function load(){
 if(loading)return;loading=true;$('refresh').disabled=true;message('Loading private application recordings…');
 try{
  const [data,res]=await Promise.all([
   rpc('admin_application_queue_v2',{p_status:null,p_track:'voice_acting',p_language:null,p_query:null}),
   db.from('dataset_studio_applicant_reviews').select('*').limit(1500)
  ]);
  if(res.error)throw Error(res.error.message);
  reviewMap=new Map((res.data||[]).map(r=>[r.application_id,r]));
  rows=(Array.isArray(data)?data:[]).filter(r=>r.track==='voice_acting'&&Number(r.sample_size)>0&&Object.hasOwn(names,String(r.language_code||'').split('-')[0].toLowerCase()));
  const previous=$('language').value;
  const langs=[...new Set(rows.map(r=>r.language_code))].sort();
  $('language').innerHTML='<option value="all">All languages</option>'+langs.map(code=>'<option value="'+esc(code)+'">'+esc(names[code.split('-')[0]]||code)+' ('+esc(code)+')</option>').join('');
  $('language').value=langs.includes(previous)?previous:'all';
  render();
  message('Found '+rows.length+' private Indic-language application recordings. None are copied without separate reuse permission.');
 }catch(e){message('Unable to load applicant audio: '+e.message,true);$('rows').innerHTML='<div class="empty">Application recordings could not be loaded.</div>'}
 finally{loading=false;$('refresh').disabled=false}
}
function render(){
 const statusCount=s=>rows.filter(r=>(reviewMap.get(r.id)?.decision||'pending')===s).length;
 $('stats').innerHTML=[['Audio submissions',rows.length],['Selected to proceed',statusCount('selected')],['Permission needed',statusCount('permission_needed')],['Dataset imports',statusCount('imported')]].map(([label,count])=>'<div class="card stat"><span>'+esc(label)+'</span><strong>'+count+'</strong></div>').join('');
 const filter=$('filter').value,language=$('language').value,search=$('search').value.trim().toLowerCase();
 const eligible=rows.filter(r=>{
  const state=reviewMap.get(r.id)?.decision||'pending';
  return (filter==='all'||state===filter)&&(language==='all'||r.language_code===language)&&
   (!search||[r.name,r.id,r.language_label,r.language_code].some(x=>String(x||'').toLowerCase().includes(search)));
 });
 $('rows').innerHTML=eligible.length?eligible.map(r=>{
  const state=reviewMap.get(r.id)?.decision||'pending';
  return '<button type="button" data-open="'+esc(r.id)+'" class="item '+(selected===r.id?'active':'')+'"><div class="row"><strong>'+esc(r.name||'Voice applicant')+'</strong>'+badge(state)+'</div><small>'+esc(r.language_label||r.language_code)+' · '+runtime(r.sample_size)+' · Hiring: '+esc(r.status)+'</small><small>ID '+esc(r.id.slice(0,8))+'</small></button>';
 }).join(''):'<div class="empty"><strong>No matching audio</strong>Try another filter or search.</div>';
}
async function open(id){
 const row=rows.find(r=>r.id===id);if(!row)return;
 selected=id;render();
 const box=$('details');box.innerHTML='<div class="empty">Loading private recording…</div>';
 try{
  const result=await rpc('admin_application_detail',{p_application_id:id});
  if(selected!==id)return;
  const a=result.application||{},p=result.profile||{},v=reviewMap.get(id)||{};
  detail=a;
  const options=Object.entries(choices).filter(([k])=>k!=='imported'||v.decision==='imported').map(([k,name])=>'<option value="'+k+'" '+((v.decision||'pending')===k?'selected':'')+'>'+esc(name)+'</option>').join('');
  box.innerHTML='<div class="tone"><strong>'+esc(p.name||row.name||'Voice applicant')+'</strong><br>'+
   esc(a.language_label||row.language_label)+' · '+runtime(a.recording_duration_ms)+' · Original hiring status: '+esc(a.status)+'</div>'+
   '<h3 class="sectiontitle">Submitted voice recording</h3><div id="audioPreview" class="note">Preparing secure playback…</div>'+
   '<div class="note">This may be a scripted audition rather than spontaneous conversation. Please listen before deciding suitability.</div>'+
   '<div class="divider"></div><label class="field">Dataset suitability decision<select id="decision" '+(v.decision==='imported'?'disabled':'')+'>'+options+'</select></label>'+
   '<label class="field" style="margin-top:15px">Reviewer notes<textarea id="reviewNote" maxlength="3000" placeholder="Audio clarity, accent, noise, speaker variety…">'+esc(v.reviewer_note||'')+'</textarea></label>'+
   '<div class="divider"></div><div class="sectiontitle">Permission to reuse applicant audio</div>'+
   '<p class="note">Private hiring consent is not enough. A dataset or customer demonstration needs separate, explicit permission from the speaker.</p>'+
   '<label class="consent"><input id="consent" type="checkbox" '+(v.explicit_consent_confirmed?'checked':'')+'><span>I have verified explicit permission from this applicant to reuse this recording in dataset production and customer demonstrations.</span></label>'+
   '<label class="field">Permission evidence / reference<textarea id="evidence" maxlength="1000" placeholder="Dated consent agreement or permission request reference (minimum 12 characters for approved reuse)">'+esc(v.consent_evidence||'')+'</textarea></label>'+
   '<div class="actions"><button type="button" class="btn primary" id="saveReview" '+(v.decision==='imported'?'disabled':'')+'>Save selection</button>'+
   '<button type="button" class="btn" id="importRecording" '+(v.decision==='selected'&&v.explicit_consent_confirmed&&String(v.consent_evidence||'').trim().length>=12?'':'disabled')+'>Import approved recording →</button>'+
   '<a class="btn" href="/admin/applications">Hiring review ↗</a></div>'+
   (v.imported_source_id?'<div class="tone" style="margin-top:16px">✓ Previously imported into the private Dataset Studio Source Collector.</div>':'')+
   '<div class="note" style="margin-top:15px">Selections are for dataset sourcing only. They do not approve, reject, or modify the applicant’s hiring application.</div>';
  $('saveReview').addEventListener('click',()=>save(id));
  $('importRecording').addEventListener('click',()=>importAudio(id));
  if(a.recording_bucket==='application_assessments'&&a.recording_path){
   const {data,error}=await db.storage.from('application_assessments').createSignedUrl(a.recording_path,900);
   if(selected!==id)return;
   if(error||!data?.signedUrl){$('audioPreview').textContent='Playback unavailable here. Review this file in Hiring Applications.'}
   else{$('audioPreview').innerHTML='';const player=document.createElement('audio');player.controls=true;player.preload='none';player.className='audio';player.src=data.signedUrl;$('audioPreview').append(player)}
  }else $('audioPreview').textContent='No playable original audio was found.';
 }catch(e){if(selected===id)box.innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
}
async function save(id){
 if(selected!==id)return;
 const decision=$('decision').value,notes=$('reviewNote').value.trim(),consent=$('consent').checked,evidence=$('evidence').value.trim();
 if(consent&&evidence.length<12)return message('Please add a specific, verifiable consent reference with at least 12 characters.',true);
 $('saveReview').disabled=true;
 try{
  const record={application_id:id,reviewed_by:user.id,decision,reviewer_note:notes,explicit_consent_confirmed:consent,consent_evidence:evidence,reviewed_at:new Date().toISOString()};
  const {data,error}=await db.from('dataset_studio_applicant_reviews').upsert(record,{onConflict:'application_id'}).select('*').single();
  if(error)throw Error(error.message);
  reviewMap.set(id,data);render();message('Selection saved. Hiring application unchanged.');
  $('importRecording').disabled=!(data.decision==='selected'&&data.explicit_consent_confirmed&&String(data.consent_evidence||'').trim().length>=12);
 }catch(e){message('Could not save: '+e.message,true)}finally{$('saveReview').disabled=false}
}
async function importAudio(id){
 const row=reviewMap.get(id);
 if(!row||row.decision!=='selected'||row.explicit_consent_confirmed!==true||String(row.consent_evidence||'').trim().length<12)
  return message('First save Selected and document the applicant’s explicit reuse permission.',true);
 const btn=$('importRecording');btn.disabled=true;message('Copying consented audio into private Dataset Studio…');
 try{
  const {data,error}=await db.functions.invoke('dataset-applicant-import',{body:{application_id:id}});
  if(error){let reason=error.message||'Service unavailable';try{const body=await error.context?.json?.();reason=body?.error||reason}catch(_){}throw Error(reason)}
  if(data?.error)throw Error(data.error);
  reviewMap.set(id,{...row,decision:'imported',imported_source_id:data.source_id});render();await open(id);
  message('Audio imported successfully. Open Audio Dataset Studio → Clip editor to extract and transcribe it.');
 }catch(e){message('Import failed: '+e.message,true);btn.disabled=false}
}
async function init(){
 if(!await auth())return;
 $('refresh').addEventListener('click',load);
 $('filter').addEventListener('change',render);
 $('language').addEventListener('change',render);
 $('search').addEventListener('input',render);
 $('rows').addEventListener('click',e=>{const b=e.target.closest('[data-open]');if(b)open(b.dataset.open)});
 await load();
}
window.addEventListener('DOMContentLoaded',init);
})();