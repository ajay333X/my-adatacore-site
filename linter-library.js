(()=>{'use strict';
if(window.__adatacoreLinterLibrary)return;window.__adatacoreLinterLibrary=true;
const URL='https://llmhyezgcnbognmmsnzq.supabase.co',KEY='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const db=supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let snap=null,activeId=null,projectId=Number(new URLSearchParams(location.search).get('project'))||null,busy=false,admin=null;
async function rpc(name,args){const r=await db.rpc(name,args);if(r.error)throw Error(r.error.message);return r.data}
function notify(text,bad=false){const box=$('alert');box.textContent=text;box.className=bad?'bad':'';box.style.display='block';clearTimeout(notify.t);notify.t=setTimeout(()=>box.style.display='none',6500)}
function messageErr(e){notify(e?.message||String(e),true)}
async function reload(){
 let next;
 try{next=await rpc('linter_library_snapshot',{p_project:projectId})}
 catch(e){if(!projectId&&admin?.projects?.length){projectId=Number(admin.projects[0].id);next=await rpc('linter_library_snapshot',{p_project:projectId})}else throw e}
 snap=next;render();
}
function render(){
 if(!snap)return;
 const canEdit=!!snap.can_edit_library,canAssign=!!snap.can_assign&&!!projectId;
 const attached=new Set((snap.assignments||[]).map(x=>x.linter_id));
 $('newLinter').disabled=!canEdit;$('testButton').disabled=!projectId;
 $('profileCount').textContent=snap.profiles.length;
 $('attachedCount').textContent=attached.size;
 $('blockingCount').textContent=new Set(snap.profiles.filter(p=>attached.has(p.id)&&p.is_active).flatMap(p=>p.rules.filter(r=>r.enabled&&r.severity==='block').map(r=>r.code))).size;
 $('libraryMeta').textContent=snap.profiles.length+' reusable profile'+(snap.profiles.length===1?'':'s');
 const picker=$('projectPicker');const current=projectId;
 picker.innerHTML='<option value="">Choose a project…</option>'+snap.projects.map(p=>'<option value="'+p.id+'"'+(Number(p.id)===current?' selected':'')+'>'+esc(p.name)+' · #'+p.id+'</option>').join('');
 $('profileList').innerHTML=snap.profiles.map(p=>{
  const on=attached.has(p.id),active=p.is_active;
  const ruleCount=p.rules.filter(r=>r.enabled).length;
  const blocks=p.rules.filter(r=>r.enabled&&r.severity==='block').length;
  return '<article class="preset"><div class="preset-head"><div><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||'No description')+'</p></div><span class="badge '+(on?'active':'muted')+'">'+(on?'Attached':'Not attached')+'</span></div>'+
   '<div class="badges"><span class="badge">'+esc(p.language.toUpperCase())+'</span><span class="badge">'+ruleCount+' active rules</span>'+
   (blocks?'<span class="badge">'+blocks+' blocking</span>':'<span class="badge warning">Warnings only</span>')+
   (!active?'<span class="badge muted">Disabled globally</span>':'')+'</div>'+
   '<div class="rule-preview">'+p.rules.filter(r=>r.enabled).map(r=>esc((snap.catalog.find(x=>x.code===r.code)||{}).name||r.code)).join(' · ')+'</div>'+
   '<div class="preset-actions">'+(canAssign?(on?
    '<button class="btn small danger" data-action="detach" data-id="'+p.id+'">Remove from project</button>':
    '<button class="btn small primary" data-action="attach" data-id="'+p.id+'" '+(!active?'disabled title="Disabled in the shared library"':'')+'>+ Attach to project</button>'):'')+
   (canEdit?'<button class="btn small" data-action="edit" data-id="'+p.id+'">Edit profile</button><button class="btn small danger" data-action="delete" data-id="'+p.id+'" '+(on?'disabled title="Detach first"':'')+'>Delete</button>':'')+
   (!canAssign&&!canEdit?'<span class="hint">Read only</span>':'')+'</div></article>'
 }).join('')||'<div class="empty">No linters yet. Create one to begin.</div>';
}
function openEditor(p){
 if(!snap?.can_edit_library)return;
 activeId=p?.id||null;
 $('editorTitle').textContent=p?'Edit linter':'Create linter';
 $('profileName').value=p?.name||'';$('profileDescription').value=p?.description||'';
 $('profileLanguage').value=p?.language||'hi';$('profileActive').checked=p?.is_active!==false;
 const selected=new Map((p?.rules||[]).map(r=>[r.code,r]));
 $('ruleEditor').innerHTML=snap.catalog.map(rule=>{
  const curr=selected.get(rule.code),on=curr?.enabled===true;
  return '<div class="rule-edit" data-code="'+esc(rule.code)+'"><input aria-label="Enable '+esc(rule.name)+'" type="checkbox" data-rule-enable '+(on?'checked':'')+'><div><strong>'+esc(rule.name)+'</strong><p>'+esc(rule.description)+'</p></div><select aria-label="Severity for '+esc(rule.name)+'" data-rule-severity><option value="block" '+(curr?.severity==='block'?'selected':'')+'>Block</option><option value="warn" '+(curr?.severity!=='block'?'selected':'')+'>Warn</option></select></div>';
 }).join('');
 $('editorDialog').showModal();
}
function closeEditor(){$('editorDialog').close();activeId=null}
async function saveEditor(e){
 e.preventDefault();if(busy)return;
 const rules=[...$('ruleEditor').querySelectorAll('[data-code]')].map(el=>({code:el.dataset.code,severity:el.querySelector('[data-rule-severity]').value,enabled:el.querySelector('[data-rule-enable]').checked})).filter(x=>x.enabled);
 if(!rules.length){notify('Select at least one rule.',true);return}
 busy=true;$('saveLinter').disabled=true;
 try{
  await rpc('linter_save_profile',{p_id:activeId,p_name:$('profileName').value,p_description:$('profileDescription').value,p_language:$('profileLanguage').value,p_rules:rules,p_active:$('profileActive').checked});
  closeEditor();await reload();notify('Linter profile saved. Changes apply to every project where it is attached.');
 }catch(e){messageErr(e)}finally{busy=false;$('saveLinter').disabled=false}
}
async function projectAction(action,id){
 if(busy)return;const p=snap.profiles.find(x=>x.id===id);if(!p)return;
 if(action==='edit'){openEditor(p);return}
 if(action==='delete'&&!confirm('Delete "'+p.name+'"? This cannot be undone. Remove it from every project first.'))return;
 busy=true;
 try{
  if(action==='delete')await rpc('linter_delete_profile',{p_id:id});
  if(action==='attach'||action==='detach')await rpc('linter_set_project',{p_project:projectId,p_linter:id,p_attach:action==='attach'});
  await reload();notify(action==='attach'?'Linter attached to this project. New submissions now use its rules.':action==='detach'?'Linter removed from this project only.': 'Linter removed from library.');
 }catch(e){messageErr(e)}finally{busy=false}
}
async function test(){
 if(!projectId)return notify('Choose a project before testing.',true);
 const text=$('testText').value;
 $('testButton').disabled=true;$('testResults').innerHTML='<div class="hint">Checking…</div>';
 try{
  const result=await rpc('linter_validate_texts',{p_project:projectId,p_segments:[{transcript:text}]});
  const issues=Array.isArray(result)?result:[];
  $('testResults').innerHTML=!issues.length?'<div class="result" style="color:#27845e">✓ No issues found under this project’s attached linters.</div>':
   issues.map(x=>'<div class="result '+(x.severity==='warn'?'warn':'')+'"><strong>'+(x.severity==='block'?'BLOCK':'WARNING')+' · '+esc(x.code)+'</strong>'+esc(x.message)+'</div>').join('');
 }catch(e){$('testResults').textContent=e.message}finally{$('testButton').disabled=false}
}
$('projectPicker').addEventListener('change',async e=>{projectId=Number(e.target.value)||null;const url=new URL(location.href);if(projectId)url.searchParams.set('project',projectId);else url.searchParams.delete('project');history.replaceState(null,'',url);$('testResults').innerHTML='';try{await reload()}catch(e){messageErr(e)}});
$('newLinter').onclick=()=>openEditor(null);
$('closeEditor').onclick=$('cancelEditor').onclick=closeEditor;
$('linterForm').addEventListener('submit',saveEditor);
$('profileList').onclick=e=>{const btn=e.target.closest('[data-action]');if(btn)projectAction(btn.dataset.action,btn.dataset.id)};
$('testButton').onclick=test;
(async()=>{const {data:{user}}=await db.auth.getUser();if(!user)return location.replace('/auth');admin=await rpc('get_my_admin_access',{});if(!admin?.allowed)return location.replace('/workspace');await reload()})().catch(e=>{messageErr(e);$('profileList').innerHTML='<div class="empty">Unable to load Linter Library. '+esc(e.message)+'</div>'});
})();