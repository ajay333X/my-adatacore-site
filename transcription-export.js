(()=>{'use strict';
const SUPABASE_URL='https://llmhyezgcnbognmmsnzq.supabase.co';
const SUPABASE_KEY='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const AUDIO_LINK_SECONDS=7*24*60*60;
const PAGE_SIZE=100;
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
const asArray=value=>Array.isArray(value)?value:[];
const clean=value=>value==null?'':String(value);
const iso=value=>value?new Date(value).toISOString():'';
const excelText=value=>{const text=clean(value);return text.length<=32000?text:text.slice(0,31940)+'… [truncated; see segment-level sheets]'};
const safeName=value=>clean(value||'Transcription').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'Transcription';
const fmtMs=value=>{const ms=Number(value)||0;const sec=Math.max(0,Math.floor(ms/1000));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`};
const sortSegments=segments=>[...asArray(segments)].sort((a,b)=>(Number(a.segment_index??a.start_ms)||0)-(Number(b.segment_index??b.start_ms)||0));
const transcript=segments=>excelText(sortSegments(segments).map(s=>clean(s.transcript).trim()).filter(Boolean).join(' '));
const latestAction=(history,action)=>asArray(history).find(h=>h.action===action)||null;
const latestReview=history=>asArray(history).find(h=>h.action==='approve'||h.action==='request_changes')||null;
const currentProjectId=()=>Number(new URLSearchParams(location.search).get('project'))||null;

async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data}
function status(message,error=false){const node=$('notice');if(node){node.textContent=message;node.className='notice '+(error?'error':'success')}}

function installButton(){
 if($('txExportExcel'))return $('txExportExcel');
 const actions=document.querySelector('.tx-project-actions');if(!actions)return null;
 const button=document.createElement('button');button.id='txExportExcel';button.type='button';button.className='button hidden';button.textContent='Export Excel';button.title='Export this transcription project as a multi-sheet .xlsx workbook';
 actions.prepend(button);
 const settings=$('settingsLink');
 const sync=()=>button.classList.toggle('hidden',!currentProjectId()||settings?.classList.contains('hidden'));
 sync();if(settings)new MutationObserver(sync).observe(settings,{attributes:true,attributeFilter:['class','href']});
 window.addEventListener('popstate',sync);return button;
}

async function loadXLSX(){
 if(window.XLSX)return window.XLSX;
 const sources=['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'];
 let last;
 for(const src of sources){try{await new Promise((resolve,reject)=>{const s=document.createElement('script');const timer=setTimeout(()=>{s.remove();reject(Error('Spreadsheet library timed out.'))},15000);s.src=src;s.async=true;s.onload=()=>{clearTimeout(timer);resolve()};s.onerror=()=>{clearTimeout(timer);s.remove();reject(Error('Spreadsheet library could not be loaded.'))};document.head.appendChild(s)});if(window.XLSX)return window.XLSX}catch(e){last=e}}
 throw last||Error('Spreadsheet library is unavailable.');
}

async function fetchProject(projectId,onProgress){
 let offset=0,total=null,project=null,items=[];
 while(total===null||offset<total){
  const page=await rpc('tx_export_project_page',{p_project_id:projectId,p_offset:offset,p_limit:PAGE_SIZE});
  project=project||page.project;total=Number(page.total)||0;const rows=asArray(page.items);items.push(...rows);offset+=rows.length;
  onProgress?.(`Collecting project data… ${items.length}/${total}`);
  if(!rows.length)break;
 }
 return {project,total,items};
}

async function createAudioLinks(items,onProgress){
 const result=new Map(),groups=new Map();
 for(const item of items){if(!item.storage_bucket||!item.recording_path)continue;const bucket=item.storage_bucket;if(!groups.has(bucket))groups.set(bucket,[]);groups.get(bucket).push(item.recording_path)}
 let done=0,total=[...groups.values()].reduce((n,v)=>n+v.length,0);
 for(const [bucket,paths0] of groups){const paths=[...new Set(paths0)];for(let i=0;i<paths.length;i+=100){const chunk=paths.slice(i,i+100);let data,error;({data,error}=await db.storage.from(bucket).createSignedUrls(chunk,AUDIO_LINK_SECONDS));if(error){data=[];for(const path of chunk){const one=await db.storage.from(bucket).createSignedUrl(path,AUDIO_LINK_SECONDS);data.push(one.error?{path,error:one.error}:{path,signedUrl:one.data?.signedUrl})}}
   chunk.forEach((path,index)=>{const row=data?.[index];const url=row?.signedUrl||row?.signedURL||'';if(url)result.set(bucket+'\u0000'+path,url)});done+=chunk.length;onProgress?.(`Creating secure audio links… ${Math.min(done,total)}/${total}`)} }
 return result;
}

function userLabel(user,fallback=''){if(user?.name&&user?.email)return `${user.name} <${user.email}>`;return user?.name||user?.email||user?.uid||fallback||''}
function historyPrevious(history){const rows=asArray(history);return rows.length>1?rows[1]:null}
function latestReadyAI(jobs){return asArray(jobs).find(j=>j.status==='ready')||null}
function linkFor(item,links){return links.get(clean(item.storage_bucket)+'\u0000'+clean(item.recording_path))||''}

function buildRows(project,items,links,expiresAt){
 const main=[],segments=[],historyRows=[],aiRows=[];
 for(const item of items){
  const history=asArray(item.history),l1=latestAction(history,'submit'),review=latestReview(history),approved=latestAction(history,'approve'),previous=historyPrevious(history),ai=latestReadyAI(item.ai_jobs),audioUrl=linkFor(item,links),l1task=item.l1_task||{},l2task=item.l2_task||{};
  main.push({
   'Project ID':project.id,'Project':project.name,'Language':project.language||'',
   'Audio Item ID':item.id,'Audio Module':item.display_name||item.source_original_name||item.recording_path?.split('/').pop()||'',
   'Source Project':item.source_project_title||'','Source Project ID':item.source_project_id??'','Source Folder':item.source_folder||'','Original File Name':item.source_original_name||'',
   'Storage Bucket':item.storage_bucket||'','Storage Path':item.recording_path||'','Audio Link':audioUrl,'Audio Link Expires At':audioUrl?expiresAt:'',
   'Duration (seconds)':Number(item.duration_seconds)||Math.round((Number(item.duration_ms)||0)/1000),'Duration':fmtMs(item.duration_ms||Number(item.duration_seconds)*1000),
   'Status':item.status||'','Queue State':item.queue_state||'','Queue Position':item.queue_position??'','Current Revision':item.revision??'',
   'L1 Task ID':l1task.id??'','L1 Public Task ID':l1task.public_task_id||'','L1 Task Status':l1task.status||'','L1 Assigned To':userLabel(l1task.worker,l1task.assigned_to),'L1 Assigned Email':l1task.worker?.email||l1task.assigned_to||'','L1 Worker UID':l1task.worker?.uid||'',
   'L1 Actual Submitter':userLabel(l1?.actor),'L1 Submitter Email':l1?.actor?.email||'','L1 Submitter UID':l1?.actor?.uid||'','L1 Submitted At':iso(l1?.created_at||item.submitted_at),
   'AI / Initial Draft':transcript(ai?.segments),'AI Model':ai?.model||'','AI Status':ai?.status||'','AI Generated At':iso(ai?.finished_at),
   'Previous Revision #':previous?.revision??'','Previous Revision Action':previous?.action||'','Previous Revision Transcript':transcript(previous?.segments),'Previous Revision Actor':userLabel(previous?.actor),'Previous Revision At':iso(previous?.created_at),
   'L1 Submitted Transcript':transcript(l1?.segments||item.submitted_segments),'Current Working Transcript':transcript(item.current_segments),'Final Approved Transcript':transcript(approved?.segments),
   'L2 Task ID':l2task.id??'','L2 Public Task ID':l2task.public_task_id||'','L2 Task Status':l2task.status||'','L2 Assigned To':userLabel(l2task.worker,l2task.assigned_to),'L2 Assigned Email':l2task.worker?.email||l2task.assigned_to||'','L2 Reviewer UID':l2task.worker?.uid||'',
   'Latest Review Decision':review?.action||'','L2 Actual Reviewer':userLabel(review?.actor),'L2 Reviewer Email':review?.actor?.email||'','L2 Reviewer UID (actual)':review?.actor?.uid||'','L2 Reviewed At':iso(review?.created_at||item.reviewed_at),'Review Feedback':review?.feedback||item.feedback||'',
   'Created At':iso(item.created_at),'Updated At':iso(item.updated_at),'Vaulted At':iso(item.vaulted_at),'Released At':iso(item.released_at),'Archived At':iso(item.archived_at),
   'Chunk Index':item.source_chunk_index??'','Chunk Count':item.source_chunk_count??'','Chunk Start (ms)':item.source_start_ms??'','Chunk End (ms)':item.source_end_ms??'','Split Mode':item.source_split_mode||''
  });
  for(const s of sortSegments(item.current_segments))segments.push({'Project':project.name,'Audio Item ID':item.id,'Audio Module':item.display_name||'','Audio Link':audioUrl,'Segment Index':s.segment_index??'','Speaker ID':s.speaker_id||'','Speaker':s.speaker_label||'','Start (ms)':s.start_ms??'','End (ms)':s.end_ms??'','Start':fmtMs(s.start_ms),'End':fmtMs(s.end_ms),'Transcript':excelText(s.transcript),'Confidence':s.confidence??'','Lint Status':s.lint_status||'','Created At':iso(s.created_at),'Updated At':iso(s.updated_at)});
  for(const h of history)historyRows.push({'Project':project.name,'Audio Item ID':item.id,'Audio Module':item.display_name||'','Audio Link':audioUrl,'Revision':h.revision??'','Action':h.action||'','Actor':userLabel(h.actor),'Actor Name':h.actor?.name||'','Actor Email':h.actor?.email||'','Actor UID':h.actor?.uid||'','Timestamp':iso(h.created_at),'Feedback':excelText(h.feedback),'Transcript':transcript(h.segments),'Segment Count':asArray(h.segments).length});
  for(const j of asArray(item.ai_jobs))aiRows.push({'Project':project.name,'Audio Item ID':item.id,'Audio Module':item.display_name||'','Audio Link':audioUrl,'AI Job ID':j.id||'','Model':j.model||'','Language':j.language||'','Status':j.status||'','Source Revision':j.source_revision??'','Applied To Untouched Draft':j.applied===true?'Yes':j.applied===false?'No':'','Requested By':userLabel(j.requested_by),'Created At':iso(j.created_at),'Started At':iso(j.started_at),'Finished At':iso(j.finished_at),'Duration (ms)':j.duration_ms??'','Transcript':transcript(j.segments),'Segment Count':asArray(j.segments).length,'Error Code':j.error_code||'','Error Message':excelText(j.error_message)});
 }
 return {main,segments,historyRows,aiRows};
}

function makeSheet(XLSX,rows,widths){const ws=rows.length?XLSX.utils.json_to_sheet(rows):XLSX.utils.aoa_to_sheet([['No data']]);if(ws['!ref']&&rows.length)ws['!autofilter']={ref:ws['!ref']};ws['!cols']=widths.map(w=>({wch:w}));return ws}
function addLinks(XLSX,ws,header='Audio Link'){
 if(!ws['!ref'])return;const range=XLSX.utils.decode_range(ws['!ref']);let col=-1;for(let c=range.s.c;c<=range.e.c;c++){if(ws[XLSX.utils.encode_cell({r:0,c})]?.v===header){col=c;break}}if(col<0)return;for(let r=1;r<=range.e.r;r++){const cell=ws[XLSX.utils.encode_cell({r,c:col})];if(cell?.v&&/^https?:\/\//.test(String(cell.v)))cell.l={Target:String(cell.v),Tooltip:'Open secure Adatacore audio link'};}
}

async function exportExcel(button){
 const projectId=currentProjectId();if(!projectId)throw Error('Choose a transcription project first.');
 const original=button.textContent;button.disabled=true;button.textContent='Preparing…';
 try{
  const update=message=>{button.textContent=message.replace(/….*$/,'…');status(message)};
  const XLSXPromise=loadXLSX();const data=await fetchProject(projectId,update);if(!data.project)throw Error('Project data could not be loaded.');
  const links=await createAudioLinks(data.items,update);const XLSX=await XLSXPromise;const expiresAt=new Date(Date.now()+AUDIO_LINK_SECONDS*1000).toISOString();const rows=buildRows(data.project,data.items,links,expiresAt);
  update('Building Excel workbook…');const wb=XLSX.utils.book_new();
  const info=XLSX.utils.aoa_to_sheet([
   ['Adatacore Transcription Project Export',''],['Project',data.project.name||''],['Project ID',data.project.id],['Language',data.project.language||''],['Project Status',data.project.status||''],['Exported At',new Date().toISOString()],['Audio Modules',data.total],['Secure Audio Links Created',links.size],['Audio Link Expiry',expiresAt],['Important','Audio links are temporary signed links. Anyone holding a link can access that audio until the link expires.'],['Transcript Note','Combined transcript cells are limited to Excel cell length. The Segments sheet preserves transcript content segment by segment.'],['Revision Note','Revision History contains every stored submit / approve / request_changes snapshot and actor.']
  ]);info['!cols']=[{wch:30},{wch:95}];XLSX.utils.book_append_sheet(wb,info,'Export Info');
  const main=makeSheet(XLSX,rows.main,[10,25,12,38,35,24,14,24,30,18,55,55,25,18,12,18,14,14,14,20,16,32,30,20,18,30,24,14,24,55,22,16,22,14,16,55,55,55,14,16,14,30,20,18,18,30,28,24,18,18,28,18,55,24,24,24,24,14,14,16,16,16]);addLinks(XLSX,main);XLSX.utils.book_append_sheet(wb,main,'Audio & Transcripts');
  const seg=makeSheet(XLSX,rows.segments,[25,38,32,55,12,18,18,14,14,12,12,80,14,14,24,24]);addLinks(XLSX,seg);XLSX.utils.book_append_sheet(wb,seg,'Segments');
  const hist=makeSheet(XLSX,rows.historyRows,[25,38,32,55,12,18,30,24,28,18,24,50,100,14]);addLinks(XLSX,hist);XLSX.utils.book_append_sheet(wb,hist,'Revision History');
  const ai=makeSheet(XLSX,rows.aiRows,[25,38,32,55,38,28,12,14,14,14,28,24,24,24,14,100,14,20,50]);addLinks(XLSX,ai);XLSX.utils.book_append_sheet(wb,ai,'AI Drafts');
  const file=`Adatacore_${safeName(data.project.name)}_transcription_export_${new Date().toISOString().slice(0,10)}.xlsx`;XLSX.writeFile(wb,file,{compression:true});
  status(`Excel export ready: ${data.total} audio modules, ${rows.historyRows.length} saved transcript revisions, ${links.size} secure audio links.`);
 }finally{button.disabled=false;button.textContent=original}
}

const button=installButton();if(button)button.addEventListener('click',()=>exportExcel(button).catch(e=>{status(e.message||String(e),true);button.disabled=false;button.textContent='Export Excel'}));
})();
