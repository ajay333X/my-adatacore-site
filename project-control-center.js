(()=>{'use strict';
if(window.__adatacoreProjectControlCenter)return;
window.__adatacoreProjectControlCenter=true;
const projectId=Number(new URLSearchParams(location.search).get('project')||0);
if(!Number.isInteger(projectId)||projectId<=0)return;
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',{auth:{persistSession:true,autoRefreshToken:true}});
const BUCKET='adatacore-project-library';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const fmt=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.valueOf())?'—':d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})};
const fileSize=b=>{const n=Number(b)||0;return n>1048576?(n/1048576).toFixed(1)+' MB':(n/1024).toFixed(1)+' KB'};
const cleanFileName=s=>String(s||'file').replace(/[^\w.\-]+/g,'_').slice(-100)||'file';
const tabs=[
 ['overview','Overview','overview'],['configs','Configs','settings'],['workers','Workers','people'],
 ['products','Products','inventory'],['quality','Quality','quality'],['contracts','Templates & rates','templates'],
 ['instructions','Instructions','ac-instructions'],['library','Library','ac-library'],
 ['announcements','Announcements','ac-announcements'],['jobs','Jobs','assignments'],
 ['activity','Activity','activity']
];
let snap=null,active='overview',dialogKind=null,editing=null,writing=false,search='',folder='',initialized=false,projectCode='';
const access=()=>window.__adatacoreProjectAccess;
const canEdit=()=>!!access()?.is_super_admin||!!access()?.project_roles?.includes('project_manager');
const hasAccess=()=>!!access()?.allowed&&(access()?.is_super_admin||access()?.project_roles?.some(x=>x==='project_manager'||x==='qa_manager'));
const findTab=id=>tabs.find(x=>x[0]===id);
const asField=(label,body)=>'<div class="ac-pcc-field"><label>'+label+'</label>'+body+'</div>';
const selectOpt=(v,t,s)=>'<option value="'+esc(v)+'"'+(String(v)===String(s)?' selected':'')+'>'+esc(t)+'</option>';
function error(e){message(e.message||String(e),true)}
function message(s,bad=false){
 const el=$('pccStatus');if(el){el.textContent=String(s||'');el.style.color=bad?'var(--red)':'var(--green)';}
 const toast=$('labToast');if(toast&&s){toast.textContent=String(s);toast.classList.add('show');clearTimeout(message.timeout);message.timeout=setTimeout(()=>toast.classList.remove('show'),3200)}
}
async function rpc(name,args){const r=await db.rpc(name,args);if(r.error)throw Error(r.error.message);return r.data}
function ensureUi(){
 const main=document.querySelector('.lab-main'),labNav=document.querySelector('.lab-nav');
 if(!main||!labNav||!hasAccess())return false;
 if(!$('pccSummary')){
  const summary=document.createElement('div');summary.id='pccSummary';summary.className='ac-pcc-summary';
  summary.innerHTML='<div><div id="pccName" class="ac-pcc-project">Loading project…</div><div id="pccMeta" class="ac-pcc-meta">Project · '+(projectCode||'—')+'</div></div><span class="ac-pcc-pill"><span class="ac-pcc-dot"></span> Project-specific controls</span>';
  main.prepend(summary);
 }
 if(!$('pccTabs')){
  const top=document.createElement('nav');top.id='pccTabs';top.className='ac-pcc-nav';top.setAttribute('aria-label','Project management');
  top.innerHTML=tabs.filter(t=>canEdit()||!['configs','workers','products','contracts','jobs'].includes(t[0]))
   .map(t=>'<button type="button" data-pcc-tab="'+esc(t[0])+'" aria-current="false">'+esc(t[1])+'</button>').join('');
  $('pccSummary').after(top);
  top.addEventListener('click',e=>{const b=e.target.closest('[data-pcc-tab]');if(b)go(b.dataset.pccTab)});
 }
 for(const name of ['instructions','library','announcements']){
  const id='ac-'+name;
  if(!$('view-'+id)){
   const el=document.createElement('section');el.id='view-'+id;el.className='lab-view';
   el.innerHTML='<div class="ac-pcc-heading"><div><div class="eyebrow">Project content</div><h1>'+name[0].toUpperCase()+name.slice(1)+'</h1><p>Visible only within this project.</p></div></div><div class="ac-pcc-status">Loading…</div><div class="ac-pcc-list"></div>';
   main.append(el);
  }
  if(!labNav.querySelector('[data-view="'+id+'"]')){
   const btn=document.createElement('button');btn.dataset.view=id;btn.textContent=name[0].toUpperCase()+name.slice(1);
   btn.addEventListener('click',()=>go(name));
   labNav.append(btn);
  }
 }
 if(!$('pccStatus')){const n=document.createElement('div');n.id='pccStatus';n.className='ac-pcc-status';$('pccTabs').after(n)}
 if(!$('pccDialog')){
  const div=document.createElement('div');div.id='pccDialog';div.className='ac-pcc-dialog';div.hidden=true;
  div.innerHTML='<div class="ac-pcc-backdrop" data-pcc-dismiss="true"></div><section class="ac-pcc-drawer" role="dialog" aria-modal="true" aria-labelledby="pccDrawerHeading"><header><div><h2 id="pccDrawerHeading">New content</h2><p id="pccDrawerDesc">Manage content for this project only.</p></div><button class="btn btn-secondary" type="button" data-pcc-dismiss="true" aria-label="Close">×</button></header><div class="ac-pcc-drawer-body" id="pccDrawerBody"></div><footer class="ac-pcc-drawer-footer"><span id="pccDrawerStatus" class="ac-pcc-hint" aria-live="polite"></span><button type="button" class="btn btn-secondary" data-pcc-dismiss="true">Cancel</button><button type="button" class="btn btn-primary" id="pccSave">Publish / Save</button></footer></section>';
  document.body.append(div);
  div.addEventListener('click',e=>{if(e.target.closest('[data-pcc-dismiss]'))closeEditor()});
  $('pccSave').onclick=saveEditor;
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!div.hidden)closeEditor()});
 }
 main.addEventListener('click',async e=>{
  const b=e.target.closest('[data-pcc-action]');if(!b)return;
  e.preventDefault();
  const type=b.dataset.pccAction,id=b.dataset.id||'';
  if(type==='add-instruction')openEditor('instructions');
  if(type==='add-announcement')openEditor('announcements');
  if(type==='add-library')openEditor('library');
  if(type==='edit-instruction')openEditor('instructions',snap?.guidelines.find(x=>x.id===id));
  if(type==='edit-announcement')openEditor('announcements',snap?.announcements.find(x=>x.id===id));
  if(type==='edit-library')openEditor('library',snap?.library.find(x=>x.id===id));
  if(type==='archive-announcement'||type==='archive-library')await archive(type==='archive-library'?'library':'announcement',id);
  if(type==='open-file')await openFile(id);
  if(type==='completion')await showCompletion(b.dataset.kind,id);
  if(type==='preview')showPreview(b.dataset.kind,id);
  if(type==='open-link'){const item=snap?.library.find(x=>x.id===id);if(item?.link_url&&/^https?:\/\//i.test(item.link_url))window.open(item.link_url,'_blank','noopener,noreferrer')}
  if(type==='open-folder'){folder=id;render('library')}
  if(type==='all-folders'){folder='';render('library')}
 });
 main.addEventListener('input',e=>{if(e.target.id==='pccSearch'){search=e.target.value;render(active)}});
 document.querySelector('#pccDialog').addEventListener('click',e=>{
  const b=e.target.closest('[data-toolbar]');if(!b)return;const ta=$('pccBody');if(!ta)return;
  const start=ta.selectionStart,end=ta.selectionEnd,text=ta.value,fragment=text.slice(start,end)||'text',wrap=b.dataset.toolbar;
  const mark=wrap==='bold'?'**':wrap==='italic'?'*':wrap==='list'?'- ':wrap==='link'?'[':wrap==='heading'?'## ':'';
  const insert=wrap==='link'?'['+fragment+'](https://example.com)':wrap==='list'||wrap==='heading'?mark+fragment:mark+fragment+mark;
  ta.setRangeText(insert,start,end,'select');ta.focus();
 });
 return true;
}
function syncTabs(id){
 document.querySelectorAll('[data-pcc-tab]').forEach(x=>x.setAttribute('aria-current',String(x.dataset.pccTab===id)?'page':'false'));
}
function go(id){
 const selected=findTab(id);if(!selected)return;
 if(!canEdit()&&['configs','workers','products','contracts','jobs'].includes(id))return;
 active=id;syncTabs(id);
 const viewName=selected[2];
 if(viewName.startsWith('ac-')){
  document.querySelectorAll('.lab-view').forEach(x=>x.classList.toggle('active',x.id==='view-'+viewName));
  document.querySelectorAll('.lab-nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===viewName));
  if(!snap)refresh();else render(id);
  try{history.replaceState(null,'',location.pathname+location.search+'#'+viewName)}catch(_){}
 }else{
  const b=document.querySelector('.lab-nav [data-view="'+viewName+'"]');
  if(b&&getComputedStyle(b).display!=='none')b.click();
  else{document.querySelectorAll('.lab-view').forEach(x=>x.classList.toggle('active',x.id==='view-'+viewName));}
 }
}
async function refresh(){
 try{
  snap=await rpc('admin_project_content_snapshot',{p_project_id:projectId});
  if(!snap?.project)throw Error('Project not found or access denied');
  $('pccName').textContent=snap.project.name;
  $('pccMeta').textContent='Project · '+(projectCode||'—')+' · '+(snap.project.type||'Project')+' · '+(snap.project.language||'')+' · '+(snap.project.lifecycle||'');
  render(active);message('');
 }catch(e){error(e)}
}
function contentHead(section,description,buttonText,buttonAction){
 return '<div class="ac-pcc-heading"><div><div class="eyebrow">Project · '+(projectCode||'—')+' / Content</div><h1>'+section+'</h1><p>'+description+'</p></div>'+
  (canEdit()?'<div class="ac-pcc-actions"><button class="btn btn-secondary" type="button" data-pcc-action="'+buttonAction+'">'+buttonText+'</button></div>':'')+'</div>';
}
const actions=(kind,item)=>{
 let html='<div class="ac-pcc-controls"><button class="btn btn-secondary" type="button" data-pcc-action="preview" data-kind="'+kind+'" data-id="'+esc(item.id)+'">Preview</button>';
 if((kind==='announcement'&&item.requires_ack)||(kind==='library'&&item.completion_rule&&item.completion_rule!=='none'))html+='<button class="btn btn-secondary" type="button" data-pcc-action="completion" data-kind="'+kind+'" data-id="'+esc(item.id)+'">Completion</button>';
 if(canEdit()){
  html+='<button class="btn btn-secondary" type="button" data-pcc-action="edit-'+kind+'" data-id="'+esc(item.id)+'">Edit</button>';
  if(kind==='library'||kind==='announcement')html+='<button class="btn btn-secondary" type="button" data-pcc-action="archive-'+kind+'" data-id="'+esc(item.id)+'">'+(kind==='announcement'?'Expire':'Remove')+'</button>';
 }
 return html+'</div>';
};
function render(section){
 const id='view-ac-'+section,view=$(id);if(!view)return;
 const list=view.querySelector('.ac-pcc-list'),head=view.querySelector('.ac-pcc-heading');
 if(!snap){if(list)list.innerHTML='<div class="ac-pcc-empty">Loading content…</div>';return}
 const rows=section==='instructions'?(snap.guidelines||[]):section==='library'?(snap.library||[]):(snap.announcements||[]);
 if(section==='instructions'){
  head.outerHTML=contentHead('Instructions','Manage versioned instructions. Publishing a new version updates only this project.', '＋ New instructions','add-instruction');
  const visible=rows.filter(x=>!search||String(x.title+' '+x.body).toLowerCase().includes(search.toLowerCase()));
  list.innerHTML=visible.length?visible.map(x=>
   '<article class="ac-pcc-item"><div class="ac-pcc-copy"><strong>'+esc(x.title)+'</strong><div class="ac-pcc-detail">Version '+Number(x.version||1)+' · '+fmt(x.published_at||x.created_at)+' · '+Number(x.acks||0)+' acknowledgements</div><p>'+esc(x.body)+'</p></div>'+
   '<span class="ac-pcc-pill '+(x.status==='published'?'':'muted')+'">'+esc(x.status)+'</span>'+actions('instruction',x)+'</article>').join(''):'<div class="ac-pcc-empty">No instructions yet. Create a project-specific guide.</div>';
 }else if(section==='announcements'){
  head.outerHTML=contentHead('Announcements','Publish project-only notices. New posts notify only active members of this project.','＋ New announcement','add-announcement');
  const visible=rows.filter(x=>!search||String(x.title+' '+x.body).toLowerCase().includes(search.toLowerCase()));
  list.innerHTML=visible.length?visible.map(x=>
  '<article class="ac-pcc-item"><div class="ac-pcc-copy"><strong>'+esc(x.title)+'</strong><div class="ac-pcc-detail">'+fmt(x.published_at)+' · '+esc(x.severity)+' · '+(x.published?'Published':'Draft')+' · '+Number(x.acks||0)+' acknowledged'+(x.expires_at&&Date.parse(x.expires_at)<=Date.now()?' · Expired':'')+'</div><p>'+esc(x.body)+'</p></div>'+actions('announcement',x)+'</article>').join(''):'<div class="ac-pcc-empty">No announcements yet for this project.</div>';
 }else{
  head.outerHTML=contentHead('Library','Create folders, write documents, add links, and upload private files. Only published contributor-visible entries appear on the contributor dashboard.','＋ Add to library','add-library');
  const children=rows.filter(x=>(x.parent_id||'')===folder).filter(x=>!search||String(x.title+' '+x.body).toLowerCase().includes(search.toLowerCase()));
  const folders=rows.filter(x=>x.kind==='folder');
  const nav='<div class="ac-pcc-toolbar"><div><button class="btn btn-secondary" type="button" data-pcc-action="all-folders">Library home</button> '+
   (folder?'<span class="ac-pcc-pill">'+esc(folders.find(x=>x.id===folder)?.title||'Folder')+'</span>':'')+
   '</div><span class="ac-pcc-hint">'+rows.length+' resources in this project</span></div>';
  list.innerHTML=nav+(children.length?children.map(x=>
  '<article class="ac-pcc-item"><div class="ac-pcc-copy"><strong>'+esc(x.kind==='folder'?'▣ ':x.kind==='file'?'▤ ':x.kind==='link'?'↗ ':'▤ ')+esc(x.title)+'</strong><div class="ac-pcc-detail">'+esc(x.kind.toUpperCase())+' · '+(x.completion_rule==='watch'?'Must watch':x.completion_rule==='acknowledge'?'Must acknowledge':'Optional')+' · '+(x.published?'Published':'Draft')+' · '+esc(x.visibility)+' · '+fmt(x.updated_at)+'</div><p>'+esc(x.body||x.link_url||'')+'</p></div><div class="ac-pcc-controls">'+
   (x.kind==='folder'?'<button class="btn btn-primary" type="button" data-pcc-action="open-folder" data-id="'+esc(x.id)+'">Open</button>':
    x.kind==='file'?'<button class="btn btn-secondary" type="button" data-pcc-action="open-file" data-id="'+esc(x.id)+'">View file</button>':
    x.kind==='link'?'<button class="btn btn-secondary" type="button" data-pcc-action="open-link" data-id="'+esc(x.id)+'">Open link</button>':'')+
    '<button class="btn btn-secondary" type="button" data-pcc-action="preview" data-kind="library" data-id="'+esc(x.id)+'">Preview</button>'+((x.completion_rule||'none')!=='none'?'<button class="btn btn-secondary" type="button" data-pcc-action="completion" data-kind="library" data-id="'+esc(x.id)+'">Completion</button>':'')+(canEdit()?'<button class="btn btn-secondary" type="button" data-pcc-action="edit-library" data-id="'+esc(x.id)+'">Edit</button><button class="btn btn-secondary" type="button" data-pcc-action="archive-library" data-id="'+esc(x.id)+'">Remove</button>':'')+
    '</div></article>').join(''):'<div class="ac-pcc-empty">No library items in this folder yet.</div>');
 }
}
function editorHtml(kind,item){
 const x=item||{};
 if(kind==='instructions')return asField('Instruction title','<input id="pccTitle" maxlength="220" placeholder="Project transcription guidelines" value="'+esc(x.title||'')+'">')+
  bodyEditor(x.body||'')+'<div class="ac-pcc-grid">'+
  asField('Publication','<select id="pccPublished">'+selectOpt('true','Publish to this project',''+(x.status==='published'||!item))+selectOpt('false','Save draft',''+(x.status==='draft'))+'</select>')+
  asField('Requirement','<label class="ac-pcc-switch"><input id="pccAck" type="checkbox" '+(x.required?'checked':'')+'> Must acknowledge</label>')+'</div>'+
  '<p class="ac-pcc-hint">Published instructions are versioned. Updating an already published guide creates a new version and retires the old one for this project.</p>';
 if(kind==='announcements')return asField('Announcement title','<input id="pccTitle" maxlength="220" placeholder="Training and quality update" value="'+esc(x.title||'')+'">')+
  bodyEditor(x.body||'')+'<div class="ac-pcc-grid">'+
  asField('Priority','<select id="pccSeverity">'+['info','important','critical'].map(v=>selectOpt(v,v,x.severity||'info')).join('')+'</select>')+
  asField('Expires at (optional)','<input type="datetime-local" id="pccExpires">')+'</div>'+
  '<label class="ac-pcc-switch"><input id="pccAck" type="checkbox" '+(x.requires_ack?'checked':'')+'> Require acknowledgement</label>'+
  '<div class="ac-pcc-grid">'+asField('Publication','<select id="pccPublished">'+selectOpt('true','Publish to this project',String(x.published??true))+selectOpt('false','Save draft (private)',String(x.published??true))+'</select>')+'</div><div class="ac-pcc-note">Drafts are private. Publishing notifies active contributors of this project once.</div>';
 const kindInput=asField('Resource type','<select id="pccKind" '+(item?'disabled':'')+'>'+['text','link','file','folder'].map(v=>selectOpt(v,v[0].toUpperCase()+v.slice(1),x.kind||'text')).join('')+'</select>');
 return kindInput+asField('Resource name','<input id="pccTitle" maxlength="220" placeholder="Style guide / Training video / Reference document" value="'+esc(x.title||'')+'">')+
  '<div id="pccResourceBody"></div>'+
  '<div class="ac-pcc-grid">'+asField('Folder','<select id="pccParent"><option value="">Library home</option>'+ (snap?.library||[]).filter(z=>z.kind==='folder'&&z.id!==x.id).map(z=>selectOpt(z.id,z.title,x.parent_id||'')).join('')+'</select>')+
  asField('Visible to','<select id="pccVisibility">'+selectOpt('contributors','Contributors and admins',x.visibility||'contributors')+selectOpt('admins','Admins only',x.visibility||'contributors')+'</select>')+'</div>'+
  '<div class="ac-pcc-grid">'+asField('Publication','<select id="pccPublished">'+selectOpt('true','Published',String(x.published??true))+selectOpt('false','Draft / hidden',String(x.published??true))+'</select>')+
  asField('Completion requirement','<select id="pccCompletion">'+selectOpt('none','Nothing required',x.completion_rule|| (x.required_ack?'acknowledge':'none'))+selectOpt('acknowledge','Must read and acknowledge',x.completion_rule|| (x.required_ack?'acknowledge':'none'))+selectOpt('watch','Must watch (uploaded video)',x.completion_rule||'none')+'</select>')+'</div>'+
  '<p class="ac-pcc-hint">Files are private. Uploads are limited to 50 MB each. You can upload multiple files in one operation. Resources are never shared with another project automatically.</p>';
}
function bodyEditor(value){
 return asField('Content','<div class="ac-pcc-editor-tools"><button data-toolbar="bold" type="button" title="Bold">B</button><button data-toolbar="italic" type="button">I</button><button data-toolbar="heading" type="button">Heading</button><button data-toolbar="list" type="button">• List</button><button data-toolbar="link" type="button">Link</button></div><textarea id="pccBody" maxlength="200000" placeholder="Write instructions, announcements, reference notes…">'+esc(value)+'</textarea>');
}
function showResourceType(existing){
 const value=$('pccKind')?.value||'text';const root=$('pccResourceBody');if(!root)return;
 if(value==='text')root.innerHTML=bodyEditor(existing?.body||'');
 if(value==='link')root.innerHTML=asField('HTTPS link','<input id="pccUrl" type="url" placeholder="https://…" value="'+esc(existing?.link_url||'')+'">')+asField('Description','<textarea id="pccBody" style="min-height:100px" placeholder="What is this link for?">'+esc(existing?.body||'')+'</textarea>');
 if(value==='folder')root.innerHTML='<div class="ac-pcc-note">Folders organize documents and files. Publish the folder before publishing contributor-visible content inside it.</div>';
 if(value==='file')root.innerHTML=(existing?.storage_path?'<div class="ac-pcc-note">Current uploaded file: '+esc(existing.storage_path.split('/').at(-1))+'</div>':'')+
  (existing?.mime_type?.startsWith('video/')?asField('Verified video duration (seconds)','<input id="pccVideoDuration" type="number" min="1" max="86400" step="0.01" value="'+esc(existing.video_duration_seconds||'')+'">'):'')+
  '<label class="ac-pcc-upload">Choose or drop files (50 MB each)<input id="pccFiles" type="file" '+(existing?'':'multiple')+'></label>'+
  asField('Notes (optional)','<textarea id="pccBody" style="min-height:90px" placeholder="Description for contributors">'+esc(existing?.body||'')+'</textarea>');
}
function showPreview(kind,id){
 const item=kind==='instruction'?snap?.guidelines.find(x=>x.id===id):kind==='announcement'?snap?.announcements.find(x=>x.id===id):snap?.library.find(x=>x.id===id);
 if(!item)return;
 const d=$('pccDialog');dialogKind='preview';editing=null;d.hidden=false;
 $('pccDrawerHeading').textContent='Contributor preview';
 $('pccDrawerDesc').textContent=(snap?.project?.name||'Project')+' · '+(item.published||item.status==='published'?'Published':'Not yet published');
 $('pccDrawerBody').innerHTML='<div class="ac-pcc-preview"><strong>'+esc(item.title||'Resource')+'</strong><hr style="border:0;border-top:1px solid var(--line);margin:15px 0"><div style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(item.body||item.link_url||'')+'</div></div><p class="ac-pcc-hint">Preview only. No notifications are sent.</p>';
 $('pccSave').hidden=true;document.body.style.overflow='hidden';
}
async function showCompletion(kind,id){
 try{
  const data=await rpc('admin_project_content_completion',{p_project_id:projectId,p_item_id:id,p_kind:kind});
  const d=$('pccDialog');dialogKind='completion';editing=null;d.hidden=false;
  $('pccDrawerHeading').textContent='Completion report';
  $('pccDrawerDesc').textContent=(snap?.project?.name||'Project')+' · '+data.completed+' of '+data.total+' complete';
  $('pccDrawerBody').innerHTML='<div class="ac-pcc-note"><strong>'+Number(data.completed)+' of '+Number(data.total)+' complete</strong><p>Current active project members.</p></div><h3>Pending contributors ('+Number((data.pending||[]).length)+')</h3>'+
  ((data.pending||[]).length?(data.pending||[]).map(u=>'<div class="ac-pcc-item"><div class="ac-pcc-copy"><strong>'+esc(u.display_name||'Contributor')+'</strong><p>'+esc(u.email||'')+'</p></div><span class="ac-pcc-pill muted">Pending</span></div>').join(''):'<div class="ac-pcc-note">No pending contributors.</div>')+
  '<h3>Completed ('+Number((data.completed_members||[]).length)+')</h3>'+((data.completed_members||[]).length?(data.completed_members||[]).map(u=>'<div class="ac-pcc-item"><div class="ac-pcc-copy"><strong>'+esc(u.display_name||'Contributor')+'</strong><p>'+esc(u.email||'')+'</p></div><span class="ac-pcc-pill">Completed</span></div>').join(''):'<div class="ac-pcc-note">Nobody has completed this requirement yet.</div>');
  $('pccSave').hidden=true;document.body.style.overflow='hidden';
 }catch(e){error(e)}
}
function openEditor(kind,item){
 if(!canEdit())return message('Project manager permission is required to publish content.',true);
 dialogKind=kind;editing=item||null;$('pccSave').hidden=false;
 const d=$('pccDialog');d.hidden=false;
 $('pccDrawerHeading').textContent=(item?'Edit ':'Add ')+(kind==='instructions'?'instructions':kind==='announcements'?'announcement':'library resource');
 $('pccDrawerDesc').textContent='Project · '+(projectCode||'—')+' · '+(snap?.project?.name||'');
 $('pccDrawerBody').innerHTML=editorHtml(kind,item);
 $('pccDrawerStatus').textContent='';
 $('pccSave').disabled=false;
 $('pccSave').textContent=item?'Save changes':'Publish / Save';
 if(kind==='library'){$('pccKind').addEventListener('change',()=>showResourceType(null));showResourceType(item)}
 if(kind==='announcements'&&item?.expires_at){const dt=new Date(item.expires_at);if(!isNaN(dt.valueOf())){$('pccExpires').value=new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16)}}
 document.body.style.overflow='hidden';
 setTimeout(()=>$('pccTitle')?.focus(),30);
}
function closeEditor(){if(writing)return;$('pccDialog').hidden=true;$('pccSave').hidden=false;document.body.style.overflow='';dialogKind=null;editing=null}
async function trustedVideoDuration(file){
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file),player=document.createElement('video');
  let completed=false;
  const finish=(err,value)=>{if(completed)return;completed=true;clearTimeout(timer);player.removeAttribute('src');player.load();URL.revokeObjectURL(url);if(err)reject(err);else resolve(value)};
  const timer=setTimeout(()=>finish(Error('Could not read video duration within 15 seconds. Use a supported video file.')),15000);
  player.preload='metadata';
  player.onloadedmetadata=()=>{
   const d=Number(player.duration);
   if(!Number.isFinite(d)||d<1||d>86400)return finish(Error('Video needs a valid duration from 1 second to 24 hours.'));
   finish(null,Math.round(d*100)/100);
  };
  player.onerror=()=>finish(Error('Could not read video metadata; upload an MP4/WebM with a valid duration.'));
  player.src=url;
 });
}
async function uploadResourceFiles(files,common){
 let done=0,first=null;
 for(const file of files){
  if(file.size>52428800)throw Error(file.name+' exceeds the 50 MB limit');
  if(!file.size)throw Error(file.name+' is empty');
  const duration=file.type.startsWith('video/')?await trustedVideoDuration(file):null;
  const path=projectId+'/'+crypto.randomUUID()+'/'+cleanFileName(file.name);
  $('pccDrawerStatus').textContent='Uploading '+file.name+' ('+(done+1)+'/'+files.length+')…';
  const up=await db.storage.from(BUCKET).upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
  if(up.error)throw Error('Upload failed for '+file.name+': '+up.error.message);
  try{
   const a=await rpc('admin_project_content_save_library',{
    p_project_id:projectId,p_kind:'file',p_title:files.length>1||!common.title?file.name:common.title,
    p_body:common.body,p_parent_id:common.parent,p_storage_path:path,p_link_url:null,
    p_required_ack:common.ack,p_visibility:common.visibility,p_published:common.published,
    p_existing_id:null,p_sort_order:0
   });await rpc('admin_project_library_requirement',{p_project_id:projectId,p_item_id:a,p_rule:common.rule,p_mime_type:file.type||null});if(duration!==null)await rpc('admin_project_library_set_duration',{p_project_id:projectId,p_item_id:a,p_seconds:duration});first=first||a;done++;
  }catch(e){await db.storage.from(BUCKET).remove([path]).catch(()=>{});throw e}
 }
 return done;
}
async function saveEditor(){
 if(writing)return;writing=true;$('pccSave').disabled=true;$('pccSave').textContent='Saving…';
 try{
  const kind=dialogKind,entry=editing;
  const title=$('pccTitle')?.value.trim()||'',body=$('pccBody')?.value||'',ack=$('pccAck')?.checked||false;
  const published=$('pccPublished')?.value==='true';
  if(!title)throw Error('Please enter a name or title.');
  if(kind==='instructions'){
   if(!body.trim())throw Error('Write the project instructions before saving.');
   await rpc('admin_project_content_save_guideline',{p_project_id:projectId,p_title:title,p_body:body,p_required:ack,p_publish:published,p_existing_id:entry?.id||null});
  }else if(kind==='announcements'){
   if(!body.trim())throw Error('Write the announcement before saving.');
   const expiry=$('pccExpires')?.value?new Date($('pccExpires').value).toISOString():null;
   await rpc('admin_project_announcement_publish',{p_project_id:projectId,p_title:title,p_body:body,p_severity:$('pccSeverity').value,p_requires_ack:ack,p_expires_at:expiry,p_existing_id:entry?.id||null,p_publish:published});
  }else if(kind==='library'){
   const type=$('pccKind').value,visibility=$('pccVisibility').value,parent=$('pccParent').value||null,url=$('pccUrl')?.value.trim()||null;
   const rule=$('pccCompletion')?.value||'none';if(rule==='watch'&&type!=='file')throw Error('Must watch applies only to uploaded video.');const common={title,body,ack:rule==='acknowledge',rule,published,parent,visibility};
   if(type==='file'){
    const files=Array.from($('pccFiles')?.files||[]);
    if(files.length>0&&entry)throw Error('Editing an existing file cannot replace its binary. Add a new resource instead.');
    if(files.length>0){if(rule==='watch'&&files.some(x=>!x.type.startsWith('video/')))throw Error('Must watch requires uploaded videos.');await uploadResourceFiles(files,common);}
    else if(entry?.storage_path){
     await rpc('admin_project_content_save_library',{p_project_id:projectId,p_kind:'file',p_title:title,p_body:body,p_link_url:null,p_storage_path:entry.storage_path,p_parent_id:parent,p_required_ack:rule==='acknowledge',p_visibility:visibility,p_published:published,p_existing_id:entry.id,p_sort_order:entry.sort_order||0});await rpc('admin_project_library_requirement',{p_project_id:projectId,p_item_id:entry.id,p_rule:rule,p_mime_type:entry.mime_type||null});if(entry.mime_type?.startsWith('video/')&&$('pccVideoDuration')?.value){await rpc('admin_project_library_set_duration',{p_project_id:projectId,p_item_id:entry.id,p_seconds:Number($('pccVideoDuration').value)});}
    }else throw Error('Choose a file to upload.');
   }else{
    if(type==='link'&&!/^https?:\/\/\S+$/i.test(url||''))throw Error('Enter an https:// or http:// link.');
    const saved=await rpc('admin_project_content_save_library',{p_project_id:projectId,p_kind:type,p_title:title,p_body:type==='folder'?'':body,
     p_link_url:type==='link'?url:null,p_storage_path:null,p_parent_id:parent,p_required_ack:ack,p_visibility:visibility,p_published:published,p_existing_id:entry?.id||null,p_sort_order:entry?.sort_order||0});await rpc('admin_project_library_requirement',{p_project_id:projectId,p_item_id:saved,p_rule:rule,p_mime_type:null});
   }
  }
  writing=false;closeEditor();await refresh();message('Saved successfully. Only this project was updated.');
 }catch(e){$('pccDrawerStatus').textContent=e.message||String(e);error(e)}
 finally{writing=false;$('pccSave').disabled=false;$('pccSave').textContent='Publish / Save'}
}
async function archive(kind,id){
 const item=kind==='library'?snap?.library.find(x=>x.id===id):snap?.announcements.find(x=>x.id===id);
 if(!item||!canEdit())return;
 if(!confirm((kind==='library'?'Remove this resource':'Expire this announcement')+' for '+(snap.project?.name||'this project')+'?'))return;
 try{
  if(kind==='library'&&item.kind==='file'&&item.storage_path){
   const rm=await db.storage.from(BUCKET).remove([item.storage_path]);if(rm.error)throw Error('File delete failed: '+rm.error.message);
  }
  await rpc('admin_project_content_archive',{p_project_id:projectId,p_kind:kind,p_id:id});
  await refresh();message(kind==='announcement'?'Announcement expired.':'Library resource removed.');
 }catch(e){error(e)}
}
async function openFile(id){
 const entry=snap?.library.find(x=>x.id===id);if(!entry||entry.kind!=='file')return;
 try{
  const {data,error:e}=await db.storage.from(BUCKET).createSignedUrl(entry.storage_path,120);
  if(e||!data?.signedUrl)throw Error(e?.message||'Could not create file link');
  window.open(data.signedUrl,'_blank','noopener,noreferrer');
 }catch(e){error(e)}
}
async function boot(){
 try{
  const {data}=await db.from('project_lab').select('project_code').eq('id',projectId).maybeSingle();
  projectCode=data?.project_code||window.AdProjectCodes?.get(projectId)||'';
 }catch(_){}
 for(let i=0;i<100;i++){
  if(ensureUi()){initialized=true;break}
  await new Promise(r=>setTimeout(r,110));
 }
 if(!initialized)return;
 const h=location.hash.replace('#','');
 const initial=tabs.find(x=>x[2]===h);
 if(initial)active=initial[0];
 if(h==='ac-library')active='library';
 if(h==='ac-instructions')active='instructions';
 if(h==='ac-announcements')active='announcements';
 // Avoid fetching the entire content library while merely opening project Overview/Settings.
 if(['instructions','library','announcements'].includes(active)){await refresh();go(active)}
 else{
  syncTabs(active);
  const title=document.getElementById('topTitle')?.textContent;
  if(title&&title!=='Project Lab')$('pccName').textContent=title;
  $('pccMeta').textContent='Project · '+(projectCode||'—')+' · Content is loaded when opened';
 }
 document.addEventListener('click',e=>{
  const b=e.target.closest('.lab-nav [data-view]');
  if(!b)return;const t=tabs.find(x=>x[2]===b.dataset.view);if(t){active=t[0];syncTabs(active);if(t[2].startsWith('ac-'))render(active)}
 },true);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&['instructions','library','announcements'].includes(active))refresh()});
}
boot().catch(error);
})();