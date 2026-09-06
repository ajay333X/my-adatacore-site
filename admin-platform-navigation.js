(()=>{
  'use strict';
  if(window.__adatacorePlatformNavigation)return;
  window.__adatacorePlatformNavigation=true;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const style=document.createElement('style');
  style.textContent=`.platform-tools{margin-top:18px}.platform-tool-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.platform-tool-card{padding:16px;cursor:pointer}.platform-tool-card:hover{border-color:var(--line2);background:var(--panel2)}.platform-tool-card strong{display:block;font-size:13px;margin-top:6px}.platform-tool-card span{display:block;color:var(--muted);font-size:10px;line-height:1.5;margin-top:5px}.platform-panel-shell>.section-title{margin-bottom:14px}@media(max-width:900px){.platform-tool-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);

  function controlGroup(){return [...document.querySelectorAll('.sidebar .nav-group')].find(g=>/control center/i.test(g.querySelector('.nav-label')?.textContent||''))||document.querySelector('.sidebar .nav-group')}
  function addTab(id,label,afterId){
    const group=controlGroup();if(!group||group.querySelector(`[data-tab="${id}"]`))return;
    const b=document.createElement('button');b.className='nav-link';b.dataset.tab=id;b.textContent=label;
    const after=afterId?group.querySelector(`[data-tab="${afterId}"]`):null;
    if(after?.nextSibling)group.insertBefore(b,after.nextSibling);else group.appendChild(b);
  }
  function ensureWorkspaceLink(){
    const group=controlGroup();if(!group||group.querySelector('[data-contributor-workspace-link]'))return;
    const a=document.createElement('a');a.className='nav-link';a.href='/workspace';a.dataset.contributorWorkspaceLink='1';a.textContent='Contributor Workspace';
    const overview=group.querySelector('[data-tab="overview"]');
    if(overview?.nextSibling)group.insertBefore(a,overview.nextSibling);else group.prepend(a);
  }
  function ensurePanel(id,title,eyebrow,sub){
    let panel=document.getElementById(id);if(panel)return panel;
    const main=document.querySelector('.app-main');if(!main)return null;
    panel=document.createElement('section');panel.id=id;panel.className='panel platform-panel-shell';
    panel.innerHTML=`<div class="section-title"><div><div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2><div class="page-sub">${esc(sub)}</div></div></div><div data-platform-panel-body><div class="card empty">Loading ${esc(title.toLowerCase())}…</div></div>`;
    main.appendChild(panel);return panel;
  }
  function moveCard(cardId,panelId){const card=document.getElementById(cardId),body=document.querySelector(`#${CSS.escape(panelId)} [data-platform-panel-body]`);if(!card||!body)return false;body.innerHTML='';body.appendChild(card);card.style.marginTop='0';return true}
  function addOverviewTools(){const overview=document.getElementById('overview');if(!overview||document.getElementById('platformTools'))return;const wrap=document.createElement('section');wrap.id='platformTools';wrap.className='platform-tools';wrap.innerHTML=`<div class="section-title"><div><div class="eyebrow">New control modules</div><h2>Platform tools</h2><div class="page-sub">Staff permissions, contributor support and finance audit are now first-class Admin modules.</div></div></div><div class="platform-tool-grid"><button class="card platform-tool-card" type="button" data-open-platform="staff"><div class="eyebrow">Access</div><strong>Staff & Roles</strong><span>Assign Super Admin, Project Manager, QA Manager, Finance or Support responsibilities.</span></button><button class="card platform-tool-card" type="button" data-open-platform="support-center"><div class="eyebrow">Operations</div><strong>Support Center</strong><span>Review contributor tickets, priorities, status changes and support notes.</span></button><button class="card platform-tool-card" type="button" data-open-platform="finance-ledger"><div class="eyebrow">Finance</div><strong>Finance Ledger</strong><span>Audit contributor balance changes independently from payout status.</span></button></div>`;
    const health=document.getElementById('adminOperationsHealth');health?overview.insertBefore(wrap,health):overview.appendChild(wrap);
    wrap.addEventListener('click',e=>{const b=e.target.closest('[data-open-platform]');if(b)window.adatacoreAdminShowTab?.(b.dataset.openPlatform)});
  }
  function mount(){
    document.querySelector('[data-tab="social"]')?.remove();document.getElementById('social')?.remove();
    ensureWorkspaceLink();
    addTab('staff','Staff & Roles','access');
    addTab('support-center','Support Center','staff');
    addTab('finance-ledger','Finance Ledger','payments');
    ensurePanel('staff','Staff & Roles','Staff permissions','Assign and manage operational roles without changing contributor project access.');
    ensurePanel('support-center','Support Center','Contributor support','Review and resolve contributor issues from one queue.');
    ensurePanel('finance-ledger','Finance Ledger','Financial audit','Trace every contributor balance movement and adjustment.');
    moveCard('staffRoleCard','staff');
    moveCard('adminSupportCenter','support-center');
    moveCard('financeLedger','finance-ledger');
    addOverviewTools();
    const initial=history.state?.adminTab||location.hash.replace(/^#/,'');if(['staff','support-center','finance-ledger'].includes(initial))setTimeout(()=>window.adatacoreAdminShowTab?.(initial,{replace:true}),0);
  }
  mount();
  const observer=new MutationObserver(()=>{mount();if(document.getElementById('staffRoleCard')&&document.getElementById('adminSupportCenter')&&document.getElementById('financeLedger')&&document.querySelector('[data-contributor-workspace-link]'))observer.disconnect()});
  observer.observe(document.body,{childList:true,subtree:true});
})();
