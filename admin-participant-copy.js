(()=>{
  'use strict';

  const style=document.createElement('style');
  style.textContent=`
    .snapshot-copy-id{display:inline-flex;align-items:center;gap:5px;cursor:pointer;touch-action:manipulation;border-radius:6px;padding:2px 4px;margin:-2px -4px;word-break:break-all}
    .snapshot-copy-id:hover{background:rgba(124,58,237,.10)}
    .snapshot-copy-id:focus-visible{outline:2px solid #8065e4;outline-offset:2px}
    .snapshot-copy-id::after{content:'⧉';font-size:9px;opacity:.55}
    .snapshot-copy-id.copied::after{content:'✓';opacity:1}
    .snapshot-copy-toast{position:fixed;left:50%;bottom:max(22px,env(safe-area-inset-bottom));transform:translate(-50%,8px);z-index:99999;padding:9px 12px;border:1px solid var(--line2);border-radius:10px;background:var(--panel);color:var(--text);box-shadow:0 12px 34px rgba(13,14,25,.18);font-size:11px;font-weight:800;opacity:0;pointer-events:none;transition:.16s ease}
    .snapshot-copy-toast.show{opacity:1;transform:translate(-50%,0)}
  `;
  document.head.appendChild(style);

  const toast=document.createElement('div');
  toast.className='snapshot-copy-toast';
  toast.setAttribute('role','status');
  toast.setAttribute('aria-live','polite');
  toast.textContent='Copied to clipboard';
  document.body.appendChild(toast);
  let toastTimer;

  const showToast=()=>{
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>toast.classList.remove('show'),1200);
  };

  const makeCopyable=(el,value)=>{
    value=String(value??'').trim();
    if(!el||!value||value==='—'||el.classList.contains('snapshot-copy-id'))return;
    el.classList.add('snapshot-copy-id');
    el.dataset.copyValue=value;
    el.tabIndex=0;
    el.title='Tap to copy';
    el.setAttribute('aria-label',`Copy identifier ${value}`);
  };

  const enhance=()=>{
    const root=document.getElementById('participantSnapshot');
    if(!root||!root.classList.contains('visible'))return;

    root.querySelectorAll('.snapshot-field').forEach(field=>{
      const label=field.querySelector('span')?.textContent.trim().toLowerCase();
      const valueEl=field.querySelector('strong');
      if(label==='contributor uid'&&valueEl)makeCopyable(valueEl,valueEl.textContent);
    });

    root.querySelectorAll('.snapshot-card').forEach(card=>{
      const heading=card.querySelector('h3')?.textContent.trim().toLowerCase();
      if(heading!=='recent assignments'&&heading!=='recent submissions')return;
      card.querySelectorAll('tbody tr').forEach(row=>{
        const cell=row.querySelector('td:first-child');
        if(!cell||cell.colSpan>1)return;
        const text=cell.textContent.trim();
        const match=text.match(/(?:Task\s*#|Submission\s*#|#)\s*(\d+)/i);
        if(match?.[1])makeCopyable(cell,match[1]);
      });
    });

    const meta=root.querySelector('.snapshot-meta');
    if(meta&&!meta.querySelector('.snapshot-copy-id')){
      const match=meta.textContent.match(/\bUID\s+([^\s·]+)/i);
      if(match?.[1]){
        const text=meta.textContent;
        const idx=text.indexOf(match[1]);
        if(idx>=0){
          const span=document.createElement('span');
          span.textContent=match[1];
          makeCopyable(span,match[1]);
          meta.textContent='';
          meta.append(document.createTextNode(text.slice(0,idx)),span,document.createTextNode(text.slice(idx+match[1].length)));
        }
      }
    }
  };

  const fallbackCopy=value=>{
    const ta=document.createElement('textarea');
    ta.value=value;
    ta.setAttribute('readonly','');
    ta.style.position='fixed';
    ta.style.opacity='0';
    document.body.appendChild(ta);
    ta.select();
    const ok=document.execCommand('copy');
    ta.remove();
    return ok;
  };

  const copy=async el=>{
    const value=el?.dataset?.copyValue;
    if(!value)return;
    let ok=false;
    try{
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);ok=true;}
    }catch(_){}
    if(!ok){try{ok=fallbackCopy(value)}catch(_){}}
    if(ok){
      el.classList.add('copied');
      showToast();
      setTimeout(()=>el.classList.remove('copied'),1200);
    }else alert('Could not copy this identifier.');
  };

  document.addEventListener('click',e=>{
    const el=e.target.closest('.snapshot-copy-id');
    if(!el)return;
    e.preventDefault();
    e.stopPropagation();
    copy(el);
  },true);

  document.addEventListener('keydown',e=>{
    const el=e.target.closest?.('.snapshot-copy-id');
    if(!el||(e.key!=='Enter'&&e.key!==' '))return;
    e.preventDefault();
    copy(el);
  });

  const start=()=>{
    const root=document.getElementById('participantSnapshot');
    if(!root)return;
    new MutationObserver(enhance).observe(root,{subtree:true,childList:true});
    enhance();
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
