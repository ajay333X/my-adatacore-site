(()=>{
  'use strict';
  if(window.__adatacorePlatformNavigation)return;
  window.__adatacorePlatformNavigation=true;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const style=document.createElement('style');
  style.textContent=`.platform-tools{margin-top:18px}.platform-tool-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.platform-tool-card{padding:16px;cursor:pointer}.platform-tool-card:hover{border-color:var(--line2);background:var(--panel2)}.platform-tool-card strong{display:block;font-size:13px;margin-top:6px}.platform-tool-card span{display:block;color:var(--muted);font-size:10px;line-height:1.5;margin-top:5px}.platform-panel-shell>.section-title{margin-bottom:14px}.admin-nav-section-label{margin:14px 12px 5px;padding-top:12px;border-top:1px solid var(--line);font-size:9px;line-height:1;text-transform:uppercase;letter-spacing:.11em;font-weight:850;color:var(--muted2)}.admin-nav-section-label:first-of-type{margin-top:6px;padding-top:4px;border-top:0}.sidebar .nav-link[data-contributor-ops-link],.sidebar .nav-link[data-contributor-workspace-link]{display:flex;align-items:center;justify-content:space-between}.sidebar .nav-link[data-contributor-ops-link]::after,.sidebar .nav-link[data-contributor-workspace-link]::after{content:'↗';font-size:10px;opacity:.55}@media(max-width:900px){.platform-tool-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);

  function controlGroup(){return [...document.querySelectorAll('.sidebar .nav-group')].find(g=>/control center/i.test(g.querySelector('.nav-label')?.textContent||''))||document.querySelector('.sidebar .nav-group')}
  function addTab(id,label,afterId){
    const group=controlGroup();if(!group||group.querySelector(`[data-tab="${id}"]`))return;
    const b=document.createElement('button');b.className='nav-link';b.dataset.tab=id;b.textContent=label;
    const after=afterId?group.querySelector(`[data-tab="${afterId}"]`):null;
    if(after?.nextSibling)group.insertBefore(b,after.nextSibling);else group.appendChild(b);
  }
  function ensureLink(selector,label,href,dataKey){
    const group=controlGroup();if(!group)return null;
    let a=group.querySelector(selector);if(a)return a;
    a=document.createElement('a');a.className='nav-link';a.href=href;a.dataset[dataKey]='1';a.textContent=label;group.appendChild(a);return a;
  }
  function ensureWorkspaceLink(){return ensureLink('[data-contributor-workspace-link]','Contributor Workspace','/workspace','contributorWorkspaceLink')}
  function ensureContributorOpsLink(){return ensureLink('[data-contributor-ops-link]','Contributor Ops','/admin/contributor-ops','contributorOpsLink')}
  function ensurePanel(id,title,eyebrow,sub){
    let panel=document.getElementById(id);if(panel)return panel;
    const main=document.querySelector('.app-main');if(!main)return null;
    panel=document.createElement('section');panel.id=id;panel.className='panel platform-panel-shell';
    panel.innerHTML=`<div class="section-title"><div><div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2><div class="page-sub">${esc(sub)}</div></div></div><div data-platform-panel-body><div class="card empty">Loading ${esc(title.toLowerCase())}…</div></div>`;
    main.appendChild(panel);return panel;
  }
  function moveCard(cardId,panelId){
    const card=document.getElementById(cardId),body=document.querySelector(`#${CSS.escape(panelId)} [data-platform-panel-body]`);
    if(!card||!body)return false;
    if(card.parentElement===body)return true;
    body.innerHTML='';body.appendChild(card);card.style.marginTop='0';return true;
  }

  const sectionRules=[
    {label:'Overview',match:n=>['overview'].includes(n.key)},
    {label:'Operations',match:n=>['operations-center','support-center'].includes(n.key)||/support|operations|contributor ops/i.test(n.text)},
    {label:'Projects & Work',match:n=>['projects','tasks','submissions','voice'].includes(n.key)||/assignment|project lab|transcription|done tasks|review|voice vault/i.test(n.text)},
    {label:'People & Access',match:n=>['access','staff','leads'].includes(n.key)||/application|people 360|trust|access|staff|lead|contributor workspace/i.test(n.text)},
    {label:'Finance',match:n=>['payments','finance-ledger'].includes(n.key)||/payment|finance|ledger/i.test(n.text)},
    {label:'Platform',match:n=>/integration|coreforge|social/i.test(n.text)}
  ];
  function navInfo(el){return {el,key:el.dataset.tab||'',text:(el.textContent||'').trim()}}
  let lastNavSignature='';
  function organizeNavigation(){
    const group=controlGroup();if(!group)return;
    const items=[...group.children].filter(el=>el.classList?.contains('nav-link')).map(navInfo);
    if(!items.length)return;
    const signature=items.map(n=>`${n.key}|${n.text}|${n.el.getAttribute('href')||''}`).sort().join('||');
    if(signature===lastNavSignature&&group.querySelector('.admin-nav-section-label'))return;
    lastNavSignature=signature;
    group.querySelectorAll('.admin-nav-section-label').forEach(x=>x.remove());
    const used=new Set();
    for(const section of sectionRules){
      const matches=items.filter(n=>!used.has(n.el)&&section.match(n));
      if(!matches.length)continue;
      const label=document.createElement('div');label.className='admin-nav-section-label';label.textContent=section.label;group.appendChild(label);
      matches.forEach(n=>{used.add(n.el);group.appendChild(n.el)});
    }
    const remaining=items.filter(n=>!used.has(n.el));
    if(remaining.length){const label=document.createElement('div');label.className='admin-nav-section-label';label.textContent='More tools';group.appendChild(label);remaining.forEach(n=>group.appendChild(n.el))}
  }
  function addOverviewTools(){const overview=document.getElementById('overview');if(!overview||document.getElementById('platformTools'))return;const wrap=document.createElement('section');wrap.id='platformTools';wrap.className='platform-tools';wrap.innerHTML=`<div class="section-title"><div><div class="eyebrow">Control modules</div><h2>Platform tools</h2><div class="page-sub">Quick access to staff permissions, contributor support and finance audit.</div></div></div><div class="platform-tool-grid"><button class="card platform-tool-card" type="button" data-open-platform="staff"><div class="eyebrow">Access</div><strong>Staff & Roles</strong><span>Assign Super Admin, Project Manager, QA Manager, Finance or Support responsibilities.</span></button><button class="card platform-tool-card" type="button" data-open-platform="support-center"><div class="eyebrow">Operations</div><strong>Support Center</strong><span>Review contributor tickets, priorities, status changes and support notes.</span></button><button class="card platform-tool-card" type="button" data-open-platform="finance-ledger"><div class="eyebrow">Finance</div><strong>Finance Ledger</strong><span>Audit contributor balance changes independently from payout status.</span></button></div>`;
    const health=document.getElementById('adminOperationsHealth');health?overview.insertBefore(wrap,health):overview.appendChild(wrap);
    wrap.addEventListener('click',e=>{const b=e.target.closest('[data-open-platform]');if(b)window.adatacoreAdminShowTab?.(b.dataset.openPlatform)});
  }
  function mount(){
    ensureWorkspaceLink();
    ensureContributorOpsLink();
    addTab('staff','Staff & Roles','access');
    addTab('support-center','Support Center','staff');
    addTab('finance-ledger','Finance Ledger','payments');
    ensurePanel('staff','Staff & Roles','Staff permissions','Assign and manage operational roles without changing contributor project access.');
    ensurePanel('support-center','Support Center','Contributor support','Review and resolve contributor issues from one queue.');
    ensurePanel('finance-ledger','Finance Ledger','Financial audit','Trace every contributor balance movement and adjustment.');
    moveCard('staffRoleCard','staff');
    moveCard('adminSupportCenter','support-center');
    moveCard('financeLedger','finance-ledger');
    organizeNavigation();
    addOverviewTools();
    const initial=history.state?.adminTab||location.hash.replace(/^#/,'');if(['staff','support-center','finance-ledger'].includes(initial))setTimeout(()=>window.adatacoreAdminShowTab?.(initial,{replace:true}),0);
  }
  mount();
  let tidyTimer=null;
  const observer=new MutationObserver(()=>{clearTimeout(tidyTimer);tidyTimer=setTimeout(mount,120)});
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>{try{observer.disconnect()}catch(_){};mount()},2500);
})();
