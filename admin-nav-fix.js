(()=>{
  'use strict';
  if(window.__adatacoreAdminNavFix)return;
  window.__adatacoreAdminNavFix=true;

  const switchPanel=id=>{
    if(!id)return;
    if(id==='tasks'){
      location.href='/admin/assignments';
      return;
    }
    const panel=document.getElementById(id);
    if(!panel)return;
    document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));
    document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===id));
    try{
      history.replaceState(null,'',id==='overview'?'/admin':`/admin#${encodeURIComponent(id)}`);
    }catch(_){ }
    if(typeof refresh==='function'){
      Promise.resolve(refresh()).catch(()=>{});
    }
  };

  document.addEventListener('click',e=>{
    const tab=e.target.closest('[data-tab]');
    if(!tab)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    switchPanel(tab.dataset.tab);
  },true);

  const initial=location.hash.replace(/^#/,'');
  if(initial&&document.getElementById(initial)&&initial!=='tasks')switchPanel(initial);

  window.adatacoreAdminShowTab=switchPanel;
})();
