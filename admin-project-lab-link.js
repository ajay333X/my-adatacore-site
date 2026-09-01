(()=>{
  if(window.__adatacoreProjectLabLinkLoaded)return;
  window.__adatacoreProjectLabLinkLoaded=true;

  if(!document.getElementById('projectLabLinkStyles')){
    const style=document.createElement('style');
    style.id='projectLabLinkStyles';
    style.textContent=`.project-lab-open,.transcription-open{display:inline-flex;align-items:center;gap:6px}.project-lab-open:after,.transcription-open:after{content:'↗';font-size:10px}.project-stock-head .project-lab-toolbar{justify-content:flex-end;flex-wrap:wrap}.transcription-open{border-color:rgba(124,58,237,.28)!important}`;
    document.head.appendChild(style);
  }

  const labelText='Create projects, manage task inventory, then open a project for settings, people, assignments, audio transcription, reviews, payments and audit history.';
  const setText=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text};

  const relabel=()=>{
    setText(document.querySelector('[data-tab="projects"]'),'Project Lab');
    const nav=document.querySelector('[data-tab="projects"]');
    if(nav&&!document.getElementById('transcriptionLabNav')){const link=document.createElement('a');link.id='transcriptionLabNav';link.className=nav.className;link.classList.remove('active');link.href='/admin/transcription';link.textContent='Transcription Lab';nav.insertAdjacentElement('afterend',link)}
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
      const id=Number(card.id.replace('stock-card-',''));
      const head=card.querySelector('.project-stock-head');
      if(!id||!head)return;
      let wrap=card.querySelector('.project-lab-toolbar');
      if(!wrap){wrap=document.createElement('div');wrap.className='toolbar project-lab-toolbar';head.appendChild(wrap)}
      if(!wrap.querySelector('.project-lab-open')){
        const a=document.createElement('a');a.className='btn btn-primary project-lab-open';a.href=`/admin/project-lab?project=${id}`;a.textContent='Open Project Lab';wrap.appendChild(a);
      }
      const project=(typeof projects!=='undefined'?projects:[]).find(p=>Number(p.id)===id);
      if(project?.project_type==='transcription'&&!wrap.querySelector('.transcription-open')){
        const t=document.createElement('a');t.className='btn btn-secondary transcription-open';t.href=`/admin/transcription?project=${id}`;t.textContent='Transcription';wrap.appendChild(t);
      }
    });
  };

  const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(enhance)};
  enhance();
  const watchRoot=document.getElementById('projects');
  if(watchRoot){const observer=new MutationObserver(schedule);observer.observe(watchRoot,{subtree:true,childList:true})}
  setTimeout(schedule,500);setTimeout(schedule,1500);
})();