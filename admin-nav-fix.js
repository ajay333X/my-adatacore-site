(()=>{
  'use strict';
  if(window.__adatacoreAdminNavFixV5)return;
  window.__adatacoreAdminNavFixV5=true;

  const meta={
    overview:['Operations overview','Projects, permissions, review, payouts, support and platform health in one place.'],
    'operations-center':['Operations Center','Prioritized exceptions, applications, reliability, QA appeals and platform audit history.'],
    access:['Access management','Manage platform access, project permissions, and contributor limits.'],
    staff:['Staff & roles','Manage operational staff responsibilities and project-scoped roles.'],
    'support-center':['Support Center','Review and resolve contributor support tickets.'],
    projects:['Projects','Create and manage projects and available task capacity.'],
    submissions:['Final audit','Review submissions awaiting a final decision.'],
    payments:['Payments','Manage approved contributor payouts and payment states.'],
    'finance-ledger':['Finance ledger','Audit contributor balance movements and payment-related adjustments.'],
    voice:['Voice vault','Review voice queues and completed sessions.'],
    leads:['Leads','Review company inquiries and annotator applications.']
  };
  const routeMap={overview:'/admin','operations-center':'/admin/operations',access:'/admin/access',staff:'/admin/staff','support-center':'/admin/support',projects:'/admin/projects',submissions:'/admin/final-audit',payments:'/admin/payments','finance-ledger':'/admin/finance',voice:'/admin/voice',leads:'/admin/leads'};
  const pathMap=Object.fromEntries(Object.entries(routeMap).map(([k,v])=>[v,k]));
  let refreshSeq=0;

  function forceVisible(id){
    const panel=document.getElementById(id);if(!panel)return false;
    document.querySelectorAll('[data-tab]').forEach(tab=>{const active=tab.dataset.tab===id;tab.classList.toggle('active',active);tab.setAttribute('aria-current',active?'page':'false')});
    document.querySelectorAll('.panel').forEach(p=>{const active=p.id===id;p.classList.toggle('active',active);p.style.setProperty('display',active?'block':'none','important');p.setAttribute('aria-hidden',active?'false':'true')});
    const heading=document.querySelector('.page-header h1'),sub=document.querySelector('.page-header .page-sub');if(meta[id]){if(heading)heading.textContent=meta[id][0];if(sub)sub.textContent=meta[id][1]}
    const main=document.querySelector('.app-main');try{window.scrollTo({top:0,left:0,behavior:'instant'})}catch(_){window.scrollTo(0,0)}if(main&&typeof main.scrollTo==='function'){try{main.scrollTo({top:0,left:0,behavior:'instant'})}catch(_){main.scrollTop=0}}
    return true;
  }

  async function refreshPanel(id){
    const seq=++refreshSeq;
    try{
      if(id==='access'&&typeof loadAccess==='function'){await loadAccess();if(seq!==refreshSeq)return;if(typeof renderAccessUsers==='function')renderAccessUsers();return}
      if(id==='operations-center'){document.getElementById('opsSuiteRefresh')?.click();return}
      if(id==='staff'){document.getElementById('staffRoleRefresh')?.click();return}
      if(id==='support-center'){document.getElementById('supportRefresh')?.click();return}
      if(id==='finance-ledger'){document.getElementById('ledgerRefresh')?.click();return}
      if(typeof refresh==='function')await refresh();if(seq!==refreshSeq)return;if(id==='overview'&&typeof renderOverview==='function')renderOverview();
    }catch(error){
      if(seq!==refreshSeq)return;const panel=document.getElementById(id);let notice=panel?.querySelector('[data-admin-panel-error]');if(panel&&!notice){notice=document.createElement('div');notice.dataset.adminPanelError='1';notice.className='card';notice.style.cssText='margin-bottom:14px;color:var(--red);font-size:12px';panel.prepend(notice)}if(notice)notice.textContent=`Unable to refresh this section: ${String(error?.message||error||'Unknown error')}`;
    }
  }

  function switchPanel(id,options={}){
    if(!id)return;if(id==='tasks'){location.assign('/admin/assignments');return}if(!forceVisible(id))return;
    const route=routeMap[id]||'/admin';if(!options.skipHistory){try{history[options.replace?'replaceState':'pushState']({...(history.state||{}),adminTab:id},'',route)}catch(_){ }}refreshPanel(id);
  }

  document.addEventListener('click',e=>{const target=e.target instanceof Element?e.target:null,tab=target?.closest('[data-tab]');if(!tab)return;e.preventDefault();e.stopImmediatePropagation();switchPanel(tab.dataset.tab)},true);
  try{window.showTab=switchPanel}catch(_){ }window.adatacoreAdminShowTab=switchPanel;
  window.addEventListener('popstate',()=>{const id=pathMap[location.pathname]||history.state?.adminTab||'overview';if(document.getElementById(id)&&id!=='tasks'){forceVisible(id);refreshPanel(id)}});

  const legacy=location.hash.replace(/^#/,'');
  const initial=pathMap[location.pathname]||(legacy&&document.getElementById(legacy)&&legacy!=='tasks'?legacy:(history.state?.adminTab&&document.getElementById(history.state.adminTab)?history.state.adminTab:'overview'));
  forceVisible(initial);try{history.replaceState({...(history.state||{}),adminTab:initial},'',routeMap[initial]||'/admin')}catch(_){ }
})();
