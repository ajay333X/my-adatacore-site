(()=>{
  'use strict';
  if(window.__adatacoreAdminUiCleanup)return;
  window.__adatacoreAdminUiCleanup=true;

  const socialTab=document.querySelector('[data-tab="social"]');
  const socialPanel=document.getElementById('social');
  socialTab?.remove();
  socialPanel?.remove();

  // Social Queue has been retired from the Admin Control Center.
  // Keep refresh resilient even if the legacy protected shell still defines it.
  try{window.loadSocial=async()=>{}}catch(_){ }
  try{window.saveSocial=async()=>{}}catch(_){ }
})();
