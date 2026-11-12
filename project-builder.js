(()=>{
'use strict';
const $=id=>document.getElementById(id);
const P=new URLSearchParams(location.search);
const db=window.supabase?.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',{auth:{persistSession:true,autoRefreshToken:true}});
const lib=window.ACBuilderPalette;
let projectId=Number(P.get('project')||0),project=null,record=null,editor=null,dirty=false,saving=false,noticeTimer=0;
const slug=s=>String(s||'page').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,38)||'page';
const esc=s=>lib.escape(s);
const typeTemplate={voice_recording:'voice',transcription:'transcription',audio_evaluation:'evaluation',qa_review:'evaluation',text_annotation:'annotation',image_annotation:'annotation',video_annotation:'annotation',survey:'survey',custom:'blank'};
const policy="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'";
function toast(text){
 const node=$('builderToast');node.textContent=text;node.classList.add('show');
 clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>node.classList.remove('show'),4500);
}
function status(text,kind){const el=$('saveState');el.textContent=text;el.dataset.status=kind}
function changed(){if(!editor||!project)return;dirty=true;status('● Unsaved changes','dirty')}
function showWelcome(){
 $('projectWelcome').hidden=false;$('editorShell').hidden=true;
 $('saveDraft').hidden=$('publishDesign').hidden=$('saveState').hidden=$('newProject').hidden=true;
 $('projectName').textContent='Create project';$('projectCode').textContent='Visual workspace';
 void listProjects();
}
async function listProjects(){
 const {data,error}=await db.from('project_lab').select('id,project_name,project_code,project_type').order('created_at',{ascending:false}).limit(100);
 const host=$('projectCatalog');host.replaceChildren();
 if(error){host.textContent=error.message;return}
 if(!data?.length){host.textContent='No existing projects. Create your first one.';return}
 for(const project of data){
  const button=document.createElement('button');button.type='button';button.className='catalog-item';
  const left=document.createElement('div'),title=document.createElement('strong'),code=document.createElement('small'),type=document.createElement('span');
  title.textContent=project.project_name;code.textContent=project.project_code;type.textContent=project.project_type||'custom';type.className='cat-type';
  left.append(title,code);button.append(left,type);
  button.onclick=()=>location.assign('/admin/project-builder?project='+project.id);
  host.append(button);
 }
}
function wizard(){
 $('newType').onchange=()=>{$('newTemplate').value=typeTemplate[$('newType').value]||'blank'};
 $('createForm').onsubmit=async event=>{
  event.preventDefault();const name=$('newName').value.trim();
  if(name.length<3){toast('Enter a project name of at least three characters.');return}
  const btn=$('createSubmit');btn.disabled=true;btn.textContent='Creating…';
  const template=$('newTemplate').value;
  try{
   const {data,error}=await db.from('project_lab').insert({
    project_name:name,description:$('newDescription').value.trim(),project_type:$('newType').value,
    config:{builder_template:template},style_config:{},l1_rate:0,l2_rate:0,is_published:false,lifecycle_status:'active'
   }).select('id').single();
   if(error)throw error;
   location.assign('/admin/project-builder?project='+data.id+'&template='+template);
  }catch(e){toast('Unable to create project: '+e.message);btn.disabled=false;btn.textContent='Create project & open builder →'}
 };
}
async function loadProject(){
 const [p,b]=await Promise.all([
  db.from('project_lab').select('id,project_name,description,project_type,project_code,config').eq('id',projectId).single(),
  db.from('project_visual_builds').select('*').eq('project_id',projectId).maybeSingle()
 ]);
 if(p.error||b.error)throw p.error||b.error;
 project=p.data;record=b.data||{draft:{},published:{}};
 $('projectName').textContent=project.project_name;$('projectCode').textContent=project.project_code;
 $('projectWelcome').hidden=true;$('editorShell').hidden=false;
 $('saveDraft').hidden=$('publishDesign').hidden=$('saveState').hidden=$('newProject').hidden=false;
 startEditor();
}
function startEditor(){
 const saved=record?.draft?.projectData||record?.published?.projectData||null;
 const template=P.get('template')||project.config?.builder_template||typeTemplate[project.project_type]||'blank';
 const pages=saved?[]:lib.seed(project,template);
 const sectors=[
  {name:'Layout & dimension',open:true,buildProps:['display','width','min-height','height','max-width','margin','padding','gap','flex-direction','justify-content','align-items','position']},
  {name:'Typography',open:false,buildProps:['font-family','font-size','font-weight','line-height','letter-spacing','text-align','color']},
  {name:'Background',open:false,buildProps:['background-color','background-image','background-size','background-position']},
  {name:'Borders & effects',open:false,buildProps:['border','border-radius','box-shadow','opacity','overflow']}
 ];
 editor=grapesjs.init({
  container:'#gjs',height:'100%',fromElement:false,storageManager:false,noticeOnUnload:false,
  panels:{defaults:[]},
  pageManager:pages.length?{pages}:{},
  blockManager:{appendTo:'#gjs-blocks',blocks:lib.blocks.map(b=>({id:b[0],label:b[1],category:b[2],content:b[3],media:'<span style="font-size:20px">'+b[4]+'</span>'}))},
  layerManager:{appendTo:'#gjs-layers'},
  styleManager:{appendTo:'#gjs-styles',sectors},
  traitManager:{appendTo:'#gjs-traits'},
  deviceManager:{devices:[{name:'Desktop',width:''},{name:'Tablet',width:'768px',widthMedia:'880px'},{name:'Mobile',width:'390px',widthMedia:'560px'}]},
  assetManager:{upload:false,autoAdd:1}
 });
 if(saved)editor.loadProjectData(saved);
 if(!editor.Pages.getAll().length)editor.Pages.add(lib.seed(project,'blank')[0]);
 const first=editor.Pages.getAll()[0];if(first)editor.Pages.select(first);
 editor.on('update',changed);
 editor.on('page',()=>{renderPages();titlePage();changed()});
 editor.on('page:select',()=>{renderPages();titlePage()});
 renderPages();titlePage();setupWidgets();bindButtons();
 dirty=false;status(saved?'✓ Saved draft loaded':'New design · not yet saved','saved');
}
function pid(page){return page.getId?page.getId():page.id}
function orderedPages(){const pages=editor.Pages.getAll();return pages.slice().sort((a,b)=>Number(a.get('acOrder')??pages.indexOf(a))-Number(b.get('acOrder')??pages.indexOf(b)))}
function titlePage(){
 const p=editor.Pages.getSelected();if(!p)return;
 $('currentPageName').textContent=p.get('name')||'Page';$('currentPageSlug').textContent='/'+pid(p);
}
function renderPages(){
 if(!editor)return;const host=$('pageList');host.replaceChildren();
 for(const p of orderedPages()){
  const row=document.createElement('div');row.className='page-item'+(p===editor.Pages.getSelected()?' selected':'');row.draggable=true;
  const icon=document.createElement('span');icon.className='page-ico';icon.textContent='▤';
  const open=document.createElement('button');open.type='button';open.className='page-open';open.textContent=p.get('name')||pid(p);open.onclick=()=>editor.Pages.select(p);
  const actions=document.createElement('span');actions.className='page-actions';
  for(const [symbol,label,handler] of [['✎','Rename page',()=>renamePage(p)],['⧉','Duplicate page',()=>duplicatePage(p)],['×','Delete page',()=>deletePage(p)]]){
   const b=document.createElement('button');b.type='button';b.textContent=symbol;b.title=label;b.onclick=handler;actions.append(b)
  }
  row.append(icon,open,actions);
  row.ondragstart=e=>e.dataTransfer.setData('application/x-acpage',pid(p));
  row.ondragover=e=>{if([...e.dataTransfer.types].includes('application/x-acpage'))e.preventDefault()};
  row.ondrop=e=>{
   const from=e.dataTransfer.getData('application/x-acpage');if(!from||from===pid(p))return;e.preventDefault();
   const list=orderedPages(),source=list.findIndex(x=>pid(x)===from),target=list.indexOf(p);
   if(source<0||target<0)return;const page=list.splice(source,1)[0];list.splice(target,0,page);
   list.forEach((pg,i)=>pg.set('acOrder',i));renderPages();changed();
  };
  host.append(row);
 }
}
function uniqueName(base){const names=editor.Pages.getAll().map(p=>String(p.get('name')).toLowerCase());let v=base,n=2;while(names.includes(v.toLowerCase()))v=base+' '+n++;return v}
function uniqueId(name){const base=slug(name);let id=base,n=2;while(editor.Pages.get(id))id=base+'-'+n++;return id}
function modal(title,fields,action,fn){
 const dialog=$('builderDialog');$('builderDialogTitle').textContent=title;$('dialogFields').replaceChildren();$('dialogInfo').textContent='';
 for(const field of fields){
  if(field.note){const p=document.createElement('p');p.className='danger-note';p.textContent=field.note;$('dialogFields').append(p);continue}
  const label=document.createElement('label'),input=document.createElement('input');label.textContent=field.label;label.htmlFor=field.id;
  input.id=field.id;input.value=field.value||'';input.maxLength=75;$('dialogFields').append(label,input);
 }
 const close=()=>dialog.close();$('dialogClose').onclick=$('dialogCancel').onclick=close;
 $('dialogApply').textContent=action;
 $('dialogApply').onclick=()=>{
  try{fn(Object.fromEntries(fields.filter(f=>f.id).map(f=>[f.id,$(f.id).value])));close()}
  catch(e){$('dialogInfo').textContent=e.message}
 };
 dialog.showModal();$('dialogFields input')?.focus();
}
function confirmation(title,message,action,verb='Continue'){modal(title,[{note:message}],verb,action)}
function addPage(){
 modal('Add new page',[{id:'newPageLabel',label:'Page name',value:'New page'}],'Create page',v=>{
  if(!v.newPageLabel.trim())throw Error('A page name is required.');
  const name=uniqueName(v.newPageLabel.trim()),page=editor.Pages.add({
   id:uniqueId(name),name,component:lib.wrap('<div class="ac-kicker">NEW PAGE</div><h1 class="ac-title">'+esc(name)+'</h1><p class="ac-lead">Add elements from the block library.</p>'),styles:lib.css
  });page.set('acOrder',editor.Pages.getAll().length-1);editor.Pages.select(page);changed();
 });
}
function renamePage(page){
 modal('Rename page',[{id:'renameLabel',label:'Page name',value:page.get('name')||'Page'}],'Rename',v=>{
  if(!v.renameLabel.trim())throw Error('A page name is required.');page.set('name',v.renameLabel.trim().slice(0,75));renderPages();titlePage();changed();
 });
}
function duplicatePage(page){
 const component=page.getMainComponent(),name=uniqueName((page.get('name')||'Page')+' copy');
 const clone=editor.Pages.add({id:uniqueId(name),name,component:editor.getHtml({component}),styles:editor.getCss({component})});
 editor.Pages.select(clone);changed();
}
function deletePage(page){
 if(editor.Pages.getAll().length<=1){toast('Keep at least one page in your project.');return}
 confirmation('Delete page?','Delete "'+(page.get('name')||pid(page))+'" from your draft? The published version remains until republished.',()=>{
  const active=editor.Pages.getSelected()===page;editor.Pages.remove(page);
  if(active)editor.Pages.select(editor.Pages.getAll()[0]);renderPages();changed()
 },'Delete page');
}
function setupWidgets(){
 const host=$('widgetShortcuts');host.replaceChildren();let previous='';
 for(const block of lib.blocks.filter(b=>['Audio','Media','Evaluation','Workflow'].includes(b[2]))){
  if(block[2]!==previous){const head=document.createElement('div');head.className='widget-group-head';head.textContent=block[2];host.append(head);previous=block[2]}
  const button=document.createElement('button');button.className='widget-shortcut';button.type='button';
  const h=document.createElement('strong');h.textContent=block[1];const p=document.createElement('small');p.textContent='Insert editable '+block[1].toLowerCase()+' component';
  button.append(h,p);button.onclick=()=>{
   const selected=editor.getSelected(),candidate=selected&&['main','section','div','article','aside'].includes(selected.get('tagName'))?selected:editor.getWrapper();
   const nodes=candidate.append(block[3]);if(nodes?.[0])editor.select(nodes[0]);changed();
   toast(block[1]+' added to the canvas.');
  };host.append(button);
 }
}
function bindButtons(){
 $('pageAdd').onclick=addPage;
 $('undoBtn').onclick=()=>editor.UndoManager.undo();$('redoBtn').onclick=()=>editor.UndoManager.redo();
 $('deleteLayer').onclick=()=>{const node=editor.getSelected();if(!node||node===editor.getWrapper())return toast('Select an element to delete.');node.remove();changed()};
 $('duplicateLayer').onclick=()=>{
  const sel=editor.getSelected(),parent=sel?.parent(),collection=parent?.components();
  if(!sel||!collection)return toast('Select an element to duplicate.');
  const copy=sel.clone();collection.add(copy,{at:collection.indexOf(sel)+1});editor.select(copy);changed();
 };
 for(const btn of document.querySelectorAll('[data-device]'))btn.onclick=()=>{
  document.querySelectorAll('[data-device]').forEach(b=>b.classList.toggle('active',b===btn));editor.setDevice(btn.dataset.device)
 };
 for(const btn of document.querySelectorAll('[data-inspect]'))btn.onclick=()=>{
  document.querySelectorAll('[data-inspect]').forEach(b=>b.classList.toggle('selected',b===btn));
  for(const key of ['styles','traits','layers'])$(key+'Panel').classList.toggle('selected',btn.dataset.inspect===key)
 };
 for(const btn of document.querySelectorAll('[data-side]'))btn.onclick=()=>{
  document.querySelectorAll('[data-side]').forEach(b=>b.classList.toggle('selected',b===btn));
  $('blockPanel').classList.toggle('selected',btn.dataset.side==='blocks');$('widgetPanel').classList.toggle('selected',btn.dataset.side==='components')
 };
 $('blockSearch').oninput=()=>{
  const query=$('blockSearch').value.trim().toLowerCase();
  for(const node of document.querySelectorAll('#gjs-blocks .gjs-block'))node.style.display=!query||node.textContent.toLowerCase().includes(query)?'':'none';
 };
 $('previewBtn').onclick=showPreview;$('previewClose').onclick=()=>$('previewDialog').close();
 $('saveDraft').onclick=()=>void save(false);
 $('publishDesign').onclick=()=>confirmation('Publish pages?','This publishes the designed pages for assigned users. It does not replace existing transcription, recording, or QA engines. New task processing requires a configured backend.',()=>void save(true),'Publish pages');
 $('newProject').onclick=()=>{if(!dirty)return location.assign('/admin/project-builder');confirmation('Discard unsaved changes?','Save the draft to keep your changes before creating another project.',()=>location.assign('/admin/project-builder'),'Discard draft')};
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
 document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();void save(false)}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName||'')){
   e.preventDefault();e.shiftKey?editor.UndoManager.redo():editor.UndoManager.undo()
  }
 });
 const upload=document.createElement('button');upload.type='button';upload.className='canvas-control';upload.textContent='＋ Image';
 $('previewBtn').before(upload);
 const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp,image/gif';file.hidden=true;document.body.append(file);
 upload.onclick=()=>file.click();
 file.onchange=async()=>{
  const f=file.files?.[0];if(!f)return;
  const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[f.type];
  if(!ext||f.size>3145728)return toast('Use PNG, JPEG, WebP or GIF images under 3 MB.');
  upload.disabled=true;upload.textContent='Uploading…';
  try{
   const path=projectId+'/builder-'+Date.now()+'.'+ext;
   const {error}=await db.storage.from('project-ui-assets').upload(path,f,{contentType:f.type,upsert:false});
   if(error)throw error;
   const url=db.storage.from('project-ui-assets').getPublicUrl(path).data.publicUrl;
   editor.AssetManager.add({src:url,type:'image',name:f.name});
   editor.getWrapper().append('<img src="'+esc(url)+'" style="width:100%;max-width:600px;border-radius:13px">');
   changed();toast('Image added to the page.');
  }catch(e){toast('Image upload failed: '+e.message)}
  finally{upload.disabled=false;upload.textContent='＋ Image';file.value=''}
 };
}
function exported(){
 const pages=orderedPages().map(p=>{
  const component=p.getMainComponent();
  return {id:pid(p),name:String(p.get('name')||'Page').slice(0,80),html:editor.getHtml({component}).slice(0,250000),css:editor.getCss({component}).slice(0,150000)}
 });
 return {schema:1,projectData:editor.getProjectData(),pages,savedAt:new Date().toISOString()};
}
async function save(publish){
 if(saving||!editor)return;saving=true;$('saveDraft').disabled=$('publishDesign').disabled=true;status(publish?'Publishing pages…':'Saving draft…','saving');
 try{
  const payload=exported();
  if(payload.pages.length>40)throw Error('Maximum 40 pages per project.');
  if(new Blob([JSON.stringify(payload)]).size>1750000)throw Error('Design too large. Remove oversized assets.');
  const {data:{user}}=await db.auth.getUser();if(!user)throw Error('Sign-in required');
  const values={project_id:projectId,draft:payload,updated_by:user.id,updated_at:new Date().toISOString()};
  if(publish){values.published=payload;values.published_at=new Date().toISOString()}
  const request=record?.project_id?db.from('project_visual_builds').update(values).eq('project_id',projectId):db.from('project_visual_builds').insert({...values,published:publish?payload:{}});
  const {data,error}=await request.select('*').single();if(error)throw error;
  record=data;dirty=false;status(publish?'✓ Published · '+payload.pages.length+' pages':'✓ Draft saved','saved');
  toast(publish?'Published '+payload.pages.length+' pages. The task engine remains unchanged.':'Draft saved; contributor pages are unchanged.');
 }catch(e){status('● Save failed','dirty');toast('Save failed: '+e.message)}
 finally{saving=false;$('saveDraft').disabled=$('publishDesign').disabled=false}
}
function pageDocument(html,css){
 const safe=String(html||'').replace(/<script\b[\s\S]*?<\/script\s*>/gi,'').replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,'');
 return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+policy+'"><style>'+lib.css+'</style><style>'+String(css||'').replace(/<\/style/gi,'<\\/style')+'</style></head><body>'+safe+'</body></html>';
}
function showPreview(){
 const page=editor.Pages.getSelected();if(!page)return;
 $('previewTitle').textContent=page.get('name')||'Page';const component=page.getMainComponent();
 $('previewIframe').srcdoc=pageDocument(editor.getHtml({component}),editor.getCss({component}));
 $('previewDialog').showModal();
}
async function boot(){
 wizard();
 if(!db||!lib||!window.grapesjs){$('builderAuth').innerHTML='<strong>Visual Builder could not load.</strong><p>Please check internet access and reload.</p>';return}
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user)return location.replace('/auth');
 const {data:access,error:denied}=await db.rpc('get_my_admin_access');
 if(denied||!access?.is_super_admin)return location.replace('/admin');
 $('builderAuth').hidden=true;$('builderApp').hidden=false;
 if(!projectId)return showWelcome();
 try{await loadProject()}catch(e){showWelcome();toast('Could not open project: '+e.message)}
}
boot().catch(e=>{$('builderAuth').textContent='Unable to initialize Project Builder: '+e.message});
})();