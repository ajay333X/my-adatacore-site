(()=>{'use strict';
if(window.__adatacoreLinterLibrary)return;window.__adatacoreLinterLibrary=true;
const API='https://llmhyezgcnbognmmsnzq.supabase.co',KEY='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const db=supabase.createClient(API,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const customTypes=[
 ['FORBIDDEN_TEXT','Disallow text or phrase'],
 ['FORBIDDEN_TERMS','Disallow list of terms'],
 ['SPELLING_REPLACEMENT','Suggest a spelling correction'],
 ['REQUIRED_TEXT','Require text in every segment'],
 ['MAX_LENGTH','Maximum segment length']
];
const isCustom=code=>customTypes.some(x=>x[0]===code);
const CUSTOM_MAX=40;
let snap=null,admin=null,projectId=Number(new URLSearchParams(location.search).get('project'))||null;
let activeId=null,busy=false,customRows=[],testChoice='';
async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data}
function notify(text,bad=false){const box=$('alert');box.textContent=String(text);box.className=bad?'bad':'';box.style.display='block';clearTimeout(notify.timer);notify.timer=setTimeout(()=>box.style.display='none',7500)}
const err=e=>notify(e?.message||String(e),true);
async function reload(){
 let next;
 try{next=await rpc('linter_library_snapshot',{p_project:projectId})}
 catch(error){
  if(!projectId&&admin?.projects?.length){
   projectId=Number(admin.projects[0].id);
   next=await rpc('linter_library_snapshot',{p_project:projectId});
  }else throw error;
 }
 snap=next;render();
}
function ruleLabel(r){
 if(isCustom(r.code))return r.label||customTypes.find(x=>x[0]===r.code)?.[1]||r.code;
 return snap.catalog.find(x=>x.code===r.code)?.name||r.code;
}
function render(){
 if(!snap)return;
 const canEdit=!!snap.can_edit_library,canAssign=!!snap.can_assign&&!!projectId;
 const attached=new Set(snap.assignments.map(x=>x.linter_id));
 $('newLinter').disabled=!canEdit;
 $('profileCount').textContent=snap.profiles.length;
 $('attachedCount').textContent=attached.size;
 $('blockingCount').textContent=new Set(snap.profiles.filter(p=>attached.has(p.id)&&p.is_active).flatMap(p=>p.rules.filter(r=>r.enabled&&r.severity==='block').map(r=>r.id||r.code))).size;
 $('libraryMeta').textContent=snap.profiles.length+' reusable profile'+(snap.profiles.length===1?'':'s');
 $('projectPicker').innerHTML='<option value="">Choose a project…</option>'+snap.projects.map(p=>'<option value="'+p.id+'"'+(Number(p.id)===projectId?' selected':'')+'>'+esc(p.name)+' · #'+p.id+'</option>').join('');
 $('profileList').innerHTML=snap.profiles.map(p=>{
  const on=attached.has(p.id),active=p.is_active,enabled=p.rules.filter(r=>r.enabled);
  const blocks=enabled.filter(r=>r.severity==='block').length,custom=enabled.filter(r=>isCustom(r.code)).length;
  return '<article class="preset"><div class="preset-head"><div><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||'No description')+'</p></div>'+
    '<span class="badge '+(on?'active':'muted')+'">'+(on?'Attached':'Not attached')+'</span></div>'+
    '<div class="badges"><span class="badge">'+esc(p.language.toUpperCase())+'</span><span class="badge">'+enabled.length+' rules</span>'+
    (custom?'<span class="badge">'+custom+' custom</span>':'')+
    (blocks?'<span class="badge">'+blocks+' blocking</span>':'<span class="badge warning">Warnings only</span>')+
    (!active?'<span class="badge muted">Disabled globally</span>':'')+'</div>'+
    '<div class="rule-preview">'+enabled.map(r=>esc(ruleLabel(r))).join(' · ')+'</div>'+
    '<div class="preset-actions">'+(canAssign?(on?
      '<button type="button" class="btn small danger" data-action="detach" data-id="'+p.id+'">Remove from project</button>':
      '<button type="button" class="btn small primary" data-action="attach" data-id="'+p.id+'" '+(!active?'disabled title="Disabled globally"':'')+'>+ Attach to project</button>'):'')+
      '<button type="button" class="btn small" data-action="preview" data-id="'+p.id+'">Test this linter</button>'+
      (canEdit?'<button type="button" class="btn small" data-action="edit" data-id="'+p.id+'">Edit rules</button>'+
      '<button type="button" class="btn small danger" data-action="delete" data-id="'+p.id+'">Delete</button>':'')+
      (!projectId?'<span class="hint">Select a project above to enable assignment.</span>':'')+'</div></article>';
 }).join('')||'<div class="empty">No linting profiles in the library.</div>';
 renderTestChoices();
}
function renderTestChoices(){
 const select=$('testScope'),before=select.value||testChoice;
 select.innerHTML=(projectId?'<option value="project">Project #'+projectId+' — attached rules ('+snap.assignments.length+')</option>':'')+
    snap.profiles.map(p=>'<option value="profile:'+p.id+'">Library preview · '+esc(p.name)+'</option>').join('');
 let preferred=before;
 if(![...select.options].some(o=>o.value===preferred))
   preferred=projectId&&snap.assignments.length?'project':snap.profiles[0]?'profile:'+snap.profiles[0].id:(projectId?'project':'');
 select.value=preferred;testChoice=preferred;
 $('testButton').disabled=!preferred;
 if(!preferred)$('testResults').textContent='Create a linter profile or select a project to begin.';
}
function renderIssues(target,body){
 const issues=body.issues||[],blocks=issues.filter(x=>x.severity==='block').length,warnings=issues.length-blocks;
 if(!Number(body.rules_count)){
  target.innerHTML='<div class="result warn"><strong>No active rules</strong>This project does not have any attached, enabled linters yet. Attach one above, or select “Library preview” to test a profile without attaching it.</div>';
  return;
 }
 let html='<div class="result" style="font-weight:700;color:#25344b">'+body.rules_count+' enabled rules · '+blocks+' blocking issues · '+warnings+' warnings</div>';
 if(!issues.length)html+='<div class="result" style="color:#27845e">✓ No issues found for the selected rules.</div>';
 else html+=issues.slice(0,100).map(x=>'<div class="result '+(x.severity==='block'?'block':'warn')+'"><strong>'+(x.severity==='block'?'BLOCK':'WARNING')+' · '+esc(x.label||x.code)+' · Segment '+Number(x.segment||1)+'</strong>'+esc(x.message)+'</div>').join('');
 if(issues.length>100)html+='<div class="hint">More issues were found. Showing the first 100.</div>';
 target.innerHTML=html;
}
async function test(){
 const choice=$('testScope').value,text=$('testText').value,button=$('testButton');
 if(!choice)return notify('Select a profile or project to test.',true);
 if(!text.trim())return notify('Paste some text to test.',true);
 button.disabled=true;button.textContent='Checking…';
 $('testResults').innerHTML='<div class="result">Checking saved rules…</div>';
 try{
   const body=await rpc('linter_preview',{
    p_profile:choice.startsWith('profile:')?choice.slice(8):null,
    p_project:choice==='project'?projectId:null,
    p_rules:null,
    p_segments:[{transcript:text}]
   });
   renderIssues($('testResults'),body);
 }catch(e){err(e);$('testResults').textContent=e.message}
 finally{button.disabled=false;button.textContent='Run linter check'}
}
function newId(){return 'custom_'+crypto.randomUUID().replace(/-/g,'')}
function customTemplate(r){
 const code=r.code||'FORBIDDEN_TEXT';
 const options=customTypes.map(([value,label])=>'<option value="'+value+'"'+(value===code?' selected':'')+'>'+esc(label)+'</option>').join('');
 let details='';
 if(code==='FORBIDDEN_TERMS'){
  const words=Array.isArray(r.terms)?r.terms.join('\n'):(r.terms||'');
  details='<div class="full"><label>Words or phrases to flag (one per line; up to 30)</label><textarea data-c-field="terms" maxlength="4000" placeholder="फेल&#10;विद्यार्थीयों">'+esc(words)+'</textarea></div>';
 }else if(code==='MAX_LENGTH'){
  details='<div class="full"><label>Maximum characters per transcript segment</label><input data-c-field="limit" type="number" min="1" max="20000" value="'+esc(r.limit??1000)+'"></div>';
 }else{
  details='<div class="'+(code==='SPELLING_REPLACEMENT'?'':'full')+'"><label>'+(code==='REQUIRED_TEXT'?'Required text':code==='SPELLING_REPLACEMENT'?'Misspelled or questionable text':'Disallowed text')+'</label><input data-c-field="term" maxlength="100" value="'+esc(r.term||'')+'" placeholder="Enter exact text"></div>';
  if(code==='SPELLING_REPLACEMENT')details+='<div><label>Suggested correction</label><input data-c-field="replacement" maxlength="100" value="'+esc(r.replacement||'')+'" placeholder="Preferred spelling"></div>';
 }
 return '<div class="custom-rule" data-custom-id="'+esc(r.id)+'"><div class="custom-rule-title"><strong>Custom rule</strong><button type="button" class="btn small danger" data-remove-custom="'+esc(r.id)+'">Remove</button></div>'+
 '<div class="custom-rule-grid"><div class="full"><label>Rule name</label><input data-c-field="label" maxlength="100" value="'+esc(r.label||'')+'" placeholder="For example: Incorrect Hindi spelling"></div>'+
 '<div><label>Check type</label><select data-c-field="code">'+options+'</select></div>'+
 '<div><label>Action on a match</label><select data-c-field="severity"><option value="block"'+(r.severity==='block'?' selected':'')+'>Block submission</option><option value="warn"'+(r.severity!=='block'?' selected':'')+'>Warning only</option></select></div>'+
 details+(code!=='MAX_LENGTH'?'<div class="full checkline"><input type="checkbox" data-c-field="case_sensitive" '+(r.case_sensitive?'checked':'')+'><label style="margin:0">Match uppercase / lowercase exactly (when applicable)</label></div>':'')+
 '</div></div>';
}
function customFromDom(){
 const nodes=[...$('customRuleEditor').querySelectorAll('[data-custom-id]')];
 if(!nodes.length)return customRows;
 const input=(node,name)=>node.querySelector('[data-c-field="'+name+'"]');
 return nodes.map(node=>{
  const prev=customRows.find(x=>x.id===node.dataset.customId)||{};
  const out={...prev,id:node.dataset.customId};
  for(const name of ['label','code','severity','term','replacement','limit','terms']){
   const elem=input(node,name);if(elem)out[name]=elem.value;
  }
  const caseInput=input(node,'case_sensitive');
  if(caseInput)out.case_sensitive=caseInput.checked;
  return out;
 });
}
function renderCustom(){
 $('customRuleEditor').innerHTML=customRows.map(customTemplate).join('')||
 '<p class="hint">No custom rules added. Click “Add custom rule” for your own text or spelling checks.</p>';
}
function getEditorRules(){
 const builtins=[...$('ruleEditor').querySelectorAll('[data-code]')].filter(el=>el.querySelector('[data-rule-enable]').checked)
  .map(el=>({code:el.dataset.code,severity:el.querySelector('[data-rule-severity]').value,enabled:true}));
 const customs=customFromDom().map(r=>{
  const obj={code:r.code,id:r.id,label:String(r.label||'').trim(),severity:r.severity||'warn',enabled:true};
  if(r.code==='MAX_LENGTH')obj.limit=Number(r.limit);
  else if(r.code==='FORBIDDEN_TERMS')obj.terms=String(Array.isArray(r.terms)?r.terms.join('\n'):r.terms||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  else {
   obj.term=String(r.term||'').trim();
   if(r.code==='SPELLING_REPLACEMENT')obj.replacement=String(r.replacement||'').trim();
  }
  if(r.code!=='MAX_LENGTH')obj.case_sensitive=!!r.case_sensitive;
  return obj;
 });
 return builtins.concat(customs);
}
function openEditor(p){
 if(!snap?.can_edit_library)return;
 activeId=p?.id||null;
 $('editorTitle').textContent=p?'Edit linter · '+p.name:'Create linter';
 $('profileName').value=p?.name||'';$('profileDescription').value=p?.description||'';
 $('profileLanguage').value=p?.language||'hi';$('profileActive').checked=p?.is_active!==false;
 const selected=new Map((p?.rules||[]).filter(r=>!isCustom(r.code)).map(r=>[r.code,r]));
 $('ruleEditor').innerHTML=snap.catalog.map(rule=>{
  const curr=selected.get(rule.code);
  return '<div class="rule-edit" data-code="'+esc(rule.code)+'"><input aria-label="Enable '+esc(rule.name)+'" type="checkbox" data-rule-enable '+(curr?.enabled===true?'checked':'')+'><div><strong>'+esc(rule.name)+'</strong><p>'+esc(rule.description)+'</p></div><select aria-label="Severity for '+esc(rule.name)+'" data-rule-severity><option value="block" '+(curr?.severity==='block'?'selected':'')+'>Block</option><option value="warn" '+(curr?.severity!=='block'?'selected':'')+'>Warn</option></select></div>';
 }).join('');
 customRows=(p?.rules||[]).filter(r=>isCustom(r.code)).map(r=>structuredClone(r));
 renderCustom();
 $('draftTestText').value=$('testText').value||'नमस्ते।यहाँ  दो स्पेस हैं ।';
 $('draftTestResults').innerHTML='';$('draftTestStatus').textContent='';
 $('editorDialog').showModal();
}
function closeEditor(){$('editorDialog').close();activeId=null;customRows=[]}
function addCustom(){
 customRows=customFromDom();
 if(customRows.length+$('ruleEditor').querySelectorAll('[data-rule-enable]:checked').length>=CUSTOM_MAX)
  return notify('This linter supports up to '+CUSTOM_MAX+' rules.',true);
 customRows.push({id:newId(),label:'New text check',code:'FORBIDDEN_TEXT',severity:'warn',term:'',case_sensitive:false});
 renderCustom();
 $('customRuleEditor').querySelector('[data-custom-id]:last-child [data-c-field="label"]')?.focus();
}
async function previewDraft(){
 const button=$('testDraft'),sample=$('draftTestText').value,rules=getEditorRules();
 if(!sample.trim()){return $('draftTestStatus').textContent='Enter sample text first.'}
 if(!rules.length){return $('draftTestStatus').textContent='Enable or add at least one rule.'}
 button.disabled=true;$('draftTestStatus').textContent='Testing unsaved rules…';
 try{
  const body=await rpc('linter_preview',{p_profile:null,p_project:null,p_rules:rules,p_segments:[{transcript:sample}]});
  $('draftTestStatus').textContent='Preview complete · nothing has been saved';
  renderIssues($('draftTestResults'),body);
 }catch(e){$('draftTestStatus').textContent=e.message;err(e)}
 finally{button.disabled=false}
}
async function saveEditor(e){
 e.preventDefault();if(busy)return;
 const rules=getEditorRules();
 if(!rules.length)return notify('Enable at least one built-in or custom rule.',true);
 if(rules.length>CUSTOM_MAX)return notify('Too many rules. The maximum is '+CUSTOM_MAX+'.',true);
 busy=true;$('saveLinter').disabled=true;
 try{
  const id=await rpc('linter_save_profile',{
   p_id:activeId,p_name:$('profileName').value,p_description:$('profileDescription').value,
   p_language:$('profileLanguage').value,p_rules:rules,p_active:$('profileActive').checked
  });
  closeEditor();await reload();
  const saved=snap.profiles.find(x=>x.id===id);
  if(!saved||saved.rules.length!==rules.length)throw Error('Profile was not verified after saving; refresh before continuing.');
  notify('Saved '+saved.name+' with '+saved.rules.length+' rules. Assigned projects will use these updated rules.');
 }catch(e){err(e)}finally{busy=false;$('saveLinter').disabled=false}
}
async function projectAction(action,id){
 if(busy)return;
 const profile=snap.profiles.find(x=>x.id===id);if(!profile)return;
 if(action==='edit')return openEditor(profile);
 if(action==='preview'){
  $('testScope').value='profile:'+id;testChoice=$('testScope').value;
  $('testText').focus();$('testText').scrollIntoView({behavior:'smooth',block:'center'});
  return test();
 }
 if((action==='attach'||action==='detach')&&!projectId)return notify('Choose a project before attaching or removing linters.',true);
 if(action==='delete'&&!confirm('Delete "'+profile.name+'"? Remove it from all projects first.'))return;
 busy=true;
 try{
  if(action==='delete')await rpc('linter_delete_profile',{p_id:id});
  else await rpc('linter_set_project',{p_project:projectId,p_linter:id,p_attach:action==='attach'});
  await reload();
  const exists=snap.assignments.some(a=>a.linter_id===id);
  if(action==='attach'&&!exists)throw Error('Attach did not persist. Please retry.');
  if(action==='detach'&&exists)throw Error('Removal did not persist. Please retry.');
  notify(action==='attach'?profile.name+' attached to project #'+projectId+'. Blocking checks are active on transcription submissions.':action==='detach'?'Removed from this project only.':'Deleted from shared library.');
 }catch(e){err(e)}finally{busy=false}
}
$('projectPicker').addEventListener('change',async e=>{
 projectId=Number(e.target.value)||null;
 const u=new window.URL(location.href);if(projectId)u.searchParams.set('project',projectId);else u.searchParams.delete('project');
 history.replaceState(null,'',u);
 testChoice=projectId?'project':'';
 $('testResults').innerHTML='';
 try{await reload()}catch(e){err(e)}
});
$('testScope').onchange=e=>{testChoice=e.target.value;$('testResults').innerHTML=''};
$('newLinter').onclick=()=>openEditor(null);
$('closeEditor').onclick=$('cancelEditor').onclick=closeEditor;
$('linterForm').addEventListener('submit',saveEditor);
$('addCustomRule').onclick=addCustom;
$('customRuleEditor').addEventListener('click',e=>{
 const button=e.target.closest('[data-remove-custom]');if(!button)return;
 customRows=customFromDom().filter(r=>r.id!==button.dataset.removeCustom);renderCustom();
});
$('customRuleEditor').addEventListener('change',e=>{
 if(e.target.matches('[data-c-field="code"]')){
  customRows=customFromDom();renderCustom();
 }
});
$('testDraft').onclick=previewDraft;
$('profileList').onclick=e=>{const button=e.target.closest('[data-action]');if(button)projectAction(button.dataset.action,button.dataset.id)};
$('testButton').onclick=test;
(async()=>{
 const {data:{user}}=await db.auth.getUser();if(!user)return location.replace('/auth');
 admin=await rpc('get_my_admin_access',{});
 if(!admin?.allowed)return location.replace('/workspace');
 await reload();
})().catch(e=>{
 err(e);$('profileList').innerHTML='<div class="empty">Unable to load this library. '+esc(e.message)+'</div>';
});
})();