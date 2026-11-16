(()=>{
'use strict';
if(window.__adatacoreDatasetStudio)return;window.__adatacoreDatasetStudio=true;
const BASE='https://llmhyezgcnbognmmsnzq.supabase.co';
const KEY='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const BUCKET='adatacore-dataset-studio',LIMIT=25*1024*1024;
const LANGS={hi:'Hindi',bn:'Bengali',ta:'Tamil',ml:'Malayalam',te:'Telugu',mr:'Marathi',kn:'Kannada',gu:'Gujarati',pa:'Punjabi',or:'Odia',as:'Assamese',ur:'Urdu',ne:'Nepali',sa:'Sanskrit',kok:'Konkani',mai:'Maithili',sd:'Sindhi',ks:'Kashmiri',mni:'Manipuri',bo:'Bodo',doi:'Dogri',sat:'Santali'};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleString():'—';
const dt=v=>Math.round(Number(v)||0);
const seconds=v=>dt(v).toString()+'s';
const friendlyBytes=n=>n?((n/1048576).toFixed(1)+' MB'):'—';
const db=window.supabase?.createClient(BASE,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
let currentUser=null,sources=[],clips=[],chosen=null,audioURL='',audioBuffer=null,activeBufferSource=null,loading=false,notifying=null;
let attachmentId=null;
const safeKind=url=>{
 try{const u=new URL(url);if(u.protocol!=='https:')return 'external';
  const h=u.hostname.toLowerCase();
  if(h==='commons.wikimedia.org'||h==='upload.wikimedia.org')return 'commons';
  if(h==='archive.org'||h==='www.archive.org')return 'archive';
  if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(h))return 'youtube';
 }catch(_){}return 'external';
};
const licenseApproved=s=>{const t=((s.license_name||'')+' '+(s.license_url||'')).toLowerCase();
 return !/(by-nc|by-nd|noncommercial|no.derivatives)/.test(t)&&/cc\s*by(?:-sa)?(?:\s|\d|$)|cc\s*0|cc0|public.domain|creativecommons\.org\/(licenses\/by(?:-sa)?\/|publicdomain\/)/.test(t);
};
function toast(m,bad=false){
 const el=$('notice');el.textContent=String(m);el.className='ds-toast show'+(bad?' error':'');
 clearTimeout(notifying);notifying=setTimeout(()=>el.className='ds-toast',7500);
}
async function api(action,payload={}){
 const {data,error}=await db.functions.invoke('dataset-studio',{body:Object.assign({action},payload)});
 if(error){
  let message=error.message||'Service request failed.';
  if(error.context && typeof error.context.json==='function'){try{const body=await error.context.json();message=body.error||message}catch(_){}}
  throw Error(message);
 }
 if(data?.error)throw Error(data.error);
 return data;
}
async function checkAccess(){
 if(!db){$('accessGate').textContent='Required authentication library could not load. Reload the page.';return}
 try {
  const {data:{user},error}=await db.auth.getUser();if(error||!user){location.replace('/auth');return}
  const {data:permission,error:pError}=await db.rpc('get_my_admin_access');
  if(pError||!permission?.allowed||!permission?.is_super_admin){
   $('accessGate').innerHTML='<strong>Super Admin access required</strong><p>This private tool is available only to active Adatacore super administrators.</p><a class="ds-btn" href="/admin">Return to Admin</a>';return;
  }
  currentUser=user;
  $('accessGate').remove();$('app').hidden=false;
  bind();initLangs();await load();const initial=location.hash.replace(/^#/,'');
  if(['sources','editor','library','overview'].includes(initial))switchTab(initial);
 }catch(e){$('accessGate').textContent='Admin access check failed: '+e.message}
}
function initLangs(){
 for(const id of ['batchLang','uploadLang','sourceLangFilter','clipLangFilter']){
  const s=$(id);let list=Object.entries(LANGS);
  s.innerHTML=(id.endsWith('Filter')?'<option value="all">All languages</option>':'')+list.map(([code,name])=>'<option value="'+code+'">'+esc(name)+'</option>').join('');
  if(!id.endsWith('Filter'))s.value='hi';
 }
}
function switchTab(tab){
 document.querySelectorAll('.ds-tab').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));
 document.querySelectorAll('.ds-view').forEach(el=>el.classList.toggle('active',el.id==='view-'+tab));
 location.hash=tab;
 if(tab==='editor')renderEditorSources();
 if(tab==='library')renderClips();
 if(tab==='overview')renderStats();
}
async function load(){
 if(loading)return;loading=true;$('refreshBtn').disabled=true;
 try {
  const [a,b]=await Promise.all([
   db.from('dataset_studio_sources').select('*').order('created_at',{ascending:false}).limit(1000),
   db.from('dataset_studio_clips').select('*').order('created_at',{ascending:false}).limit(2000)
  ]);
  if(a.error)throw a.error;if(b.error)throw b.error;
  sources=a.data||[];clips=b.data||[];
  renderSources();renderEditorSources();renderClips();renderStats();
 }catch(e){toast('Unable to load dataset: '+e.message,true)}
 finally{loading=false;$('refreshBtn').disabled=false}
}
function statusBadge(s){
 const status=s.status||'queued';
 const cls=['downloaded','uploaded'].includes(status)?'good':status==='error'||status==='unsupported'?'bad':'warn';
 return '<span class="ds-badge '+cls+'">'+esc(status)+'</span>';
}
function sourceActions(s){
 let row='';
 if(['queued','error','inspected','unsupported'].includes(s.status)&&['commons','archive'].includes(s.source_kind)){
  row+='<button class="ds-btn ds-btn-small" data-source-action="inspect" data-id="'+s.id+'">Inspect license</button>';
 }
 if(s.status==='inspected'){
  row+='<button class="ds-btn ds-btn-small ds-btn-primary" data-source-action="download" data-id="'+s.id+'" '+(!s.rights_confirmed||!licenseApproved(s)?'disabled title="Verify rights and an eligible license first"':'')+'>↓ Download source</button>';
 }
 if(['downloaded','uploaded'].includes(s.status))row+='<button class="ds-btn ds-btn-small ds-btn-primary" data-source-action="editor" data-id="'+s.id+'">Open clip editor →</button>';
 if(!['downloaded','uploaded'].includes(s.status))row+='<button class="ds-btn ds-btn-small" data-source-action="attach" data-id="'+s.id+'">Attach authorized audio</button>';
 return row;
}
function renderSources(){
 const filter=$('sourceLangFilter').value;
 const list=sources.filter(s=>filter==='all'||s.language===filter);
 $('sources').innerHTML=list.length?list.map(s=>{
  const link=s.source_url&&s.source_url.startsWith('https://')?'<a class="ds-link" target="_blank" rel="noopener noreferrer" href="'+esc(s.source_url)+'">Original source ↗</a>':'';
  const ready=['downloaded','uploaded'].includes(s.status);
  return '<div class="ds-source"><div class="ds-source-head"><div><strong>'+esc(s.title)+'</strong><div class="ds-meta">'+esc(LANGS[s.language]||s.language)+' · '+esc(s.source_kind)+' · '+date(s.created_at)+(s.source_bytes?' · '+friendlyBytes(s.source_bytes):'')+'</div></div>'+statusBadge(s)+'</div>'+
   '<div class="ds-meta">Creator: '+esc(s.author||'Not recorded')+' · License: '+esc(s.license_name||'Not confirmed')+(s.license_url?.startsWith('https://')?'<br><a class="ds-link" target="_blank" rel="noopener noreferrer" href="'+esc(s.license_url)+'">License terms ↗</a>':'')+'</div>'+
   (s.last_error?'<div class="ds-meta" style="color:#a45440">ⓘ '+esc(s.last_error)+'</div>':'')+link+
   (!ready?'<label class="ds-check"><input type="checkbox" data-source-rights="'+s.id+'" '+(s.rights_confirmed?'checked':'')+'>I verified the rights to copy and process this recording.</label>':'')+
   '<div class="ds-actions">'+sourceActions(s)+'</div></div>';
 }).join(''):'<div class="ds-empty"><strong>No sources in this view</strong>Paste recording links or upload a permitted audio file to get started.</div>';
}
function renderEditorSources(){
 const ready=sources.filter(s=>s.storage_path&&['downloaded','uploaded'].includes(s.status));
 $('editorSources').innerHTML=ready.length?ready.map(s=>'<button type="button" class="ds-source '+(chosen?.id===s.id?'selected':'')+'" style="text-align:left;width:100%" data-editor-source="'+s.id+'"><strong>'+esc(s.title)+'</strong><div class="ds-meta">'+esc(LANGS[s.language]||s.language)+' · '+friendlyBytes(s.source_bytes)+' · '+clips.filter(c=>c.source_id===s.id).length+' clips</div></button>').join(''):'<div class="ds-empty"><strong>No ready recordings</strong>Download or upload a source first.</div>';
}
function getClipLink(s){return s?.source_url&&s.source_url.startsWith('https://')?s.source_url:''}
function renderClips(){
 const lang=$('clipLangFilter').value;const list=clips.filter(c=>lang==='all'||c.language===lang);
 $('clips').innerHTML=list.length?list.map(c=>{
  const s=sources.find(x=>x.id===c.source_id);
  const status=c.transcript_status||'not_started';
  const badge=status==='human_verified'?'good':status==='not_started'?'warn':'';
  const kind=status==='human_verified'?'Human verified':status==='ai_draft'?'AI draft':status==='edited'?'Needs verification':'No transcript';
  return '<article class="ds-card ds-clip" data-clip-card="'+c.id+'"><div class="ds-clip-head"><div><h3>'+esc(s?.title||'Archived source')+'</h3><div class="ds-meta">'+esc(LANGS[c.language]||c.language)+' · '+(c.duration_ms/1000).toFixed(1)+' seconds · Source '+(c.start_ms/1000).toFixed(1)+'–'+(c.end_ms/1000).toFixed(1)+'s · '+date(c.created_at)+'</div></div><span class="ds-badge '+badge+'">'+esc(kind)+'</span></div>'+
  '<div class="ds-actions"><button class="ds-btn ds-btn-small" data-clip-action="play" data-id="'+c.id+'">▶ Listen</button><button class="ds-btn ds-btn-small" data-clip-action="download" data-id="'+c.id+'">↓ WAV</button><button class="ds-btn ds-btn-small" data-clip-action="transcribe" data-id="'+c.id+'">✦ Generate AI draft</button><button class="ds-btn ds-btn-small" data-clip-action="metadata" data-id="'+c.id+'">↓ JSON</button></div>'+
  '<div data-audio-host="'+c.id+'"></div><div class="ds-heading">Transcript</div><textarea data-transcript="'+c.id+'" spellcheck="true" placeholder="Generate an AI draft or type a verified transcript manually.">'+esc(c.transcript||'')+'</textarea>'+
  '<div class="ds-meta">Model: '+esc(c.model_name||'—')+' · '+esc(c.transcript_segments?.length?c.transcript_segments.length+' timestamped segments available in JSON':'No timed segments')+
  (s?.license_name?' · License: '+esc(s.license_name):'')+'</div>'+
  '<label class="ds-check"><input type="checkbox" data-reviewed="'+c.id+'">I have listened to this clip and checked the transcript against the audio.</label>'+
  '<div class="ds-row"><button class="ds-btn ds-btn-small" data-clip-action="save" data-id="'+c.id+'">Save transcript edits</button><button class="ds-btn ds-btn-small ds-btn-primary" data-clip-action="verify" data-id="'+c.id+'">Mark human verified</button></div></article>';
 }).join(''):'<div class="ds-empty"><strong>No extracted clips yet</strong>Open the clip editor, select a source, and save the first segment.</div>';
}
function renderStats(){
 const total=sources.length,ready=sources.filter(s=>s.storage_path).length,verified=clips.filter(c=>c.transcript_status==='human_verified').length;
 const minutes=clips.reduce((n,c)=>n+c.duration_ms/60000,0);
 const stats=[['Source records',total,'Imported or linked recordings'],['Ready audio',ready,'Downloaded or uploaded'],['Speech clips',clips.length,minutes.toFixed(1)+' total minutes'],['Human verified',verified,'Reviewed transcripts']];
 $('stats').innerHTML=stats.map(s=>'<article class="ds-card ds-stat"><small>'+esc(s[0])+'</small><strong>'+s[1]+'</strong><span>'+esc(s[2])+'</span></article>').join('');
 const present=Object.entries(LANGS).filter(([id])=>sources.some(s=>s.language===id)||clips.some(c=>c.language===id));
 $('languageSummary').innerHTML=present.length?present.map(([id,name])=>'<div class="ds-lang">'+esc(name)+' · '+clips.filter(c=>c.language===id).length+' clips</div>').join(''):'<p class="ds-note">No language collection started yet.</p>';
}
async function addSources(){
 const raw=$('sourceLinks').value.trim();
 const links=[...new Set((raw.match(/https?:\/\/[^\s<>"']+/gi)||[]).map(s=>s.replace(/[),.;]+$/,'')))].filter(x=>x.startsWith('https://'));
 if(!links.length)return toast('Paste at least one valid HTTPS link.',true);
 if(links.length>60)return toast('Limit each batch to 60 links.',true);
 const label=$('batchLabel').value.trim().slice(0,80);
 const records=links.map(url=>{const kind=safeKind(url);const blocked=kind==='youtube'||kind==='external';return {source_url:url,source_kind:kind,language:$('batchLang').value,title:label||'Uninspected recording',created_by:currentUser.id,status:blocked?'unsupported':'queued',last_error:blocked?(kind==='youtube'?'YouTube is reference-only: upload an authorized local recording.':'Automated download is restricted to Commons and Archive; upload authorized audio.') : null,metadata:{collection_label:label||'Indic speech collection'}}});
 $('addSources').disabled=true;$('addStatus').textContent='Saving source records…';
 try {
  const {data,error}=await db.from('dataset_studio_sources').insert(records).select('id,source_kind');
  if(error)throw error;
  $('sourceLinks').value='';toast('Added '+data.length+' links. Inspecting compatible sources…');
  await load();
  let done=0;
  for(const x of data){if(['commons','archive'].includes(x.source_kind)){try{await api('inspect',{source_id:x.id})}catch(e){toast('One source needs attention: '+e.message,true)}done++}
    $('addStatus').textContent='Inspected '+done+' / '+data.length;
  }
  await load();$('addStatus').textContent='Source batch complete';
 }catch(e){toast('Failed to import links: '+e.message,true)}
 finally{$('addSources').disabled=false}
}
async function rightsToggle(id,checked){
 const {error}=await db.from('dataset_studio_sources').update({rights_confirmed:checked}).eq('id',id);
 if(error){toast(error.message,true);return}const s=sources.find(s=>s.id===id);if(s)s.rights_confirmed=checked;renderSources();
}
async function sourceAction(action,id){
 const s=sources.find(x=>x.id===id);if(!s)return;
 if(action==='editor'){switchTab('editor');await selectSource(id);return}
 if(action==='attach'){
  if(!s.rights_confirmed)return toast('First confirm that you have rights to use this recording.',true);
  attachmentId=id;attachmentInput.value='';attachmentInput.click();return;
 }
 try {
  if(action==='inspect') {toast('Checking source metadata…');await api('inspect',{source_id:id});}
  else if(action==='download'){toast('Downloading permitted source recording…');await api('download',{source_id:id});}
  await load();toast(action==='inspect'?'Source metadata inspected. Review licensing before download.':'Audio securely downloaded and ready for editing.');
 }catch(e){toast(e.message,true);await load()}
}
async function inspectAll(){
 const target=sources.filter(s=>['commons','archive'].includes(s.source_kind)&&['queued','error'].includes(s.status)).slice(0,60);
 if(!target.length)return toast('No queued supported sources to inspect.');
 $('inspectAll').disabled=true;let ok=0;
 for(const s of target){try{await api('inspect',{source_id:s.id});ok++}catch(e){toast('Could not inspect '+s.title+': '+e.message,true)}}
 await load();toast('Inspected '+ok+' of '+target.length+' queued sources.');$('inspectAll').disabled=false;
}
async function downloadApproved(){
 const candidates=sources.filter(s=>s.status==='inspected'&&s.rights_confirmed&&licenseApproved(s)).slice(0,25);
 if(!candidates.length)return toast('No licensed, rights-confirmed sources are ready for download.',true);
 $('downloadApproved').disabled=true;let ok=0;
 for(const s of candidates){try{await api('download',{source_id:s.id});ok++}catch(e){toast('Download needs attention: '+s.title+' — '+e.message,true)}}
 await load();$('downloadApproved').disabled=false;toast('Downloaded '+ok+' / '+candidates.length+' approved source files.');
}
const attachmentInput=document.createElement('input');attachmentInput.type='file';attachmentInput.accept='audio/*,.ogg,.wav,.mp3,.opus,.webm,.m4a,.flac';attachmentInput.hidden=true;document.body.append(attachmentInput);
async function fileUpload(file,existing=null){
 if(!file)throw Error('Choose an audio file.');
 if(file.size<100||file.size>LIMIT)throw Error('Audio file must be between 100 bytes and 25 MB.');
 const extension=(file.name.match(/\.(mp3|m4a|wav|ogg|oga|opus|webm|flac|mp4|aac)$/i)||[])[1]?.toLowerCase();
 if(!extension)throw Error('Unsupported audio format. Try MP3, WAV, OGG, FLAC, or M4A.');
 const types={mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/opus',webm:'audio/webm',flac:'audio/flac',mp4:'audio/mp4',aac:'audio/aac'};
 let item=existing;
 if(!item){
  const {data,error}=await db.from('dataset_studio_sources').insert({created_by:currentUser.id,source_kind:'upload',language:$('uploadLang').value,title:file.name,status:'queued',rights_confirmed:true,author:$('uploadAuthor').value.trim(),license_name:$('uploadLicense').value.trim()||'Permission confirmed by admin',metadata:{uploaded_filename:file.name}}).select('*').single();
  if(error)throw error;item=data;
 }
 const path=currentUser.id+'/'+item.id+'/original.'+extension;
 const {error:e}=await db.storage.from(BUCKET).upload(path,file,{upsert:true,contentType:types[extension]});
 if(e)throw e;
 const {error}=await db.from('dataset_studio_sources').update({storage_path:path,status:'uploaded',source_bytes:file.size,source_mime:types[extension],last_error:null}).eq('id',item.id);
 if(error)throw error;
 return item;
}
async function uploadSource(){
 if(!$('uploadRights').checked)return toast('Confirm reuse rights before uploading audio.',true);
 const file=$('directFile').files?.[0];if(!file)return toast('Choose an audio file.',true);
 $('uploadSourceBtn').disabled=true;
 try {await fileUpload(file);$('directFile').value='';$('uploadRights').checked=false;await load();toast('Authorized audio added. Open the clip editor to extract audio.')}
 catch(e){toast('Upload failed: '+e.message,true)}finally{$('uploadSourceBtn').disabled=false}
}
async function attachAudio(file){
 const s=sources.find(x=>x.id===attachmentId);attachmentId=null;
 if(!s||!s.rights_confirmed)return toast('Source access or rights confirmation missing.',true);
 try{await fileUpload(file,s);await load();toast('Authorized local file attached to the source record.')}
 catch(e){toast('Upload failed: '+e.message,true)}
}
async function signed(path){
 const {data,error}=await db.storage.from(BUCKET).createSignedUrl(path,60*15);
 if(error||!data?.signedUrl)throw Error(error?.message||'Secure audio link unavailable.');
 return data.signedUrl;
}
async function selectSource(id){
 const s=sources.find(x=>x.id===id);
 if(!s?.storage_path)return toast('This recording is not ready.',true);
 chosen=s;audioBuffer=null;audioURL='';$('decodeInfo').textContent='';
 $('suggestClips').disabled=true;$('suggestionList').innerHTML='';
 $('editorEmpty').classList.add('ds-hidden');$('editorBody').classList.remove('ds-hidden');
 $('editorTitle').textContent=s.title;$('editorMeta').textContent=(LANGS[s.language]||s.language)+' · '+friendlyBytes(s.source_bytes)+' · '+(s.license_name||'Unspecified license');
 const player=$('sourcePlayer');player.pause();player.removeAttribute('src');player.load();
 $('clipStart').value='0';$('clipEnd').value='60';updateDuration();
 try {
  audioURL=await signed(s.storage_path);player.src=audioURL;
  player.onloadedmetadata=()=>{const dur=player.duration;if(Number.isFinite(dur)){if(dur<15)toast('Recording is shorter than the minimum clip length.',true);$('clipEnd').value=Math.min(60,dur).toFixed(1);updateDuration()}};
 }catch(e){toast('Could not load source audio: '+e.message,true)}
 renderEditorSources();
}
async function decodeAudio(){
 if(!chosen||!audioURL)throw Error('Choose a recording first.');
 if(audioBuffer)return audioBuffer;
 $('loadWaveform').disabled=true;$('decodeInfo').textContent='Decoding audio in browser…';
 try{
  const response=await fetch(audioURL);
  if(!response.ok)throw Error('Source audio could not be loaded.');
  const bytes=await response.arrayBuffer();
  const context=new (window.AudioContext||window.webkitAudioContext)();
  try{audioBuffer=await context.decodeAudioData(bytes.slice(0))}finally{await context.close()}
  if(audioBuffer.duration<15)throw Error('This recording is too short.');
  $('suggestClips').disabled=false;
  $('decodeInfo').textContent='Decoded '+audioBuffer.duration.toFixed(1)+' seconds · '+audioBuffer.sampleRate+' Hz';
  return audioBuffer;
 }catch(e){audioBuffer=null;const message='Browser cannot decode this format. Try an MP3 or WAV authorized upload. '+e.message;$('decodeInfo').textContent=message;throw Error(message)}
 finally{$('loadWaveform').disabled=false}
}
function updateDuration(){
 const start=Number($('clipStart').value),end=Number($('clipEnd').value);
 $('clipDuration').textContent=Number.isFinite(end-start)?(end-start).toFixed(1)+' seconds selected':'Invalid range';
}
function chooseRange(start,end){
 $('clipStart').value=start.toFixed(1);$('clipEnd').value=end.toFixed(1);updateDuration();
}
function suggestClips(){
 if(!audioBuffer)return toast('Analyze the source recording first.',true);
 const dur=audioBuffer.duration,windowSize=Math.min(60,dur);
 const samples=audioBuffer.getChannelData(0),fps=audioBuffer.sampleRate;
 const energy=[];const hop=Math.max(1,Math.floor(.5*fps));
 for(let offset=0;offset<samples.length;offset+=hop){
  let total=0,count=0;for(let j=offset;j<Math.min(samples.length,offset+hop);j+=64){total+=samples[j]*samples[j];count++}
  energy.push(Math.sqrt(total/Math.max(count,1)));
 }
 const sorted=[...energy].sort((a,b)=>a-b);const quiet=sorted[Math.floor(sorted.length*.25)]||0;
 const speechThreshold=Math.max(.005,quiet*2.3);const ranked=[];
 for(let start=0;start+Math.min(30,windowSize)<=dur;start+=10){
  const end=Math.min(dur,start+windowSize),a=Math.floor(start*2),b=Math.floor(end*2);
  const portion=energy.slice(a,b);const active=portion.filter(e=>e>speechThreshold).length/Math.max(1,portion.length);
  const avg=portion.reduce((x,e)=>x+Math.min(e,.4),0)/Math.max(1,portion.length);
  ranked.push({start,end,score:active*.75+Math.min(1,avg*7)*.25});
 }
 ranked.sort((a,b)=>b.score-a.score);const chosenRanges=[];
 for(const candidate of ranked){if(chosenRanges.every(x=>Math.abs(x.start-candidate.start)>=windowSize*.85)){chosenRanges.push(candidate);if(chosenRanges.length>=4)break}}
 $('suggestionList').innerHTML=chosenRanges.map(x=>'<button class="ds-pill" data-suggestion-start="'+x.start.toFixed(1)+'" data-suggestion-end="'+x.end.toFixed(1)+'">'+x.start.toFixed(0)+'–'+x.end.toFixed(0)+'s · energy '+Math.round(x.score*100)+'</button>').join('');
 toast('Suggested speech-rich ranges using audio energy. Listen to verify that real conversation is present.');
}
function previewClip(){
 const start=Number($('clipStart').value),end=Number($('clipEnd').value);
 const player=$('sourcePlayer');
 if(!(start>=0&&end>start))return toast('Choose a valid start and end time.',true);
 if(Number.isFinite(player.duration)&&end>player.duration+.5)return toast('End is after recording duration.',true);
 player.currentTime=start;player.play().catch(e=>toast('Playback failed: '+e.message,true));
 player.ontimeupdate=()=>{if(player.currentTime>=end){player.pause();player.ontimeupdate=null}};
}
function pcmWav(buffer){
 const data=buffer.getChannelData(0),bytes=new ArrayBuffer(44+data.length*2),v=new DataView(bytes);
 const write=(pos,str)=>{for(let i=0;i<str.length;i++)v.setUint8(pos+i,str.charCodeAt(i))};
 write(0,'RIFF');v.setUint32(4,36+data.length*2,true);write(8,'WAVE');write(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);write(36,'data');v.setUint32(40,data.length*2,true);
 for(let i=0;i<data.length;i++){const x=Math.max(-1,Math.min(1,data[i]));v.setInt16(44+i*2,x<0?x*32768:x*32767,true)}
 return new Blob([bytes],{type:'audio/wav'});
}
async function createClip(){
 if(!chosen)return toast('Choose a source recording.',true);
 const start=Number($('clipStart').value),end=Number($('clipEnd').value),duration=end-start;
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||duration<15||duration>120)return toast('Clips must be between 15 and 120 seconds and have valid boundaries.',true);
 $('createClip').disabled=true;
 try {
  const original=await decodeAudio();
  if(end>original.duration+.05)throw Error('End time exceeds source audio duration.');
  const frames=Math.round(duration*16000),offline=new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(1,frames,16000);
  const node=offline.createBufferSource();node.buffer=original;node.connect(offline.destination);node.start(0,start,duration);
  $('clipDuration').textContent='Rendering clip locally…';
  const rendered=await offline.startRendering(),blob=pcmWav(rendered),id=crypto.randomUUID();
  const path=currentUser.id+'/clips/'+id+'.wav';
  const {error:e}=await db.storage.from(BUCKET).upload(path,blob,{contentType:'audio/wav',upsert:false});if(e)throw e;
  const {error}=await db.from('dataset_studio_clips').insert({id,source_id:chosen.id,created_by:currentUser.id,language:chosen.language,start_ms:Math.round(start*1000),end_ms:Math.round(end*1000),duration_ms:Math.round(duration*1000),storage_path:path});
  if(error){await db.storage.from(BUCKET).remove([path]);throw error}
  await load();toast('Saved '+duration.toFixed(1)+'-second audio clip. Transcription can now be generated.');
 }catch(e){toast('Clip extraction failed: '+e.message,true)}
 finally{$('createClip').disabled=false;updateDuration()}
}
async function clipAction(action,id){
 const c=clips.find(x=>x.id===id);if(!c)return;
 const card=document.querySelector('[data-clip-card="'+id+'"]');
 try{
  if(action==='download'||action==='play'){
   const url=await signed(c.storage_path);
   if(action==='download'){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.click()}
   else{const host=card?.querySelector('[data-audio-host]');if(host){host.innerHTML='';const audio=document.createElement('audio');audio.src=url;audio.controls=true;audio.autoplay=true;audio.className='ds-audio';host.append(audio)}}
   return;
  }
  if(action==='metadata') {downloadBlob(JSON.stringify(clipRecord(c),null,2),'adatacore-'+id+'.json','application/json');return}
  if(action==='transcribe'){
   toast('Generating AI draft. It will remain unverified until manually reviewed.');
   await api('transcribe',{clip_id:id});await load();toast('AI transcript draft generated. Please listen and correct it before verification.');return;
  }
  const transcript=card?.querySelector('[data-transcript]')?.value.trim()||'';
  if(!transcript)return toast('Transcript cannot be empty.',true);
  if(action==='verify'&&!card?.querySelector('[data-reviewed]')?.checked)return toast('Please listen to the recording and confirm your review before verifying.',true);
  const state=action==='verify'?'human_verified':'edited';
  const {error}=await db.from('dataset_studio_clips').update({transcript,transcript_status:state,updated_at:new Date().toISOString()}).eq('id',id);
  if(error)throw error;await load();toast(state==='human_verified'?'Human verification recorded.':'Transcript saved as an edited draft.');
 }catch(e){toast('Clip action failed: '+e.message,true)}
}
function clipRecord(c){
 const s=sources.find(x=>x.id===c.source_id)||{};
 return {clip_id:c.id,language:c.language,language_name:LANGS[c.language]||c.language,duration_seconds:c.duration_ms/1000,
  source_id:c.source_id,source_url:s.source_url||null,source_title:s.title||null,source_author:s.author||null,
  source_license:s.license_name||null,source_license_url:s.license_url||null,
  clip_start_seconds:c.start_ms/1000,clip_end_seconds:c.end_ms/1000,
  audio_storage:'private',audio_path:c.storage_path,transcript:c.transcript,
  transcript_segments:c.transcript_segments,transcript_status:c.transcript_status,ai_model:c.model_name,
  created_at:c.created_at,format:'16kHz mono PCM WAV',provenance_note:'Original human recording; AI drafts are not human verification.'};
}
function downloadBlob(content,name,type){
 const blob=new Blob([content],{type:type+';charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function exportDataset(type){
 const items=clips.filter(c=>$('clipLangFilter').value==='all'||c.language===$('clipLangFilter').value).map(clipRecord);
 if(!items.length)return toast('No matching clips to export.',true);
 if(type==='json')return downloadBlob(JSON.stringify({dataset:'Adatacore Indic Audio Collection',exported_at:new Date().toISOString(),count:items.length,clips:items},null,2),'adatacore-audio-dataset.json','application/json');
 const cols=['clip_id','language','duration_seconds','source_title','source_url','source_author','source_license','source_license_url','clip_start_seconds','clip_end_seconds','transcript','transcript_status','ai_model','audio_path'];
 const csv=[cols.join(',')].concat(items.map(row=>cols.map(k=>'"'+String(row[k]??'').replace(/"/g,'""')+'"').join(','))).join('\r\n');
 downloadBlob('\ufeff'+csv,'adatacore-audio-dataset.csv','text/csv');
}
function bind(){
 document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>switchTab(el.dataset.tab)));
 $('refreshBtn').addEventListener('click',load);
 $('addSources').addEventListener('click',addSources);
 $('uploadSourceBtn').addEventListener('click',uploadSource);
 $('inspectAll').addEventListener('click',inspectAll);
 $('downloadApproved').addEventListener('click',downloadApproved);
 $('sourceLangFilter').addEventListener('change',renderSources);
 $('clipLangFilter').addEventListener('change',renderClips);
 $('exportCSV').addEventListener('click',()=>exportDataset('csv'));
 $('exportJSON').addEventListener('click',()=>exportDataset('json'));
 $('loadWaveform').addEventListener('click',()=>decodeAudio().catch(e=>toast(e.message,true)));
 $('suggestClips').addEventListener('click',suggestClips);
 $('clipStart').addEventListener('input',updateDuration);$('clipEnd').addEventListener('input',updateDuration);
 $('previewClip').addEventListener('click',previewClip);
 $('createClip').addEventListener('click',createClip);
 attachmentInput.addEventListener('change',()=>{if(attachmentInput.files?.[0])attachAudio(attachmentInput.files[0])});
 $('sources').addEventListener('change',e=>{const node=e.target.closest('[data-source-rights]');if(node)rightsToggle(node.dataset.sourceRights,node.checked)});
 $('sources').addEventListener('click',e=>{const node=e.target.closest('[data-source-action]');if(node)sourceAction(node.dataset.sourceAction,node.dataset.id)});
 $('editorSources').addEventListener('click',e=>{const node=e.target.closest('[data-editor-source]');if(node)selectSource(node.dataset.editorSource)});
 $('suggestionList').addEventListener('click',e=>{const node=e.target.closest('[data-suggestion-start]');if(node)chooseRange(Number(node.dataset.suggestionStart),Number(node.dataset.suggestionEnd))});
 $('clips').addEventListener('click',e=>{const node=e.target.closest('[data-clip-action]');if(node)clipAction(node.dataset.clipAction,node.dataset.id)});
}
window.addEventListener('DOMContentLoaded',checkAccess);
})();