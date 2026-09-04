(()=>{
  'use strict';

  const style=document.createElement('style');
  style.textContent='.p360-copy-id{display:inline-flex;align-items:center;gap:4px;padding:1px 3px;margin:-1px -3px;border-radius:5px;cursor:pointer;touch-action:manipulation;word-break:break-all}.p360-copy-id:hover{background:rgba(124,58,237,.09);color:var(--text)}.p360-copy-id:focus-visible{outline:2px solid #8065e4;outline-offset:2px}.p360-copy-id::after{content:"⧉";font-size:9px;opacity:.6}.p360-copy-id.copied::after{content:"✓";opacity:1}.p360-copy-toast{position:fixed;left:50%;bottom:max(24px,env(safe-area-inset-bottom));transform:translate(-50%,8px);z-index:99999;padding:9px 12px;border:1px solid var(--line2);border-radius:10px;background:var(--panel);color:var(--text);box-shadow:0 12px 34px rgba(13,14,25,.18);font-size:11px;font-weight:800;opacity:0;pointer-events:none;transition:.16s ease}.p360-copy-toast.show{opacity:1;transform:translate(-50%,0)}';
  document.head.appendChild(style);

  const toast=document.createElement('div');
  toast.className='p360-copy-toast';
  toast.setAttribute('role','status');
  toast.setAttribute('aria-live','polite');
  toast.textContent='Copied to clipboard';
  document.body.appendChild(toast);
  let toastTimer;

  function showToast(){
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>toast.classList.remove('show'),1200);
  }

  function copySpan(value){
    const span=document.createElement('span');
    span.className='p360-copy-id';
    span.tabIndex=0;
    span.dataset.copyId=value;
    span.title='Tap to copy';
    span.setAttribute('aria-label',`Copy identifier ${value}`);
    span.textContent=value;
    return span;
  }

  function replaceValue(el,value){
    if(!el||!value||el.querySelector('.p360-copy-id'))return;
    const text=el.textContent;
    const index=text.indexOf(value);
    if(index<0)return;
    el.textContent='';
    el.append(document.createTextNode(text.slice(0,index)),copySpan(value),document.createTextNode(text.slice(index+value.length)));
  }

  function enhance(root=document.getElementById('profileWrap')){
    if(!root)return;

    const identity=root.querySelector('.identity-name p');
    if(identity&&!identity.querySelector('.p360-copy-id')){
      const parts=identity.textContent.split(' · ');
      if(parts.length>1&&parts[1]&&parts[1]!=='No UID')replaceValue(identity,parts[1].trim());
    }

    root.querySelectorAll('[data-panel="activity"] .row small').forEach(el=>{
      const match=el.textContent.match(/\bTask\s+([^·\s]+)/i);
      if(match?.[1])replaceValue(el,match[1]);
    });

    root.querySelectorAll('[data-panel="projects"] .row strong').forEach(el=>{
      const match=el.textContent.match(/^Project\s+(.+)$/i);
      if(match?.[1])replaceValue(el,match[1].trim());
    });

    root.querySelectorAll('[data-panel="support"] .row').forEach(row=>{
      const title=row.querySelector('strong');
      const meta=row.querySelector('small');
      const source=meta?.textContent||title?.textContent||'';
      const first=source.split(' · ')[0].trim();
      if(first&&first!=='Ticket'&&first!=='—'){
        if(meta&&meta.textContent.includes(first))replaceValue(meta,first);
        else if(title&&title.textContent.includes(first))replaceValue(title,first);
      }
    });
  }

  async function activate(el){
    const value=el?.dataset?.copyId;
    if(!value)return;
    try{
      await navigator.clipboard.writeText(value);
      el.classList.add('copied');
      showToast();
      setTimeout(()=>el.classList.remove('copied'),1200);
    }catch(_){
      alert('Could not copy this identifier.');
    }
  }

  document.addEventListener('click',e=>{
    const el=e.target.closest('.p360-copy-id');
    if(!el)return;
    e.preventDefault();
    e.stopPropagation();
    activate(el);
  });

  document.addEventListener('keydown',e=>{
    if((e.key==='Enter'||e.key===' ')&&e.target.matches('.p360-copy-id')){
      e.preventDefault();
      activate(e.target);
    }
  });

  const loadAccess360=()=>{
    if(document.querySelector('script[data-access360-loader]'))return;
    const s=document.createElement('script');
    s.src='/admin-people360-access.js?v=20260904-1';
    s.dataset.access360Loader='1';
    document.body.appendChild(s);
  };

  const start=()=>{
    const root=document.getElementById('profileWrap');
    if(!root)return;
    new MutationObserver(()=>enhance(root)).observe(root,{subtree:true,childList:true});
    enhance(root);
    loadAccess360();
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
