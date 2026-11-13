(()=>{
'use strict';
if(window.__acAdminVault)return;window.__acAdminVault=true;
const U='https://llmhyezgcnbognmmsnzq.supabase.co',K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const $=id=>document.getElementById(id);
const sections=[
 {id:'command',name:'Command Center',icon:'▦',description:'Live operations, urgent tasks, and the tools you use every day.'},
 {id:'projects',name:'Projects',icon:'▤',description:'Project creation, operations, queues, settings, assets, and assignments.'},
 {id:'people',name:'Contributors',icon:'♧',description:'People profiles, access, onboarding, role assignments, and contributor operations.'},
 {id:'quality',name:'Tasks & Reviews',icon:'☷',description:'Production queues, quality reviews, final decisions, and transcription tools.'},
 {id:'finance',name:'Finance',icon:'▣',description:'Payments, earnings, finance reporting, and reconciliations.'},
 {id:'automation',name:'Automations',icon:'⤨',description:'Existing notifications, Slack synchronization, and operational workflows.'},
 {id:'comms',name:'Communications',icon:'✉',description:'Email Center, Slack Management, support, and project announcements.'},
 {id:'analytics',name:'Analytics',icon:'▥',description:'Business, application, operational and QA analytics.'},
 {id:'health',name:'Platform Health',icon:'◴',description:'Monitor exceptions, production queues, and platform activity.'},
 {id:'security',name:'Security & Audit',icon:'⬡',description:'Manage trusted access, admin roles, approvals, and audit tools.'},
 {id:'settings',name:'Settings',icon:'⚙',description:'Administrative configuration, integrations, and design preferences.'}
];
const tools=[
 ['command','Operations Overview','Live project/task indicators and action center.','/admin#overview','▦'],
 ['command','Live Operations','Operations dashboard with live platform activity.','/admin/live-operations','◴'],
 ['command','Project Lab','Open a project and manage its production workflow.','/admin/project-lab','▤'],
 ['command','Contributor 360','Find contributors and review their activity and access.','/admin/people','♧'],
 ['command','Slack Management','Private channels, projects, members, and announcements.','/admin/integrations','✉'],
 ['command','Task Assignment Center','Manage assignment permissions, layers, and daily limits.','/admin/assignments','☷'],
 ['projects','Project Lab','Manage projects, content, queues, roles, and configuration.','/admin/project-lab','▤'],
 ['projects','Visual Project Builder','Create and customize projects visually.','/admin/project-builder','✧'],
 ['projects','Project Registry','Review project inventory and manage availability.','/admin#projects','▥'],
 ['projects','Assignment Center','Assign and remove contributor project access and limits.','/admin/assignments','☷'],
 ['projects','Transcription Vault','Review transcription resources and workflow assets.','/admin/transcription-vault','▣'],
 ['projects','Audio Lab 2','Create and manage audio workflows and recordings.','/admin/audio-lab-2','♫'],
 ['projects','Project Slack Channels','Link project access with private Slack channels.','/admin/integrations#channels','✉'],
 ['people','Contributor 360','Open contributor profiles and project activity.','/admin/people','♧'],
 ['people','Contributor Operations','Operational administration and contributor support.','/admin/contributor-ops','▤'],
 ['people','Access Management','Grant or revoke permitted project access.','/admin#access','♙'],
 ['people','Staff & Roles','Manage operational admin roles and staff permissions.','/admin#staff','⬡'],
 ['people','Applications','Review applicant submissions and recruitment flow.','/admin/applications','☷'],
 ['people','Sandbox Accounts','Inspect dummy contributor and reviewer accounts.','/admin/test-accounts','✧'],
 ['quality','Assignment Center','Review and assign L1/L2 workloads.','/admin/assignments','☷'],
 ['quality','L2 Reviews','Access reviewer work and pending review tools.','/admin/reviews','✓'],
 ['quality','Completed Tasks','Find completed and archived tasks.','/admin/done-tasks','▥'],
 ['quality','Final Audit','Inspect final audits awaiting decisions.','/admin#submissions','◎'],
 ['quality','Transcription Lab V2','Manage transcription production and review.','/admin/transcription-v2','▤'],
 ['quality','Linter Library','Manage transcription validation and linter rules.','/admin/linters','⌁'],
 ['quality','Recordings Audit','Review voice recordings and audio quality.','/admin/recordings','♫'],
 ['finance','Finance Ledger','Review payment and balance adjustments.','/admin#finance-ledger','▣'],
 ['finance','Payments','Access payout and payment queues.','/admin#payments','▥'],
 ['finance','Live Operations','Review finance-related operational exceptions.','/admin/live-operations','◴'],
 ['automation','Slack Automation','Configure automatic member synchronization and channel access.','/admin/integrations#automation','⤨'],
 ['automation','Notification Settings','Manage operational Slack notification delivery.','/admin/integrations#automation','✉'],
 ['automation','Project Workflows','Open Project Lab to configure existing workflow behaviors.','/admin/project-lab','▤'],
 ['automation','Email Center','Send and manage project communications.','/admin/email-center','✉'],
 ['comms','Email Center','Compose, preview, and deliver admin email.','/admin/email-center','✉'],
 ['comms','Slack Control Center','Manage channels, membership, messages and automation.','/admin/integrations','⌗'],
 ['comms','Support Center','Review and resolve support tickets.','/admin#support-center','♧'],
 ['comms','Project Announcements','Publish per-project updates and instructions.','/admin/project-lab','▤'],
 ['analytics','Live Operations','View operational activity, issues, and throughput.','/admin/live-operations','▥'],
 ['analytics','Applications Analytics','Track recruitment and application trends.','/admin/applications','▦'],
 ['analytics','Project Inventory','Assess project task availability and production.','/admin#projects','▤'],
 ['analytics','Finance Ledger','Inspect transactions and financial activity.','/admin#finance-ledger','▣'],
 ['analytics','Contributor 360','Inspect contributor performance and task history.','/admin/people','♧'],
 ['health','Operations Health','See outstanding reviews, queue issues, and reported failures.','/admin#overview','◴'],
 ['health','Live Operations','Open the dedicated live operations interface.','/admin/live-operations','▥'],
 ['health','CoreForge','Review CoreForge AI and related checks.','/admin/coreforge','✧'],
 ['health','Slack Sync Health','Inspect failed and pending Slack sync operations.','/admin/integrations#overview','⌗'],
 ['security','Staff & Roles','Manage admin roles and scope.','/admin#staff','⬡'],
 ['security','Access Management','Manage contributor account and project permissions.','/admin#access','♙'],
 ['security','Trust & Safety','Open moderation and platform safety workflows.','/admin/trust-safety','◎'],
 ['security','Slack Activity','Inspect administrative Slack changes and sync.','/admin/integrations#overview','▥'],
 ['security','Test Accounts','Use isolated test identities to verify access.','/admin/test-accounts','✧'],
 ['settings','Admin Panel','Open the original administration tools.','/admin','⚙'],
 ['settings','Slack Integrations','Manage bot connection, synchronization and notifications.','/admin/integrations#automation','⌗'],
 ['settings','Project Builder','Configure project-level design and behavior.','/admin/project-builder','✧'],
 ['settings','Staff Permissions','Manage admin roles and access.','/admin#staff','⬡'],
 ['settings','Linter Library','Configure and assign validation rules.','/admin/linters','⌁']
].map(([section,name,description,href,icon])=>({section,name,description,href,icon,id:section+':'+name}));
let active='command',scope='super',db=null,projectList=[],health=null,pinned=new Set(),search='',busy=false;
const storage='ac-admin-vault-pins-v1';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
function notice(text,error=false){const n=$('vaultNotice');n.textContent=text;n.classList.toggle('error',error);n.hidden=!text}
function safeRead(k,fallback){try{return JSON.parse(localStorage.getItem(k))||fallback}catch{return fallback}}
function initPreferences(){pinned=new Set(safeRead(storage,[]));const t=localStorage.getItem('adatacore-admin-theme');document.documentElement.dataset.theme=t==='dark'?'dark':'light'}
function navigate(section){active=sections.some(s=>s.id===section)?section:'command';location.hash=active;render()}
function createNav(){const nav=$('vaultNav');nav.replaceChildren();for(const s of sections){const b=el('button','vault-nav-link');b.type='button';b.dataset.section=s.id;const i=el('span','glyph',s.icon);b.append(i,el('span',null,s.name));b.onclick=()=>navigate(s.id);nav.appendChild(b)}}
function renderMetrics(){const parent=$('vaultMetrics');parent.replaceChildren();if(active!=='command'&&!search){parent.hidden=true;return}parent.hidden=false;
 const c=health?.counts||{};
 const metrics=[
 ['Projects',projectList.length||'—','Projects visible to your admin session'],
 ['Final audits',c.pending_final_audits??'—','Awaiting final decisions'],
 ['Transcript reviews',c.transcripts_waiting_review??'—','Waiting for review'],
 ['Browser errors (24h)',c.client_errors_24h??'—','Reported client-side exceptions']
 ];
 for(const [label,value,description] of metrics){const x=el('div','vault-metric');x.append(el('span',null,label),el('strong',null,String(value)),el('small',null,description));parent.appendChild(x)}
}
function makeCard(t){const a=el('article','vault-card');const top=el('div','vault-card-top');top.appendChild(el('span','vault-card-icon',t.icon));const star=el('button','vault-star',pinned.has(t.id)?'★':'☆');star.type='button';star.setAttribute('aria-label',(pinned.has(t.id)?'Unpin ':'Pin ')+t.name);star.setAttribute('aria-pressed',String(pinned.has(t.id)));star.title='Pin this tool';star.onclick=()=>{if(pinned.has(t.id))pinned.delete(t.id);else pinned.add(t.id);localStorage.setItem(storage,JSON.stringify([...pinned]));render()};top.append(star);a.append(top,el('h3',null,t.name),el('p',null,t.description));const footer=el('div','vault-card-actions');const link=el('a','vault-open','Open tool ↗');link.href=t.href;link.setAttribute('aria-label','Open '+t.name);footer.append(link);a.append(footer);return a}
function renderProjects(){const section=$('vaultProjectSection'),list=$('vaultProjects');const show=(active==='command'||active==='projects')&&!search&&projectList.length>0;section.hidden=!show;if(!show)return;list.replaceChildren();for(const p of projectList.slice(0,15)){const row=el('div','vault-project-row');const info=el('div');info.append(el('strong',null,p.project_name||'Unnamed project'),el('span',null,'#'+p.id+' · '+(p.lifecycle_status|| (p.is_published?'Published':'Unpublished'))));const a=el('a',null,'Manage project ↗');a.href='/admin/project-lab?project='+encodeURIComponent(p.id);row.append(info,a);list.appendChild(row)}}
function render(){
 const s=sections.find(x=>x.id===active)||sections[0];
 $('vaultCrumb').textContent=s.name;$('vaultTitle').textContent=s.name;$('vaultDescription').textContent=s.description;
 document.querySelectorAll('.vault-nav-link').forEach(b=>{const is=b.dataset.section===active;b.classList.toggle('active',is);b.setAttribute('aria-current',is?'page':'false')});
 renderMetrics();
 const q=search.trim().toLowerCase();const visible=tools.filter(t=>q?(t.name+' '+t.description+' '+sections.find(s=>s.id===t.section)?.name).toLowerCase().includes(q):t.section===active);
 $('vaultSectionHeading').textContent=q?'Search results':s.name+' tools';
 $('vaultResultCount').textContent=visible.length+' tool'+(visible.length===1?'':'s');
 const cards=$('vaultCards');cards.replaceChildren();
 for(const t of visible)cards.appendChild(makeCard(t));
 if(!visible.length)cards.appendChild(el('div','vault-empty','No matching tool. Try another keyword.'));
 const fav=$('vaultPinned');fav.hidden=!!q||pinned.size===0;if(!fav.hidden){fav.replaceChildren();fav.appendChild(el('h2',null,'Pinned shortcuts'));const grid=el('div','vault-cards');for(const t of tools.filter(t=>pinned.has(t.id)))grid.appendChild(makeCard(t));fav.appendChild(grid)}
 renderProjects();
}
async function loadStats(){const results=await Promise.allSettled([
 db.rpc('admin_operations_health'),
 db.from('project_lab').select('id,project_name,is_published,lifecycle_status').order('id',{ascending:false}).limit(200)
]);
 if(results[0].status==='fulfilled'&&!results[0].value.error)health=results[0].value.data;
 if(results[1].status==='fulfilled'&&!results[1].value.error)projectList=results[1].value.data||[];
 render();
 if(results.every(r=>r.status==='rejected'||r.value?.error))notice('Vault is available, but live summaries could not be loaded. The original management tools remain accessible.',true);
 else notice('');
}
async function boot(){
 initPreferences();createNav();render();
 if(!window.supabase?.createClient){notice('Admin Vault cannot load the authentication client. Refresh this page.',true);return}
 db=window.supabase.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
 const {data:{session},error:sessionError}=await db.auth.getSession();
 if(sessionError||!session){location.replace('/auth');return}
 const {data:access,error}=await db.rpc('get_my_admin_access');
 if(error||!access?.allowed){location.replace('/workspace');return}
 scope=access?.is_super_admin?'super':'staff';
 $('vaultAccount').textContent=scope==='super'?'Super Admin':'Admin Staff';
 $('vaultSearch').addEventListener('input',e=>{search=e.target.value||'';render()});
 $('vaultRefresh').onclick=async()=>{if(busy)return;busy=true;$('vaultRefresh').disabled=true;notice('Refreshing operations summaries…');try{await loadStats()}catch(e){notice(e.message||String(e),true)}finally{busy=false;$('vaultRefresh').disabled=false}};
 $('vaultTheme').onclick=()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;localStorage.setItem('adatacore-admin-theme',next)};
 window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)||'command'));
 // Only Super Admin sessions receive the privileged cross-project dashboard.
 if(scope!=='super'){notice('Admin Vault is restricted to Super Admin while consolidated role permissions are being verified. Open the original Admin Panel for your assigned tools.',true);$('vaultMetrics').hidden=true;$('vaultCards').replaceChildren();const l=el('a','vault-btn','Open original Admin Panel');l.href='/admin';$('vaultCards').appendChild(l);document.querySelectorAll('.vault-nav-link').forEach(b=>b.disabled=true);$('vaultSearch').disabled=true;return}
 navigate(location.hash.slice(1)||'command');await loadStats();
}
boot().catch(e=>notice('Unable to initialize Admin Vault: '+(e.message||e),true));
})();