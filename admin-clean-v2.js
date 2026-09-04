(()=>{
  'use strict';
  if(window.__adatacoreAdminCleanV2)return;
  window.__adatacoreAdminCleanV2=true;

  const sections=[
    {label:'Command',match:/overview|operations center|global search|people 360/i},
    {label:'Work',match:/project|assignment|task|final audit|done task|l2 review|voice/i},
    {label:'People',match:/access|staff|role|application|lead|support/i},
    {label:'Finance',match:/payment|finance|ledger/i},
    {label:'Platform',match:/integration|health|coreforge|trust|safety|social/i},
    {label:'Workspace',match:/contributor|workspace|sign out/i}
  ];

  function labelFor(el){
    const hay=`${el.textContent||''} ${el.getAttribute('href')||''} ${el.dataset.tab||''}`;
    return sections.find(s=>s.match.test(hay))?.label||'More';
  }

  function tidySidebar(){
    const sidebar=document.querySelector('.sidebar');
    if(!sidebar)return;
    const links=[...sidebar.querySelectorAll('.nav-link')].filter(x=>!x.closest('[data-admin-clean-group]'));
    if(!links.length)return;

    const seen=new Set();
    links.forEach(link=>{
      const label=labelFor(link);
      if(!seen.has(label)){
        const title=document.createElement('div');
        title.className='admin-nav-section';
        title.dataset.adminCleanGroup=label;
        title.textContent=label;
        link.parentNode.insertBefore(title,link);
        seen.add(label);
      }
      link.dataset.adminSection=label;
    });

    sidebar.querySelectorAll('.nav-label').forEach(x=>{
      if(!x.textContent.trim())x.remove();
    });
  }

  function improveTables(){
    document.querySelectorAll('table').forEach(table=>{
      const wrap=table.parentElement;
      if(wrap&&!wrap.style.overflowX)wrap.style.overflowX='auto';
    });
  }

  function markDangerous(){
    document.querySelectorAll('.btn-danger').forEach(btn=>{
      if(!btn.title)btn.title='This action may change or remove data/access';
    });
  }

  function apply(){tidySidebar();improveTables();markDangerous();}
  apply();
  const observer=new MutationObserver(()=>requestAnimationFrame(apply));
  observer.observe(document.body,{childList:true,subtree:true});
})();
