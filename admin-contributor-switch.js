(()=>{
  'use strict';
  if(window.__adatacoreAdminContributorSwitch)return;
  window.__adatacoreAdminContributorSwitch=true;

  function fixContributorLinks(root=document){
    root.querySelectorAll?.('a[href="/dashboard"]').forEach(link=>{
      const text=(link.textContent||'').trim().toLowerCase();
      if(text.includes('contributor'))link.setAttribute('href','/workspace');
    });
  }

  fixContributorLinks();
  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(node.nodeType!==1)continue;
        if(node.matches?.('a[href="/dashboard"]')&&(node.textContent||'').toLowerCase().includes('contributor'))node.setAttribute('href','/workspace');
        fixContributorLinks(node);
      }
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});

  document.addEventListener('click',event=>{
    const link=event.target instanceof Element?event.target.closest('a[href="/dashboard"]'):null;
    if(!link||(link.textContent||'').toLowerCase().includes('contributor')===false)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign('/workspace');
  },true);
})();
