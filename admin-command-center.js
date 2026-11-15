(()=>{'use strict';
if(window.__adatacoreCommandCenter)return;
window.__adatacoreCommandCenter=true;
const basic=[
 ['Operations','/admin/operations','Exceptions, reliability and audit actions'],
 ['Live operations','/admin/live-operations','Task queues, quality and project scorecards'],
 ['Projects','/admin/projects','Project status and available work'],
 ['Assignments','/admin/assignments','Contributor and queue management'],
 ['Support','/admin/support','Contributor tickets and resolutions'],
 ['Project Lab','/admin/project-lab','Project configuration and controls']
];
const privileged=[
 ['Access','/admin/access','Manage staff and project permissions'],
 ['Test accounts','/admin/test-accounts','Validate isolated contributor journeys'],
 ['Finance','/admin/finance','Budgets and ledger'],
 ['Applications','/admin/applications','Assess incoming contributors'],
 ['Integrations','/admin/integrations','Slack and connected services'],
 ['Quality reviews','/admin/reviews','L2 review queue'],
 ['Linter library','/admin/linters','Validation rules and warnings'],
 ['Client deliverables','/admin/done-tasks','Delivery and completed-work audit']
];
const css=`#acCommandToggle{font:inherit;border:1px solid var(--line,#d5dbe5);border-radius:10px;background:var(--panel,#fff);color:inherit;padding:8px 12px;cursor:pointer}#acCommandToggle:focus-visible,.ac-command a:focus-visible,.ac-command input:focus-visible,.ac-command button:focus-visible{outline:3px solid #6d88df;outline-offset:2px}.ac-command[hidden]{display:none!important}.ac-command{position:fixed;inset:0;z-index:2147481000;display:grid;place-items:start center;padding:8vh 12px;background:rgba(7,12,27,.62);box-sizing:border-box}.ac-command-panel{color:var(--text,#1d2633);background:var(--panel,#fff);width:min(720px,100%);max-height:82vh;overflow:auto;border-radius:18px;border:1px solid var(--line,#d5dbe5);box-shadow:0 24px 80px rgba(0,0,0,.24)}.ac-command-head{display:flex;align-items:center;justify-content:space-between;padding:20px 22px 8px}.ac-command-head strong{font-size:18px}.ac-command-head button{border:0;background:transparent;color:inherit;font-size:25px;cursor:pointer}.ac-command-intro{padding:0 22px 12px;color:var(--muted,#6e7786);font-size:12px}.ac-command-search{margin:0 22px 16px;width:calc(100% - 44px);box-sizing:border-box;padding:12px;border:1px solid var(--line,#d5dbe5);border-radius:10px;background:var(--panel2,#f8f9fb);color:inherit}.ac-command-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:0 22px 22px}.ac-command a{display:block;color:inherit;text-decoration:none;background:var(--panel2,#f8f9fb);border:1px solid var(--line,#d5dbe5);border-radius:12px;padding:13px}.ac-command a:hover{border-color:#758de3}.ac-command a b{display:block;font-size:13px}.ac-command a span{display:block;font-size:11px;margin-top:5px;color:var(--muted,#6e7786);line-height:1.45}.ac-command-none{grid-column:1/-1;padding:16px;color:var(--muted,#6e7786)}@media(max-width:560px){.ac-command-grid{grid-template-columns:1fr}.ac-command{padding-top:20px}}@media(prefers-reduced-motion:reduce){.ac-command *{scroll-behavior:auto!important}}`;
const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
function mount(){
 if(document.getElementById('acCommandToggle'))return true;
 const access=window.__adatacoreAdminAccess;
 if(!access?.allowed)return false;
 const host=document.querySelector('.admin-header-actions')||document.querySelector('header');
 if(!host)return false;
 const toggle=document.createElement('button');toggle.id='acCommandToggle';toggle.type='button';toggle.textContent='⌘ Command center';toggle.title='Open Adatacore Command Center (Ctrl/⌘ + Shift + K)';
 host.appendChild(toggle);
 const overlay=document.createElement('section');overlay.className='ac-command';overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Adatacore Command Center');
 overlay.innerHTML='<div class="ac-command-panel"><div class="ac-command-head"><strong>Adatacore Command Center</strong><button type="button" aria-label="Close command center" data-close>×</button></div><p class="ac-command-intro">Quick access to existing operational workspaces. Figures and status remain in their source tools.</p><input class="ac-command-search" aria-label="Find admin tools" type="search" placeholder="Find a workspace…"><div class="ac-command-grid"></div></div>';
 document.body.appendChild(overlay);
 const search=overlay.querySelector('input'),grid=overlay.querySelector('.ac-command-grid');
 const tools=access.is_super_admin?basic.concat(privileged):basic;
 const render=()=>{const q=search.value.trim().toLowerCase();const found=tools.filter(t=>t.join(' ').toLowerCase().includes(q));grid.replaceChildren();if(!found.length){const e=document.createElement('p');e.className='ac-command-none';e.textContent='No matching workspace.';grid.appendChild(e);return;}for(const [name,url,description] of found){const link=document.createElement('a');link.href=url;const title=document.createElement('b');title.textContent=name;const desc=document.createElement('span');desc.textContent=description;link.append(title,desc);grid.appendChild(link)}};
 let prior=null;const close=()=>{overlay.hidden=true;if(prior?.isConnected)prior.focus();};const open=()=>{prior=document.activeElement;search.value='';render();overlay.hidden=false;search.focus();};
 toggle.addEventListener('click',open);overlay.querySelector('[data-close]').addEventListener('click',close);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 search.addEventListener('input',render);
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='k'){e.preventDefault();overlay.hidden?open():close()}else if(e.key==='Escape'&&!overlay.hidden){e.preventDefault();close()}else if(e.key==='Tab'&&!overlay.hidden){const nodes=[overlay.querySelector('[data-close]'),search,...overlay.querySelectorAll('a')];const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
 render();return true;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
function boot(){let tries=0;const interval=setInterval(()=>{if(mount()||++tries>100)clearInterval(interval)},150);}
})();