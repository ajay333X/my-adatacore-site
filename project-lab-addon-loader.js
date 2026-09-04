(()=>{
  'use strict';
  if(window.__adatacoreProjectLabAddonLoader)return;window.__adatacoreProjectLabAddonLoader=true;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const load=src=>new Promise(resolve=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=resolve;document.body.appendChild(s)});
  (async()=>{
    for(let i=0;i<50&&!window.__adatacoreProjectAccess;i++)await sleep(100);
    const a=window.__adatacoreProjectAccess;if(!a?.allowed)return;
    if(a.is_super_admin){for(const src of ['/project-lab-assignment-center.js?v=1','/project-lab-advanced-controls.js?v=1','/project-lab-operations-suite.js?v=1','/project-lab-transcription-settings.js?v=1','/project-lab-slack-channel.js?v=20260904-4'])await load(src);return}
    if((a.project_roles||[]).includes('project_manager'))await load('/project-lab-assignment-center.js?v=1');
  })();
})();
