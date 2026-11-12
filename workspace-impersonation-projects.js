(()=>{
'use strict';
// Surface assigned projects and allow an authorized admin to enter supported
// contributor workflows. Live recordings use the admin's own authenticated identity.
const id=new URLSearchParams(location.search).get('impersonation');
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id||''))return;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const style=document.createElement('style');
style.textContent='.imp-projects{margin:0 0 22px;padding:20px;border:1px solid var(--line,#e4e5eb);background:var(--panel,#fff);border-radius:16px}.imp-projects h2{font-size:18px;margin:0 0 7px}.imp-projects p{font-size:12px;color:var(--muted,#6f7080);line-height:1.65;margin:0 0 15px}.imp-project-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.imp-project-card{padding:16px;border:1px solid var(--line,#e4e5eb);border-radius:12px;background:var(--panel2,#f8f8fb)}.imp-project-card strong{font-size:14px;display:block;margin:8px 0}.imp-project-card small{font-size:11px;opacity:.75}.imp-project-card .imp-project-actions{margin-top:12px;display:flex;flex-wrap:wrap;gap:8px}.imp-project-card .imp-project-action{display:inline-block;padding:9px 13px;border-radius:9px;background:#247b69;color:white;text-decoration:none;font-size:12px;font-weight:750}.imp-project-card .imp-project-action:focus-visible{outline:3px solid #8461db;outline-offset:2px}.imp-project-card .imp-project-label{font-size:10px;font-weight:800;color:#15765c}.imp-project-empty{padding:13px;font-size:12px;border:1px dashed var(--line,#ddd);border-radius:10px}';
document.head.append(style);
function mount(){
 const overview=document.getElementById('view-overview');if(!overview)return null;
 let root=document.getElementById('impContributorProjects');
 if(root)return root;
 root=document.createElement('section');root.id='impContributorProjects';root.className='imp-projects';
 root.innerHTML='<h2>Assigned projects</h2><p>You can open an assigned project and use supported admin contributor-workflow actions. Real submissions and recordings are audited under your admin identity unless the workflow explicitly supports delegated actions.</p><div id="impContributorProjectItems" class="imp-project-empty">Loading assignments…</div>';
 overview.insertBefore(root,overview.firstElementChild);return root;
}
async function load(){
 if(!mount())return;
 const host=document.getElementById('impContributorProjectItems');
 try{
  const db=window.supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
  const {data,error}=await db.rpc('admin_impersonation_project_hubs',{p_session_id:id});
  if(error)throw error;
  const projects=Array.isArray(data)?data:[];
  host.className=projects.length?'imp-project-grid':'imp-project-empty';
  host.innerHTML=projects.length?projects.map(p=>{
    const target=p.type==='voice_recording'?'/voice-studio?impersonation='+encodeURIComponent(id):
      '/workspace?impersonation='+encodeURIComponent(id)+'&project='+encodeURIComponent(p.id)+'#assignments';
    const label=p.type==='voice_recording'?'Open Voice Studio':'Open contributor assignments';
    return '<article class="imp-project-card"><span class="imp-project-label">Assigned · Live</span><strong>'+escapeHtml(p.name)+'</strong><small>'+escapeHtml(p.project_code||p.type||'Project')+'</small><p>'+escapeHtml(p.description||'Project available on the contributor dashboard.')+'</p><div class="imp-project-actions"><a class="imp-project-action" href="'+escapeHtml(target)+'">'+label+' →</a></div></article>';
   }).join(''):'No published projects with active assignment and task allowance are visible to this contributor.';
 }catch(e){host.textContent='Unable to verify project assignments: '+String(e.message||e)}
}
let attempts=0;const poll=setInterval(()=>{attempts++;if(mount()){clearInterval(poll);load()}else if(attempts>60)clearInterval(poll)},150);
})();
