(()=>{'use strict';
if(window.__adatacoreProjectLinterTab)return;window.__adatacoreProjectLinterTab=true;
const project=Number(new URLSearchParams(location.search).get('project'));if(!project)return;
const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','&quot;':'&quot;',"'":'&#39;'}[c]));
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',{auth:{persistSession:true,autoRefreshToken:true}});
let snap=null,view=null,tab=null,pending=false;
const canView=()=>{const a=window.__adatacoreProjectAccess;return !!a?.allowed&&(a.is_super_admin||a.project_roles?.some(r=>r==='project_manager'||r==='qa_manager'))};
async function rpc(n,args){const r=await db.rpc(n,args);if(r.error)throw Error(r.error.message);return r.data}
function status(s,bad){const t=$('acLinterMessage');if(t){t.textContent=s||'';t.style.color=bad?'#b53e54':'#26775e'}}
async function refresh(){snap=await rpc('linter_library_snapshot',{p_project:project});render()}
function render(){
 if(!snap||!view)return;
 const on=new Set(snap.assignments.map(x=>x.linter_id)),eligible=snap.profiles.filter(p=>p.is_active&&!on.has(p.id));
 view.innerHTML='<div class="ac-linter-head"><div><div class="eyebrow">Project #'+project+' · Quality tools</div><h1>Linters</h1><p>Attach shared linting profiles to this project. Other projects are not affected.</p></div><a class="btn btn-secondary" href="/admin/linters?project='+project+'">Open Linter Library ↗</a></div>'+
 '<div class="ac-linter-summary"><div><span>Attached profiles</span><strong>'+on.size+'</strong></div><div><span>Blocking rules</span><strong>'+new Set(snap.profiles.filter(p=>on.has(p.id)&&p.is_active).flatMap(p=>p.rules.filter(r=>r.enabled&&r.severity==='block').map(r=>r.code))).size+'</strong></div><div><span>Activation</span><strong style="font-size:15px">'+(on.size?'Enabled':'Off')+'</strong></div></div>'+
 (snap.can_assign?'<div class="ac-linter-add"><div><strong>Attach an existing linter</strong><p>Choose from the central library. Changes take effect on new submissions immediately.</p></div><select id="acLinterSelect" aria-label="Choose a linter"><option value="">Select a linter…</option>'+eligible.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('')+'</select><button class="btn btn-primary" data-ac-linter="attach" '+(!eligible.length?'disabled':'')+'>Attach</button></div>':'')+
 '<div class="ac-linter-list">'+snap.profiles.filter(p=>on.has(p.id)).map(p=>'<article><div><h3>'+esc(p.name)+'</h3><p>'+esc(p.description)+'</p><small>'+p.rules.filter(r=>r.enabled).length+' rules · '+p.rules.filter(r=>r.enabled&&r.severity==='block').length+' blocking'+(!p.is_active?' · Paused in library':'')+'</small></div>'+(snap.can_assign?'<button class="btn btn-secondary" data-ac-linter="remove" data-id="'+p.id+'">Remove</button>':'')+'</article>').join('')+
 (on.size?'':'<div class="ac-linter-empty">No linter is attached to this project. Submission uses the editor’s standard validation only.</div>')+'</div><div id="acLinterMessage" role="status"></div>';
}
function open(){
 document.querySelectorAll('.lab-view').forEach(x=>x.classList.toggle('active',x===view));
 document.querySelectorAll('.lab-nav [data-view]').forEach(x=>x.classList.remove('active'));
 document.querySelectorAll('[data-pcc-tab]').forEach(x=>x.setAttribute('aria-current',x===tab?'page':'false'));
 try{history.replaceState(null,'',location.pathname+location.search+'#ac-linters')}catch(_){}
 refresh().catch(e=>status(e.message,true));
}
async function action(e){
 const button=e.target.closest('[data-ac-linter]');if(!button||pending)return;
 const id=button.dataset.acLinter==='attach'?$('acLinterSelect')?.value:button.dataset.id;if(!id)return status('Choose a linter.',true);
 pending=true;button.disabled=true;
 try{await rpc('linter_set_project',{p_project:project,p_linter:id,p_attach:button.dataset.acLinter==='attach'});await refresh();status('Project linting rules updated.')}
 catch(e){status(e.message,true)}finally{pending=false;button.disabled=false}
}
const style=document.createElement('style');style.textContent='.ac-linter-head{display:flex;gap:20px;align-items:center;justify-content:space-between;margin-bottom:24px}.ac-linter-head h1{font-size:28px;letter-spacing:-.04em;margin:6px 0}.ac-linter-head p,.ac-linter-add p{font-size:12px;color:var(--muted);margin:5px 0 0}.ac-linter-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:22px}.ac-linter-summary>div{background:var(--panel);border:1px solid var(--line);padding:17px;border-radius:11px}.ac-linter-summary span{display:block;color:var(--muted);font-size:11px}.ac-linter-summary strong{display:block;font-size:27px;margin-top:7px}.ac-linter-add{display:flex;align-items:center;gap:13px;background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:17px;margin-bottom:15px}.ac-linter-add>div{margin-right:auto}.ac-linter-add select{min-width:250px;max-width:350px;padding:10px;border:1px solid var(--line);border-radius:9px;color:var(--text);background:var(--panel2)}.ac-linter-list{border:1px solid var(--line);border-radius:11px;background:var(--panel)}.ac-linter-list article{padding:18px;display:flex;justify-content:space-between;align-items:center;gap:15px;border-bottom:1px solid var(--line)}.ac-linter-list article:last-child{border-bottom:0}.ac-linter-list h3{font-size:14px;margin:0 0 6px}.ac-linter-list p{font-size:12px;color:var(--muted);line-height:1.5;margin:0}.ac-linter-list small{display:block;margin-top:9px;color:var(--muted)}.ac-linter-empty{padding:32px;color:var(--muted);font-size:12px;text-align:center}#acLinterMessage{margin-top:10px;font-size:12px}@media(max-width:760px){.ac-linter-head,.ac-linter-add{align-items:stretch;flex-direction:column}.ac-linter-add select{min-width:0;width:100%}.ac-linter-summary{grid-template-columns:1fr 1fr}}';
document.head.appendChild(style);
(async()=>{
 for(let i=0;i<110;i++){
  if(canView()&&$('pccTabs')&&document.querySelector('.lab-main'))break;
  await new Promise(r=>setTimeout(r,100));
 }
 if(!canView()||!$('pccTabs'))return;
 tab=document.createElement('button');tab.type='button';tab.dataset.pccTab='linters';tab.textContent='Linters';$('pccTabs').appendChild(tab);
 view=document.createElement('section');view.className='lab-view';view.id='view-ac-linters';document.querySelector('.lab-main').appendChild(view);
 tab.addEventListener('click',open);view.addEventListener('click',action);
 if(location.hash==='#ac-linters')open();
})().catch(e=>console.error('Project linter:',e));
})();