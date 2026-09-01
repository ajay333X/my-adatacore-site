(()=>{
  if(window.__adatacoreProjectLabLinkLoaded)return;
  window.__adatacoreProjectLabLinkLoaded=true;

  if(!document.getElementById('projectLabLinkStyles')){
    const style=document.createElement('style');
    style.id='projectLabLinkStyles';
    style.textContent=`.project-lab-open{display:inline-flex;align-items:center;gap:6px}.project-lab-open:after{content:'↗';font-size:10px}.project-stock-head .project-lab-toolbar{justify-content:flex-end}`;
    document.head.appendChild(style);
  }

  const labelText='Create projects, manage task inventory, then open a project for settings, people, bulk assignments, graded templates, reviews, payments and audit history.';
  const setText=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text};

  const relabel=()=>{
    setText(document.querySelector('[data-tab="projects"]'),'Project Lab');
    const panel=document.getElementById('projects');
    if(!panel)return;
    setText(panel.querySelector('.section-title h2'),'Project Lab');
    setText(panel.querySelector('.section-title .page-sub'),labelText);
  };

  let scheduled=false;
  const enhance=()=>{
    scheduled=false;
    relabel();
    document.querySelectorAll('[id^="stock-card-"]').forEach(card=>{
      if(card.querySelector('.project-lab-open'))return;
      const id=Number(card.id.replace('stock-card-',''));
      const head=card.querySelector('.project-stock-head');
      if(!id||!head)return;
      const wrap=document.createElement('div');
      wrap.className='toolbar project-lab-toolbar';
      const a=document.createElement('a');
      a.className='btn btn-primary project-lab-open';
      a.href=`/admin/project-lab?project=${id}`;
      a.textContent='Open Project Lab';
      wrap.appendChild(a);
      head.appendChild(wrap);
    });
  };

  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(enhance);
  };

  enhance();
  const watchRoot=document.getElementById('projects');
  if(watchRoot){
    const observer=new MutationObserver(schedule);
    observer.observe(watchRoot,{subtree:true,childList:true});
  }
  setTimeout(schedule,500);
  setTimeout(schedule,1500);
})();