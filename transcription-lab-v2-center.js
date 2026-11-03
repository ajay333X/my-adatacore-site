(()=>{
'use strict';
// Independent admin operations layer. Existing queue, editor, import and review handlers remain authoritative.
const $=id=>document.getElementById(id),root=document.body;
if(!root.classList.contains('tx-v2')||!$('v2opsDrawer')||!window.supabase)return;
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
const state={project:null,items:[],people:[],jobs:[],detail:null,drawerFocus:null,drawerAudio:null,history:[],reports:[],reportsLoaded:false,reportView:'issues',rulesVersion:0,caption:null,viewMode:'table'};
const filters={person:'',reviewer:'',duration:'',date:'',sort:'queue'};
const esc=(v)=>String(v??'');
const fmtDate=value=>value?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'—';
const fmtTime=seconds=>{const t=Math.max(0,Math.round(Number(seconds)||0));return Math.floor(t/3600)?Math.floor(t/3600)+'h '+String(Math.floor(t%3600/60)).padStart(2,'0')+'m':Math.floor(t/60)+'m '+String(t%60).padStart(2,'0')+'s'};
const stamp=ms=>{const t=Math.floor(Math.max(0,Number(ms)||0)/1000);return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')};
const uuid=s=>/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(String(s||''));
const all=id=>[...document.querySelectorAll(id)];
const node=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x};
const button=(label,action,cls)=>{const b=node('button',cls||'',label);b.type='button';b.addEventListener('click',action);return b};
const itemBy=id=>state.items.find(a=>String(a.id)===String(id));
const pj=()=>Number(state.project)||Number(new URLSearchParams(location.search).get('project'))||null;
const key=s=>'adatacore:txv2:'+s+':'+pj();
const setting=(k,def)=>{try{return JSON.parse(localStorage.getItem(key(k)))??def}catch(_){return def}};
const store=(k,v)=>{try{localStorage.setItem(key(k),JSON.stringify(v))}catch(_){}};
const rpc=async(name,args)=>{const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data};
const statusName=s=>String(s||'unassigned').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const openEditor=id=>'/transcription-v2?item='+encodeURIComponent(id);
const safeCell=s=>{let v=String(s??'');if(/^[\s]*[=+\-@]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';};
function download(name,rows){const txt='\ufeff'+rows.map(row=>row.map(safeCell).join(',')).join('\r\n')+'\r\n';const href=URL.createObjectURL(new Blob([txt],{type:'text/csv;charset=utf-8'}));const a=node('a');a.href=href;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1200)}
const exportItems=items=>[['Module ID','Audio','Status','Duration (seconds)','Source','Folder','Contributor','Reviewer','Added','Submitted','Reviewed','Queue Position'],...items.map(a=>[a.id,a.display_name,a.status,a.duration_seconds,a.source_project_title,a.source_folder,a.assignee,a.reviewer,a.created_at,a.submitted_at,a.reviewed_at,a.queue_position])];
const labelOption=(value,placeholder)=>new Option(placeholder,value);
const statusGroups={qa:['submitted','in_review'],approved:['approved','reviewed'],returned:['changes_requested']};
const isQa=a=>['submitted','in_review','changes_requested','approved','reviewed'].includes(a.status);
const getText=s=>String(s?.text??s?.transcript??s?.value??'');
function showTab(name){document.querySelector('[data-tx-tab="'+name+'"]')?.click()}
function queueFor(status){$('statusFilter').value=status;$('statusFilter').dispatchEvent(new Event('change',{bubbles:true}));showTab('queue')}
function toast(text,bad=false){const n=$('notice');if(!n)return;n.textContent=text;n.className='notice '+(bad?'error':'success')}
function filterItem(a){
 if(filters.person&&String(a.assignee||'')!==filters.person)return false;
 if(filters.reviewer&&String(a.reviewer||'')!==filters.reviewer)return false;
 const sec=Number(a.duration_seconds)||0;
 if(filters.duration==='short'&&sec>=120)return false;
 if(filters.duration==='medium'&&(sec<120||sec>300))return false;
 if(filters.duration==='long'&&sec<=300)return false;
 if(filters.date){
  const t=Date.parse(a.created_at||'');
  if(!Number.isFinite(t)||t<Date.now()-Number(filters.date)*86400000)return false;
 }
 return true;
}
function sortItems(rows){
 if(filters.sort==='queue')return rows;
 const list=[...rows],val=a=>Number(a.duration_seconds)||0,date=a=>Date.parse(a.created_at||'')||0;
 if(filters.sort==='recent')list.sort((a,b)=>date(b)-date(a));
 else if(filters.sort==='oldest')list.sort((a,b)=>date(a)-date(b));
 else if(filters.sort==='longest')list.sort((a,b)=>val(b)-val(a));
 else if(filters.sort==='shortest')list.sort((a,b)=>val(a)-val(b));
 return list;
}
const nonDefault=()=>Boolean(filters.person||filters.reviewer||filters.duration||filters.date||filters.sort!=='queue');
window.txV2OpsExtra={filter:filterItem,sort:sortItems,locked:nonDefault};
function rerenderQueue(){$('search')?.dispatchEvent(new Event('input',{bubbles:true}));updateFilterCount();queueMicrotask(drawCards);}
function updateFilterCount(){
 const count=[filters.person,filters.reviewer,filters.duration,filters.date,filters.sort!=='queue'?'sort':''].filter(Boolean).length;
 $('v2opsFilterCounter').textContent=count?'('+count+')':'';
 $('v2opsFiltersOpen').classList.toggle('has-filters',!!count);
}
function setFilter(name,val,refresh=true){
 filters[name]=val;
 const ids={person:'v2opsPersonFilter',reviewer:'v2opsReviewerFilter',duration:'v2opsDurationFilter',date:'v2opsDateFilter',sort:'v2opsSort'};
 if($(ids[name]))$(ids[name]).value=val;
 if(refresh)rerenderQueue();
}
function clearFilters(){
 for(const name of Object.keys(filters))setFilter(name,name==='sort'?'queue':'',false);
 $('statusFilter').value='';$('statusFilter').dispatchEvent(new Event('change',{bubbles:true}));
 $('search').value='';$('v2SourceFilter').value='';
 if(window.txV2Filters)window.txV2Filters.source='';
 all('[data-v2-filter]').forEach(b=>b.classList.toggle('is-active',b.dataset.v2Filter===''));
 rerenderQueue();$('v2opsSavedViews').value='';
}
function updatePeopleFilters(){
 const options=(key,el,placeholder)=>{
  const current=filters[key],names=[...new Set(state.items.map(a=>String(a[el]||'')).filter(Boolean))].sort();
  const select=$(key==='person'?'v2opsPersonFilter':'v2opsReviewerFilter');
  select.replaceChildren(labelOption('',placeholder),...names.map(x=>labelOption(x,x)));
  select.value=names.includes(current)?current:'';
  filters[key]=select.value;
 };
 options('person','assignee','All contributors');options('reviewer','reviewer','All reviewers');
}
for(const [k,id] of Object.entries({person:'v2opsPersonFilter',reviewer:'v2opsReviewerFilter',duration:'v2opsDurationFilter',date:'v2opsDateFilter',sort:'v2opsSort'})){
 $(id).addEventListener('change',e=>setFilter(k,e.target.value));
}
$('v2opsFiltersOpen').addEventListener('click',()=>{
 const panel=$('v2opsAdvancedFilters'),show=panel.hidden;panel.hidden=!show;
 $('v2opsFiltersOpen').setAttribute('aria-expanded',String(show));
});
$('v2opsClearView').addEventListener('click',clearFilters);
const saved=()=>{const arr=setting('views',[]);return Array.isArray(arr)?arr:[]};
function renderViews(){
 const v=saved();$('v2opsSavedViews').replaceChildren(labelOption('','Saved views'),...v.map((x,i)=>labelOption(String(i),x.name)));
}
$('v2opsSaveView').addEventListener('click',()=>{
 const name=prompt('Name this queue view:','My QA queue');if(!name)return;
 const trimmed=name.trim().slice(0,60);if(!trimmed)return;
 const views=saved().filter(v=>v.name!==trimmed);
 views.push({name:trimmed,filters:{...filters},status:$('statusFilter').value,source:$('v2SourceFilter').value,query:$('search').value});
 store('views',views.slice(-16));renderViews();toast('Queue view saved for this browser.');
});
$('v2opsSavedViews').addEventListener('change',()=>{
 const idx=$('v2opsSavedViews').value;if(idx==='')return;const v=saved()[Number(idx)];if(!v)return;
 for(const k of Object.keys(filters))setFilter(k,String(v.filters?.[k]??(k==='sort'?'queue':'')),false);
 $('statusFilter').value=v.status||'';$('v2SourceFilter').value=v.source||'';
 if(window.txV2Filters)window.txV2Filters.source=$('v2SourceFilter').value;
 $('search').value=v.query||'';
 $('statusFilter').dispatchEvent(new Event('change',{bubbles:true}));rerenderQueue();
 if(nonDefault()){$('v2opsAdvancedFilters').hidden=false;$('v2opsFiltersOpen').setAttribute('aria-expanded','true')}
});
function currentRows(){return [...$('audioRows').querySelectorAll('tr')].map(tr=>({tr,id:tr.querySelector('input[data-item]')?.dataset.item})).filter(x=>x.id)}
function selection(){return currentRows().filter(x=>x.tr.querySelector('input[data-item]')?.checked).map(x=>itemBy(x.id)).filter(Boolean)}
function currentShownItems(){return currentRows().map(x=>itemBy(x.id)).filter(Boolean)}
function setCardMode(mode){
 state.viewMode=mode;store('display',mode);
 const cards=mode==='cards';
 $('v2opsCards').hidden=!cards;
 document.querySelector('.tx-queue-card .table-scroll').classList.toggle('v2ops-visually-hidden',cards);
 $('v2opsTableMode').classList.toggle('is-selected',!cards);$('v2opsCardMode').classList.toggle('is-selected',cards);
 $('v2opsTableMode').setAttribute('aria-pressed',String(!cards));$('v2opsCardMode').setAttribute('aria-pressed',String(cards));
 if(cards)drawCards();
}
$('v2opsTableMode').addEventListener('click',()=>setCardMode('table'));
$('v2opsCardMode').addEventListener('click',()=>setCardMode('cards'));
function drawCards(){
 if(state.viewMode!=='cards')return;
 const target=$('v2opsCards');target.replaceChildren();
 const rows=currentRows();if(!rows.length){target.append(node('p','v2ops-empty','No recordings match the selected filters.'));return}
 const fragment=document.createDocumentFragment();
 for(const {tr,id} of rows){
  const a=itemBy(id);if(!a)continue;
  const card=node('article','v2ops-audio-card');
  const head=node('div','v2ops-audio-card-top'),title=node('div','v2ops-audio-card-title');
  const checkbox=node('input');checkbox.type='checkbox';checkbox.checked=tr.querySelector('input[data-item]')?.checked||false;checkbox.setAttribute('aria-label','Select '+(a.display_name||'audio'));checkbox.addEventListener('change',()=>{
   const original=tr.querySelector('input[data-item]');if(original){original.checked=checkbox.checked;original.dispatchEvent(new Event('change',{bubbles:true}))}
  });
  title.append(node('strong','',a.display_name||'Audio module'),node('small','',String(a.source_project_title||'Imported audio')+' · '+String(a.source_folder||'Root')));
  head.append(checkbox,title);card.append(head);
  const facts=node('div','v2ops-audio-card-meta');
  for(const [lab,value] of [['Status',statusName(a.status)],['Duration',fmtTime(a.duration_seconds)],['Contributor',a.assignee||'Unassigned'],['Reviewer',a.reviewer||'—']]){
   const x=node('span');x.append(node('small','',lab),node('strong','',value));facts.append(x)
  }
  const actions=node('div','v2ops-audio-card-actions');
  actions.append(button('Details',()=>openDrawer(id)),button('Open editor ↗',()=>location.href=openEditor(id),'v2ops-secondary'));
  card.append(facts,actions);fragment.append(card);
 }
 target.append(fragment);
}
let cardsQueued=false;
new MutationObserver(()=>{if(cardsQueued)return;cardsQueued=true;requestAnimationFrame(()=>{cardsQueued=false;drawCards()})}).observe($('audioRows'),{childList:true});
$('audioRows').addEventListener('change',()=>{
 if(state.viewMode==='cards')setTimeout(drawCards,50);
});
for(const id of ['v2opsExportSelection','v2opsCopySelection'])$(id).addEventListener('click',async()=>{
 const sel=selection();if(!sel.length){toast('Select one or more visible recordings first.',true);return}
 if(id==='v2opsExportSelection'){download('adatacore-selected-audio-'+pj()+'.csv',exportItems(sel));return}
 try{await navigator.clipboard.writeText(sel.map(a=>a.id).join('\n'));toast(sel.length+' module IDs copied.')}
 catch(_){toast('Copy unavailable. Use Export selection to download IDs.',true)}
});

// Project dashboard and reporting.
$('v2opsExportReport').addEventListener('click',()=>download('adatacore-project-'+pj()+'.csv',exportItems(state.items)));
$('v2opsCustomize').addEventListener('click',()=>{
 const grid=document.querySelector('.tx-metric-grid'),toolbar=$('v2opsCustomize');
 let popup=$('v2opsMetricChooser');
 if(popup){popup.remove();toolbar.setAttribute('aria-expanded','false');return}
 popup=node('div','v2ops-metric-chooser');popup.id='v2opsMetricChooser';
 popup.append(node('strong','','Dashboard metrics'));
 const prefs=setting('dashboard',null);
 all('.tx-metric').forEach((card,i)=>{
  const label=card.querySelector('.tx-metric-label')?.textContent||'Metric '+(i+1);
  const row=node('label'),checkbox=node('input');checkbox.type='checkbox';checkbox.checked=!Array.isArray(prefs)||prefs.includes(i);
  checkbox.addEventListener('change',()=>{
   const next=all('#v2opsMetricChooser input:checked').map(c=>Number(c.dataset.metric));store('dashboard',next);applyMetrics()
  });checkbox.dataset.metric=i;row.append(checkbox,node('span','',label));popup.append(row);
 });
 toolbar.parentElement.append(popup);toolbar.setAttribute('aria-expanded','true');
});
function applyMetrics(){
 const pref=setting('dashboard',null);
 all('.tx-metric').forEach((card,i)=>card.classList.toggle('v2ops-hide-metric',Array.isArray(pref)&&!pref.includes(i)));
 document.querySelector('.tx-metric-grid').classList.toggle('v2ops-custom-metrics',Array.isArray(pref));
}
applyMetrics();
all('.tx-pipeline-step').forEach((x,i)=>{
 x.setAttribute('role','button');x.tabIndex=0;x.title='Open corresponding work';
 const act=()=>{if(i===0)queueFor('unassigned');else if(i===1)queueFor('in_progress');else if(i===2){$('v2opsQaStatus').value='pending';renderQA();showTab('qa')}else queueFor('approved')};
 x.addEventListener('click',act);x.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act()}});
});

// QA review: existing review editor is the only place that mutates a transcript.
const qaStatuses=()=>state.items.filter(isQa);
function renderQA(){
 const allQA=qaStatuses(),pending=allQA.filter(x=>statusGroups.qa.includes(x.status));
 $('v2QaBadge').textContent=String(pending.length);
 $('v2opsQaWaiting').textContent=String(pending.length);
 $('v2opsQaReturned').textContent=String(allQA.filter(x=>statusGroups.returned.includes(x.status)).length);
 $('v2opsQaApproved').textContent=String(allQA.filter(x=>statusGroups.approved.includes(x.status)).length);
 const target=$('v2opsQaList');target.replaceChildren();
 const value=$('v2opsQaStatus').value;
 const rows=allQA.filter(a=>value==='all'||value==='pending'&&statusGroups.qa.includes(a.status)||value==='changes_requested'&&a.status==='changes_requested'||value==='approved'&&statusGroups.approved.includes(a.status))
  .sort((a,b)=>(Date.parse(b.submitted_at||b.updated_at||'')||0)-(Date.parse(a.submitted_at||a.updated_at||'')||0));
 if(!rows.length){target.append(node('p','v2ops-empty','No recordings in this review stage.'));return}
 for(const a of rows){
  const item=node('article','v2ops-work-item'),txt=node('div','v2ops-work-copy'),tools=node('div','v2ops-work-actions');
  txt.append(node('strong','',a.display_name||'Audio recording'),
    node('small','',statusName(a.status)+' · '+(a.assignee||'No contributor')+' · Submitted '+fmtDate(a.submitted_at)));
  tools.append(button('Details',()=>openDrawer(a.id)),button('Compare text',()=>compareText(a.id,item)));
  const link=node('a','button','Open review editor ↗');link.href=openEditor(a.id);tools.append(link);
  item.append(txt,tools);target.append(item);
 }
}
$('v2opsQaStatus').addEventListener('change',renderQA);
$('v2opsQaRefresh').addEventListener('click',()=>{renderQA();toast('QA list refreshed from current project data.')});
async function compareText(id,holder){
 const existing=holder.querySelector('.v2ops-compare');if(existing){existing.remove();return}
 const out=node('div','v2ops-compare'),loading=node('p','v2ops-empty','Loading saved and submitted captions…');out.append(loading);holder.append(out);
 try{
  const res=await rpc('tx_v2_caption_detail',{p_item_id:id});out.replaceChildren();
  const cur=(res?.segments||[]).map(getText).filter(s=>s.trim()),a=itemBy(id),submitted=Array.isArray(a?.submitted_segments)?a.submitted_segments.map(getText).filter(s=>s.trim()):[];
  const head=node('div','v2ops-compare-head');head.append(node('strong','','Submitted snapshot vs current saved transcription'),node('small','','Text differences require human verification; they do not automatically prove an error.'));
  out.append(head);
  if(!submitted.length){out.append(node('p','v2ops-empty','No submitted snapshot is available to compare for this recording.'));return}
  const left=node('section'),right=node('section');left.append(node('h4','','At submission ('+submitted.length+' lines)'));right.append(node('h4','','Current saved ('+cur.length+' lines)'));
  submitted.slice(0,80).forEach((s,i)=>{const line=node('p',cur[i]!==s?'v2ops-diff':'',s);left.append(line)});
  cur.slice(0,80).forEach((s,i)=>{const line=node('p',submitted[i]!==s?'v2ops-diff':'',s);right.append(line)});
  const cols=node('div','v2ops-compare-cols');cols.append(left,right);out.append(cols);
 }catch(e){out.textContent='Comparison unavailable: '+e.message}
}

// Contributor tracking: aggregate actual assignments only, do not estimate unverifiable quality scores.
const peopleRows=()=>{
 const map=new Map();
 for(const a of state.items){
  const person=a.assignee;if(!person)continue;
  if(!map.has(person))map.set(person,{name:person,assigned:0,active:0,submitted:0,approved:0,returned:0,audios:[],reviewedBy:0});
  const o=map.get(person);o.assigned++;o.audios.push(a);
  if(['assigned','in_progress'].includes(a.status))o.active++;
  if(['submitted','in_review','changes_requested','approved','reviewed'].includes(a.status))o.submitted++;
  if(statusGroups.approved.includes(a.status))o.approved++;
  if(a.status==='changes_requested')o.returned++;
 }
 for(const a of state.items){
  if(!a.reviewer)continue;
  if(!map.has(a.reviewer))map.set(a.reviewer,{name:a.reviewer,assigned:0,active:0,submitted:0,approved:0,returned:0,audios:[],reviewedBy:0});
  map.get(a.reviewer).reviewedBy++;
 }
 return [...map.values()].sort((a,b)=>b.assigned-a.assigned||a.name.localeCompare(b.name));
};
function renderPeople(){
 const people=peopleRows(),query=$('v2opsPeopleSearch').value.toLowerCase();
 $('v2opsPeopleTotal').textContent=people.filter(p=>p.assigned>0).length;
 $('v2opsPeopleActive').textContent=people.reduce((s,p)=>s+p.active,0);
 $('v2opsPeopleApproved').textContent=people.reduce((s,p)=>s+p.approved,0);
 const target=$('v2opsPeopleList');target.replaceChildren();
 const arr=people.filter(p=>p.name.toLowerCase().includes(query));
 if(!arr.length){target.append(node('p','v2ops-empty','No assigned contributors or reviewers match this search.'));return}
 const table=node('table','v2ops-people-table');
 const head=node('thead'),tr=node('tr');
 for(const h of ['Contributor / reviewer','Assigned','In progress','Submitted +','Approved','Returned','Review tasks',''])tr.append(node('th','',h));
 head.append(tr);table.append(head);
 const body=node('tbody');
 for(const p of arr){
  const row=node('tr');
  [p.name,p.assigned,p.active,p.submitted,p.approved,p.returned,p.reviewedBy].forEach(v=>row.append(node('td','',v)));
  const td=node('td');td.append(button('View work',()=>{
   const matches=p.audios.filter(a=>a.status==='assigned'||a.status==='in_progress'||a.status==='submitted');
   if(!matches.length){toast('This contributor has no current work to open.');return}
   openDrawer(matches[0].id);
  }));row.append(td);body.append(row);
 }
 table.append(body);target.append(table);
}
$('v2opsPeopleSearch').addEventListener('input',renderPeople);
$('v2opsPeopleExport').addEventListener('click',()=>download('adatacore-contributors-'+pj()+'.csv',
 [['Contributor','Assigned','Active','Submitted or further','Approved','Returned','Reviewer assignments'],...peopleRows().map(p=>[p.name,p.assigned,p.active,p.submitted,p.approved,p.returned,p.reviewedBy])]));

// Secure project reports from admin-only RPC; issue updates never touch transcript data.
async function refreshReports(force=false){
 if(!pj())return;
 if(!force&&state.reportsLoaded)return;
 $('v2opsReportsList').replaceChildren(node('p','v2ops-empty','Loading project reports…'));
 try{
  const result=await rpc('tx_v2_admin_operations',{p_project_id:pj()});
  state.reports=Array.isArray(result?.reports)?result.reports:[];
  state.history=Array.isArray(result?.activity)?result.activity:[];
  state.reportsLoaded=true;
  $('v2ReportBadge').textContent=String(state.reports.filter(x=>x.status==='open').length);
  $('v2opsIssueCount').textContent=String(state.reports.length);
  renderReports();
 }catch(e){$('v2opsReportsList').textContent='Could not load reports: '+e.message}
}
function renderReports(){
 const target=$('v2opsReportsList');target.replaceChildren();
 $('v2opsIssuesTab').classList.toggle('is-selected',state.reportView==='issues');
 $('v2opsHistoryTab').classList.toggle('is-selected',state.reportView==='activity');
 if(state.reportView==='issues'){
  if(!state.reports.length){target.append(node('p','v2ops-empty','No audio issues have been reported for this project.'));return}
  for(const flag of state.reports){
   const item=node('article','v2ops-work-item'),copy=node('div','v2ops-work-copy'),actions=node('div','v2ops-work-actions');
   copy.append(node('strong','',String(flag.display_name||'Audio')+' · '+String(flag.category||'audio issue').replace(/_/g,' ')),
     node('small','',stamp(flag.at_ms)+' · '+(flag.reporter_name||flag.reporter_email||'Contributor')+' · '+fmtDate(flag.created_at)));
   if(flag.note)copy.append(node('p','v2ops-note',flag.note));
   const badge=node('span','v2ops-status '+(flag.status==='open'?'is-open':'is-closed'),flag.status==='open'?'Open':'Resolved');copy.append(badge);
   actions.append(button('Listen / details',()=>openDrawer(flag.audio_item_id,flag.at_ms)));
   actions.append(button(flag.status==='open'?'Resolve':'Reopen',async()=>{
    const next=flag.status==='open'?'resolved':'open';
    const b=actions.lastElementChild;b.disabled=true;
    try{await rpc('tx_v2_admin_flag_status',{p_flag:flag.id,p_status:next});flag.status=next;renderReports();$('v2ReportBadge').textContent=String(state.reports.filter(x=>x.status==='open').length);toast('Audio report updated.')}
    catch(e){toast('Unable to update report: '+e.message,true);b.disabled=false}
   }));
   item.append(copy,actions);target.append(item);
  }
 }else{
  if(!state.history.length){target.append(node('p','v2ops-empty','No transcription history entries were found.'));return}
  for(const entry of state.history){
   const item=node('article','v2ops-work-item'),copy=node('div','v2ops-work-copy');
   copy.append(node('strong','',String(entry.action||'Updated')+' · '+String(entry.display_name||'Audio recording')),
     node('small','',(entry.actor_name||entry.actor_email||'Contributor')+' · Revision '+entry.revision+' · '+fmtDate(entry.created_at)));
   if(entry.feedback)copy.append(node('p','v2ops-note',String(entry.feedback).slice(0,450)));
   item.append(copy,button('Audio details',()=>openDrawer(entry.audio_item_id)));target.append(item);
  }
 }
}
$('v2opsIssuesTab').addEventListener('click',()=>{state.reportView='issues';renderReports()});
$('v2opsHistoryTab').addEventListener('click',()=>{state.reportView='activity';renderReports()});
$('v2opsReportsRefresh').addEventListener('click',()=>refreshReports(true));
$('v2opsReportsExport').addEventListener('click',()=>{
 if(state.reportView==='issues')download('adatacore-audio-reports-'+pj()+'.csv',[['ID','Audio ID','Recording','Category','Timestamp (ms)','Status','Reporter','Note','Created'],...state.reports.map(x=>[x.id,x.audio_item_id,x.display_name,x.category,x.at_ms,x.status,x.reporter_email||x.reporter_name,x.note,x.created_at])]);
 else download('adatacore-audit-history-'+pj()+'.csv',[['ID','Audio ID','Recording','Event','Revision','Actor','Feedback','Created'],...state.history.map(x=>[x.id,x.audio_item_id,x.display_name,x.action,x.revision,x.actor_email||x.actor_name,x.feedback,x.created_at])]);
});

// Guidelines: versioned and stored by admin-only RPC; does not modify core project configs.
const controls={language:'v2opsRuleLanguage',mode:'v2opsRuleMode',punct_pause_ms:'v2opsRulePunct',plain_pause_ms:'v2opsRulePlain',nst:'v2opsRuleNST',style:'v2opsRuleStyle',pro:'v2opsRulePro',fl:'v2opsRuleFL',instructions:'v2opsRuleInstructions'};
function fillRules(r){
 for(const [k,id] of Object.entries(controls)){
  let v=r?.[k];
  if(k==='nst'||k==='style')v=Array.isArray(v)?v.join('\n'):String(v||'');
  else if(v===undefined||v===null)v=k==='language'?'hi':k==='mode'?'verbatim':k==='punct_pause_ms'?2000:k==='plain_pause_ms'?1500:'';
  $(id).value=String(v);
 }
}
async function loadRules(){
 if(!pj())return;
 const targetProject=pj();
 $('v2opsRulesNotice').textContent='Loading project guidelines…';
 try{
  const result=await rpc('tx_v2_get_project_guidelines',{p_project_id:pj()});
  if(targetProject!==pj())return;
  fillRules(result?.rules||{});state.rulesVersion=Number(result?.version)||0;state.rulesLoadedFor=targetProject;
  $('v2opsRulesVersion').textContent=state.rulesVersion?'Version '+state.rulesVersion:'Not configured';
  $('v2opsRulesNotice').textContent=state.rulesVersion?'Loaded saved project guidelines.':'No guidelines configured yet. Changes are saved only when you click Save.';
  $('v2opsProjectSettings').href='/admin/project-lab?project='+pj();
 }catch(e){$('v2opsRulesNotice').textContent='Unable to load guidelines: '+e.message}
}
$('v2opsRulesSave').addEventListener('click',async()=>{
 if(!pj())return;
 const r={};for(const [key,id] of Object.entries(controls))r[key]=$(id).value;
 for(const k of ['punct_pause_ms','plain_pause_ms'])r[k]=Number(r[k]);
 for(const k of ['nst','style'])r[k]=r[k].split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,180);
 if(!Number.isFinite(r.punct_pause_ms)||!Number.isFinite(r.plain_pause_ms)||r.punct_pause_ms<0||r.plain_pause_ms<0||r.punct_pause_ms>10000||r.plain_pause_ms>10000){$('v2opsRulesNotice').textContent='Pause thresholds must be between 0 and 10,000 ms.';return}
 const save=$('v2opsRulesSave');save.disabled=true;$('v2opsRulesNotice').textContent='Saving…';
 try{
  const result=await rpc('tx_v2_save_project_guidelines',{p_project_id:pj(),p_rules:r});
  state.rulesVersion=result.version;$('v2opsRulesVersion').textContent='Version '+result.version;
  $('v2opsRulesNotice').textContent='Guidelines saved. Existing transcripts and project settings were not changed.';
 }catch(e){$('v2opsRulesNotice').textContent='Could not save guidelines: '+e.message}
 finally{save.disabled=false}
});

// Audio details drawer, browser audio preview and transcript preview (read-only).
const drawer=$('v2opsDrawer'),backdrop=$('v2opsDrawerBackdrop'),body=$('v2opsDrawerBody');
function stopPreview(){
 const audio=state.drawerAudio;if(audio){audio.pause();audio.removeAttribute('src');audio.load();state.drawerAudio=null}
}
function closeDrawer(){
 stopPreview();state.detail=null;drawer.hidden=true;backdrop.hidden=true;root.classList.remove('v2ops-drawer-open');
 state.drawerFocus?.focus?.({preventScroll:true});state.drawerFocus=null;
}
$('v2opsDrawerClose').addEventListener('click',closeDrawer);
backdrop.addEventListener('click',closeDrawer);
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&!drawer.hidden){e.preventDefault();closeDrawer();return}
 if(e.key==='Tab'&&!drawer.hidden){
  const focusable=[...drawer.querySelectorAll('button:not(:disabled),a[href],input,select')].filter(el=>el.getClientRects().length);
  if(!focusable.length)return;
  if(e.shiftKey&&document.activeElement===focusable[0]){e.preventDefault();focusable.at(-1).focus()}
  else if(!e.shiftKey&&document.activeElement===focusable.at(-1)){e.preventDefault();focusable[0].focus()}
 }
});
$('v2opsDrawerCopy').addEventListener('click',async()=>{
 const a=itemBy(state.detail);if(!a)return;
 try{await navigator.clipboard.writeText(a.id);toast('Audio module ID copied.')}catch(_){toast('Clipboard not available.',true)}
});
function field(label,value){const d=node('div','v2ops-detail-pair');d.append(node('dt','',label),node('dd','',value||'—'));return d}
async function loadPreview(a,section,startMs=0){
 const status=node('p','v2ops-muted','Requesting secure audio preview…');section.append(status);
 try{
  if(!a.storage_bucket||!a.recording_path)throw Error('Audio storage information is unavailable.');
  const {data,error}=await db.storage.from(a.storage_bucket).createSignedUrl(a.recording_path,900);
  if(error)throw Error(error.message);
  if(state.detail!==a.id)return;
  const el=node('audio','v2ops-preview-audio');el.controls=true;el.preload='metadata';el.src=data.signedUrl;
  state.drawerAudio=el;section.insertBefore(el,status);status.remove();
  if(startMs>0)el.addEventListener('loadedmetadata',()=>{el.currentTime=Math.min(el.duration||Infinity,startMs/1000)},{once:true});
 }catch(e){if(state.detail===a.id)status.textContent='Preview unavailable: '+e.message+' · Open the transcription editor to try its audio player.'}
}
async function loadCaptions(a,section){
 const status=node('p','v2ops-muted','Loading saved transcript…');section.append(status);
 try{
  const result=await rpc('tx_v2_caption_detail',{p_item_id:a.id});
  if(state.detail!==a.id)return;
  status.remove();
  const rows=Array.isArray(result?.segments)?result.segments.filter(s=>getText(s).trim()):[];
  if(!rows.length){section.append(node('p','v2ops-muted','No saved captions for this module yet.'));return}
  const list=node('div','v2ops-caption-list');
  for(const s of rows.slice(0,80)){
   const line=node('p');
   line.append(node('time','',stamp(s.start_ms)),node('span','',getText(s)));
   line.addEventListener('click',()=>{const audio=state.drawerAudio;if(audio)audio.currentTime=Number(s.start_ms||0)/1000});
   line.tabIndex=0;line.setAttribute('role','button');line.title='Seek audio to '+stamp(s.start_ms);
   line.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();line.click()}});
   list.append(line);
  }
  section.append(list);
  if(rows.length>80)section.append(node('small','v2ops-muted','Showing first 80 of '+rows.length+' caption lines. Open the editor for the full transcript.'));
 }catch(e){if(state.detail===a.id)status.textContent='Transcript preview unavailable: '+e.message}
}
function openDrawer(id,seek=0){
 const a=itemBy(id);if(!a)return;
 if(!drawer.hidden)stopPreview();
 if(drawer.hidden)state.drawerFocus=document.activeElement;
 state.detail=a.id;
 $('v2opsDrawerTitle').textContent=a.display_name||'Audio recording';
 $('v2opsDrawerSubtitle').textContent=statusName(a.status)+' · '+fmtTime(a.duration_seconds);
 $('v2opsDrawerEditor').href=openEditor(a.id);
 body.replaceChildren();
 const section=node('section','v2ops-detail-section');section.append(node('h3','','Module information'));
 const dl=node('dl','v2ops-detail-grid');
 for(const [lab,value] of [['Status',statusName(a.status)],['Duration',fmtTime(a.duration_seconds)],['Source project',a.source_project_title],['Folder',a.source_folder],['Assigned contributor',a.assignee||'Unassigned'],['Reviewer',a.reviewer||'Not assigned'],['Queue position',a.queue_position?'#'+a.queue_position:'—'],['Added',fmtDate(a.created_at)],['Submitted',fmtDate(a.submitted_at)],['Reviewed',fmtDate(a.reviewed_at)],['Revision',a.revision||'—']])dl.append(field(lab,value));
 section.append(dl);body.append(section);
 const player=node('section','v2ops-detail-section');player.append(node('h3','','Audio preview'));body.append(player);
 const trans=node('section','v2ops-detail-section');trans.append(node('h3','','Saved captions'));body.append(trans);
 const notes=node('section','v2ops-detail-section');notes.append(node('h3','','QA feedback'));
 notes.append(node('p','v2ops-muted',a.feedback||'No reviewer feedback recorded.'));
 body.append(notes);
 const reports=state.reports.filter(f=>f.audio_item_id===a.id);
 if(reports.length){
  const bugs=node('section','v2ops-detail-section');bugs.append(node('h3','','Contributor audio reports'));
  for(const f of reports.slice(0,12))bugs.append(node('p','v2ops-muted',stamp(f.at_ms)+' · '+f.category.replace(/_/g,' ')+' · '+f.status+(f.note?' · '+f.note:'')));
  body.append(bugs)
 }
 drawer.hidden=false;backdrop.hidden=false;root.classList.add('v2ops-drawer-open');drawer.focus({preventScroll:true});
 loadPreview(a,player,seek);loadCaptions(a,trans);
}
document.addEventListener('click',e=>{
 const btn=e.target.closest('[data-v2ops-details]');
 if(btn){e.preventDefault();openDrawer(btn.dataset.v2opsDetails);return}
 const rowName=e.target.closest('#audioRows tr[data-v2ops-row] td:nth-child(2) strong');
 if(rowName&&!e.target.closest('a,button,input')){const id=rowName.closest('tr')?.dataset.v2opsRow;if(id)openDrawer(id)}
});
function decorateTable(){
 for(const {tr,id} of currentRows()){
  tr.dataset.v2opsRow=id;
  const cell=tr.lastElementChild;
  if(!cell?.querySelector('[data-v2ops-details]')){
   const b=node('button','v2ops-details-button','Details');b.type='button';
   b.dataset.v2opsDetails=id;
   cell?.append(b);
  }
 }
}
let decorateScheduled=false;
new MutationObserver(()=>{
 if(decorateScheduled)return;decorateScheduled=true;requestAnimationFrame(()=>{decorateScheduled=false;decorateTable()});
}).observe($('audioRows'),{childList:true});
decorateTable();

// Hook into the existing verified data pipeline. No second assignment or queue backend.
document.addEventListener('txv2:data',e=>{
 const detail=e.detail||{},nextProject=Number(detail.projectId||0);
 if(!nextProject)return;
 const changing=state.project!==null&&state.project!==nextProject;
 if(changing)closeDrawer();
 state.project=nextProject;state.items=Array.isArray(detail.items)?detail.items:[];state.people=Array.isArray(detail.people)?detail.people:[];state.jobs=Array.isArray(detail.jobs)?detail.jobs:[];
 if(changing){
  for(const k of Object.keys(filters))setFilter(k,k==='sort'?'queue':'',false);
  state.reportsLoaded=false;state.reports=[];state.history=[];state.rulesVersion=0;state.rulesLoadedFor=null;
  renderViews();setCardMode(setting('display','table')==='cards'?'cards':'table');applyMetrics();
 }
 updatePeopleFilters();rerenderQueue();renderQA();renderPeople();
 $('v2opsProjectSettings').href='/admin/project-lab?project='+nextProject;
 if(document.querySelector('[data-tx-view="reports"]')?.classList.contains('active'))refreshReports(true);
 if(state.rulesLoadedFor!==nextProject)loadRules();
 if(state.viewMode==='cards')drawCards();
});
all('[data-tx-tab]').forEach(b=>b.addEventListener('click',()=>{
 const active=b.dataset.txTab;
 if(active==='reports')refreshReports();
 if(active==='rules'&&!state.rulesVersion)loadRules();
 if(active==='qa')renderQA();
 if(active==='people')renderPeople();
}));
document.addEventListener('keydown',e=>{
 if(e.metaKey||e.ctrlKey||e.altKey||e.target.closest('input,textarea,select,[contenteditable]')||document.querySelector('dialog[open]')||!drawer.hidden)return;
 if(e.key==='?'||e.key.toLowerCase()==='h'&&e.shiftKey){e.preventDefault();$('v2CommandOpen')?.click()}
 if(e.key.toLowerCase()==='f'&&e.shiftKey){e.preventDefault();showTab('queue');$('v2opsAdvancedFilters').hidden=false;$('v2opsFiltersOpen').setAttribute('aria-expanded','true');$('v2opsPersonFilter').focus()}
});
renderViews();setCardMode(setting('display','table')==='cards'?'cards':'table');updateFilterCount();
})();
