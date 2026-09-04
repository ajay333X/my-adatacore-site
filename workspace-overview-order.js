(()=>{
  'use strict';
  if(window.__adatacoreWorkspaceOverviewOrder)return;
  window.__adatacoreWorkspaceOverviewOrder=true;

  function setupIsComplete(card){
    if(!card)return false;
    const text=(card.textContent||'').replace(/\s+/g,' ').trim();
    if(/\bSetup complete\b/i.test(text))return true;
    return [...card.querySelectorAll('.pill')].some(el=>(el.textContent||'').trim()==='100%');
  }

  function arrangeOverview(){
    const overview=document.getElementById('view-overview');
    if(!overview)return;

    // A completed setup checklist has no ongoing action value. Remove it so
    // contributors see their actual work immediately after the summary stats.
    const onboarding=document.getElementById('onboardingCard');
    if(setupIsComplete(onboarding))onboarding.remove();

    // Ready assignments are the primary action area. Keep Account tools below
    // the work/activity block instead of placing utilities above active work.
    const columns=overview.querySelector('.overview-columns');
    const tools=document.getElementById('workspaceTools');
    if(columns&&tools&&columns.nextElementSibling!==tools){
      columns.insertAdjacentElement('afterend',tools);
    }
  }

  arrangeOverview();
  const observer=new MutationObserver(arrangeOverview);
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  setTimeout(arrangeOverview,100);
  setTimeout(arrangeOverview,500);
  setTimeout(arrangeOverview,1500);
})();
