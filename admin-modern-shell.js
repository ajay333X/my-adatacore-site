(()=>{
'use strict';
if(window.__adatacoreModernAdmin)return;
window.__adatacoreModernAdmin=true;
const sidebar=document.querySelector('.sidebar');
const shell=document.querySelector('.app-shell');
if(!sidebar||!shell)return;
document.documentElement.classList.add('ac-admin-modern');
const iconPaths={
overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
projects:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M7 5V3h5l2 2"/>',
people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v1"/>',
quality:'<path d="M8 3h8M9 3v3m6-3v3M6 5h12a2 2 0 0 1 2 2v13H4V7a2 2 0 0 1 2-2Z"/><path d="m8 13 2 2 5-5"/>',
finance:'<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9h19M7 15h4"/>',
platform:'<path d="M12 2v3m0 14v3M4.93 4.93l2.12 2.12m9.9 9.9 2.12 2.12M2 12h3m14 0h3M4.93 19.07l2.12-2.12m9.9-9.9 2.12-2.12"/><circle cx="12" cy="12" r="4"/>',
workspace:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M9 9h12"/>',
search:'<circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 5 5"/>',
chevron:'<path d="m7 10 5 5 5-5"/>',
panel:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
close:'<path d="M5 5l14 14M19 5 5 19"/>'
};
const ico=(key,klass='ac-svg')=>'<svg class="'+klass+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(iconPaths[key]||iconPaths.projects)+'</svg>';
const categories=[
{id:'projects',title:'Projects & Work',desc:'Projects, assignments, production tools'},
{id:'people',title:'People & Access',desc:'Contributors, roles, permissions'},
{id:'quality',title:'Quality & Reviews',desc:'Reviews, audits and quality'},
{id:'finance',title:'Finance',desc:'Payments, ledgers and reports'},
{id:'platform',title:'Platform & Tools',desc:'Operations, safety and integrations'},
{id:'workspace',title:'Workspace',desc:'Contributor view and account'}
];
const keyFor=el=>((el.getAttribute('data-tab')||'')+' '+(el.id||'')+' '+(el.getAttribute('href')||'')+' '+(el.textContent||'')).toLowerCase();
function categoryFor(link){
 const tab=(link.dataset.tab||'').toLowerCase(),s=keyFor(link);
 if(tab==='overview'||/operations overview/.test(s))return 'overview';
 if(/sign out|logout|contributor view|contributor workspace|\/workspace\b/.test(s))return 'workspace';
 if(/finance|ledger|payments|payout|earning|billing/.test(s))return 'finance';
 if(/final.audit|review|qa|quality|submission|done.task/.test(s))return 'quality';
 if(/access|staff|role|people|user|contributor.ops|application|lead|support/.test(s))return 'people';
 if(/project|transcription|assignment|audio|voice|vault|task|queue/.test(s))return 'projects';
 return 'platform';
}
const brand=sidebar.querySelector('.brand');
const tools=document.createElement('div');tools.className='ac-sidebar-tools';
tools.innerHTML='<button class="ac-sidebar-search" type="button" title="Search admin tools">'+ico('search')+'<span>Search tools</span><kbd>⌘ K</kbd></button><button class="ac-collapse" type="button" aria-label="Collapse sidebar" title="Collapse sidebar">'+ico('panel')+'</button>';
brand?.insertAdjacentElement('afterend',tools);
const filterWrap=document.createElement('div');filterWrap.className='ac-filter-wrap';
filterWrap.innerHTML='<label class="ac-sr-only" for="acAdminToolSearch">Find a navigation option</label><input type="search" id="acAdminToolSearch" placeholder="Filter tools..." autocomplete="off" aria-label="Filter admin navigation">';
tools.insertAdjacentElement('afterend',filterWrap);
const find=filterWrap.querySelector('input');
const modernNav=document.createElement('nav');modernNav.className='ac-modern-nav';modernNav.setAttribute('aria-label','Admin navigation');
filterWrap.insertAdjacentElement('afterend',modernNav);
const overview=document.createElement('div');overview.className='ac-modern-overview';modernNav.appendChild(overview);
const groups=new Map();
for(const cat of categories){
 const group=document.createElement('section');group.className='ac-nav-section';group.dataset.acCategory=cat.id;
 const toggle=document.createElement('button');toggle.type='button';toggle.className='ac-nav-heading';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('title',cat.title);
 toggle.innerHTML=ico(cat.id)+'<span class="ac-heading-label">'+cat.title+'</span>'+ico('chevron','ac-chevron');
 const body=document.createElement('div');body.className='ac-nav-body';body.id='ac-nav-'+cat.id;body.setAttribute('role','group');body.setAttribute('aria-label',cat.title);
 const inner=document.createElement('div');inner.className='ac-nav-inner';body.appendChild(inner);
 toggle.setAttribute('aria-controls',body.id);
 group.append(toggle,body);modernNav.appendChild(group);groups.set(cat.id,{group,toggle,body,inner});
 toggle.addEventListener('click',()=>{setOpen(cat.id,group.dataset.open!=='1');if(document.documentElement.classList.contains('ac-sidebar-collapsed'))setCollapsed(false)});
}
const viewState={open:new Set(['projects']),filter:''};
function setOpen(id,on){
 const data=groups.get(id);if(!data)return;
 data.group.dataset.open=on?'1':'0';data.toggle.setAttribute('aria-expanded',String(on));
 if(on)viewState.open.add(id);else viewState.open.delete(id);
}
function persistOpen(){try{sessionStorage.setItem('ac-admin-categories',JSON.stringify([...viewState.open]))}catch(_){}}
try{const prior=JSON.parse(sessionStorage.getItem('ac-admin-categories')||'null');if(Array.isArray(prior)){viewState.open=new Set(prior.filter(x=>groups.has(x)))}}catch(_){}
for(const id of viewState.open)setOpen(id,true);
for(const [id,data] of groups){data.toggle.addEventListener('click',persistOpen)}
function visibleLink(link){
 if(link.getAttribute('aria-hidden')==='true'||link.hidden)return false;
 const style=link.style;
 if(style.display==='none'||style.visibility==='hidden')return false;
 // Existing role scoping uses inline display:none and aria-hidden.
 return true;
}
function updateHeadingCount(){
 for(const [id,g] of groups){const all=[...g.inner.querySelectorAll('.nav-link')];g.group.hidden=all.length===0||all.every(l=>!visibleLink(l));}
}
function markLink(link){
 if(link.dataset.acPolished==='1')return;
 link.dataset.acPolished='1';
 const raw=link.textContent.trim();
 const clean=raw.replace(/^[✦★✧]\s*/,'');
 if(clean!==raw)link.textContent=clean;
 if(link.dataset.tab==='overview'&&!link.querySelector('.ac-svg'))link.insertAdjacentHTML('afterbegin',ico('overview'));

 link.classList.add('ac-nav-item');
}
function mountLinks(){
 let changed=false;
 // Keep original elements and their event handlers; no duplicate navigation or permission paths.
 const candidates=[...sidebar.querySelectorAll('.nav-link')];
 for(const link of candidates){
  if(link.closest('.ac-nav-section')||link.closest('.ac-modern-overview'))continue;
  if(link.closest('.ac-sidebar-tools'))continue;
  const type=categoryFor(link);markLink(link);
  if(type==='overview')overview.appendChild(link);else groups.get(type).inner.appendChild(link);
  changed=true;
 }
 const all=[...modernNav.querySelectorAll('.nav-link')];
 for(const link of all){
  const type=categoryFor(link);
  const destination=type==='overview'?overview:groups.get(type).inner;
  if(link.parentElement!==destination){destination.appendChild(link);changed=true}
 }
 updateHeadingCount();
 return changed;
}
function updateActive(){
 for(const [id,g] of groups){
  const items=[...g.inner.querySelectorAll('.nav-link')];
  const active=items.some(x=>x.classList.contains('active')&&visibleLink(x));
  g.group.classList.toggle('ac-has-active',active);
  if(active&&!viewState.filter&&g.group.dataset.open!=='1'){setOpen(id,true)}
 }
}
function applyFilter(){
 const q=viewState.filter.toLowerCase().trim();
 for(const [id,g] of groups){
  let matched=0;
  for(const link of g.inner.querySelectorAll('.nav-link')){
   const yes=!q||keyFor(link).includes(q);
   link.classList.toggle('ac-filter-miss',!yes);
   if(yes&&visibleLink(link))matched++;
  }
  g.group.classList.toggle('ac-filter-empty',!!q&&matched===0);
  g.group.dataset.searching=q?'1':'0';
  if(q&&matched){g.group.dataset.open='1';g.toggle.setAttribute('aria-expanded','true')}
  else if(!q){g.group.dataset.open=viewState.open.has(id)?'1':'0';g.toggle.setAttribute('aria-expanded',String(viewState.open.has(id)))}
 }
 for(const link of overview.querySelectorAll('.nav-link'))link.classList.toggle('ac-filter-miss',!!q&&!keyFor(link).includes(q));
 if(!q)updateActive();
}
let syncPending=false,processing=false;
function schedule(){
 if(syncPending)return;syncPending=true;
 requestAnimationFrame(()=>{
  syncPending=false;
  if(processing)return;processing=true;
  try{const changed=mountLinks();updateActive();if(changed||viewState.filter)applyFilter()}finally{processing=false}
 });
}
const observer=new MutationObserver(schedule);observer.observe(sidebar,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','aria-hidden']});
schedule();
find.addEventListener('input',()=>{viewState.filter=find.value;applyFilter()});
find.addEventListener('keydown',e=>{if(e.key==='Escape'){find.value='';viewState.filter='';applyFilter();find.blur()}if(e.key==='Enter'){const first=[...modernNav.querySelectorAll('.nav-link')].find(x=>!x.classList.contains('ac-filter-miss')&&visibleLink(x));if(first)first.click()}});
tools.querySelector('.ac-sidebar-search').addEventListener('click',()=>{const trigger=document.getElementById('finderTrigger');if(trigger&&getComputedStyle(trigger).display!=='none')trigger.click();else{find.focus();if(document.documentElement.classList.contains('ac-sidebar-collapsed'))setCollapsed(false)}});
function setCollapsed(collapsed){
 document.documentElement.classList.toggle('ac-sidebar-collapsed',collapsed);
 tools.querySelector('.ac-collapse').setAttribute('aria-label',collapsed?'Expand sidebar':'Collapse sidebar');
 tools.querySelector('.ac-collapse').setAttribute('title',collapsed?'Expand sidebar':'Collapse sidebar');
 if(collapsed){for(const [id,g] of groups)if(g.group.dataset.open==='1')g.group.dataset.beforeCollapse='1';}
}
tools.querySelector('.ac-collapse').addEventListener('click',()=>setCollapsed(!document.documentElement.classList.contains('ac-sidebar-collapsed')));
modernNav.addEventListener('click',e=>{const link=e.target.closest('.nav-link');if(!link)return;const section=link.closest('.ac-nav-section');if(section){setOpen(section.dataset.acCategory,true);persistOpen()}setTimeout(schedule,90)});
const header=document.querySelector('.page-header');
if(header&&!header.querySelector('.ac-header-label')){
 const eyebrow=header.querySelector('.eyebrow');
 if(eyebrow){eyebrow.classList.add('ac-header-label');eyebrow.textContent='ADATACORE  /  ADMIN WORKSPACE'}
}
const copy=document.createElement('div');copy.className='ac-sidebar-bottom';copy.innerHTML='<span class="ac-live-dot"></span> Workspace ready';sidebar.appendChild(copy);
window.adatacoreModernAdmin={refresh:schedule,openCategory:id=>{setOpen(id,true);persistOpen()},resetSearch:()=>{find.value='';viewState.filter='';applyFilter()}};
})();