(()=>{
  const params=new URLSearchParams(location.search);
  const internalTaskId=Number(params.get('task')||0);
  if(!internalTaskId)return;
  const client=typeof db!=='undefined'?db:(window.supabase?window.supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml'):null);
  if(!client)return;

  const style=document.createElement('style');
  style.textContent=`
    .task-id-copy{position:relative;isolation:isolate;display:inline-flex;align-items:center;gap:9px;min-height:40px;padding:8px 11px;border:1px solid rgba(124,92,255,.28);border-radius:12px;background:linear-gradient(135deg,rgba(124,92,255,.10),rgba(255,255,255,.02));color:inherit;cursor:pointer;overflow:visible;box-shadow:0 8px 24px rgba(43,33,91,.08);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease;font:inherit}
    .task-id-copy::before{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(115deg,transparent 20%,rgba(255,255,255,.30) 46%,transparent 68%);transform:translateX(-130%);pointer-events:none;z-index:-1}
    .task-id-copy:hover{transform:translateY(-1px);border-color:rgba(124,92,255,.55);box-shadow:0 12px 30px rgba(82,62,166,.16)}
    .task-id-copy:hover::before{animation:taskCopySweep .7s ease}
    .task-id-copy:active{transform:translateY(0) scale(.985)}
    .task-id-copy .task-id-label{font-size:8px;line-height:1;text-transform:uppercase;letter-spacing:.10em;font-weight:900;opacity:.62}
    .task-id-copy .task-id-value{font:850 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.07em;white-space:nowrap}
    .task-id-copy .task-id-icon{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;border:1px solid currentColor;opacity:.58;font-size:11px;transition:transform .2s ease,opacity .2s ease}
    .task-id-copy .task-copy-pop{position:absolute;left:50%;top:calc(100% + 8px);transform:translate(-50%,-5px) scale(.88);padding:6px 9px;border-radius:999px;background:#0c8f68;color:#fff;font-size:9px;font-weight:900;letter-spacing:.02em;opacity:0;pointer-events:none;white-space:nowrap;box-shadow:0 10px 28px rgba(0,112,79,.28)}
    .task-id-copy.copied{border-color:rgba(14,159,110,.48);background:linear-gradient(135deg,rgba(14,159,110,.16),rgba(124,92,255,.06));animation:taskCopyPulse .58s cubic-bezier(.2,.8,.2,1)}
    .task-id-copy.copied .task-id-icon{transform:rotate(-8deg) scale(1.12);opacity:1}
    .task-id-copy.copied .task-copy-pop{animation:taskCopyPop 1.45s ease both}
    .task-copy-spark{position:absolute;left:50%;top:50%;width:4px;height:4px;border-radius:50%;background:#36d5a2;pointer-events:none;z-index:6;animation:taskSpark .72s cubic-bezier(.18,.78,.2,1) forwards}
    .task-copy-wrap{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    html[data-review-theme="light"] .task-id-copy{background:linear-gradient(135deg,#f5f1ff,#fff);color:#272235;border-color:#d9cdfc;box-shadow:0 8px 22px rgba(69,50,130,.08)}
    @keyframes taskCopySweep{to{transform:translateX(130%)}}
    @keyframes taskCopyPulse{0%{transform:scale(1)}38%{transform:scale(1.045)}100%{transform:scale(1)}}
    @keyframes taskCopyPop{0%{opacity:0;transform:translate(-50%,-4px) scale(.86)}18%,72%{opacity:1;transform:translate(-50%,0) scale(1)}100%{opacity:0;transform:translate(-50%,5px) scale(.96)}}
    @keyframes taskSpark{0%{opacity:1;transform:translate(-50%,-50%) scale(.4)}100%{opacity:0;transform:translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(1.3)}}
    @media(max-width:760px){.task-id-copy{max-width:100%}.task-id-copy .task-id-value{font-size:10px;letter-spacing:.045em}}
    @media(prefers-reduced-motion:reduce){.task-id-copy,.task-id-copy::before,.task-id-copy .task-copy-pop,.task-copy-spark{animation:none!important;transition:none!important}.task-id-copy.copied .task-copy-pop{opacity:1}}
  `;
  document.head.appendChild(style);

  const copyText=async text=>{
    try{await navigator.clipboard.writeText(text);return true}catch(_){
      try{const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();return ok}catch(__){return false}
    }
  };
  const celebrate=btn=>{
    btn.classList.remove('copied');void btn.offsetWidth;btn.classList.add('copied');
    const dirs=[[0,-30],[24,-20],[31,2],[20,24],[0,31],[-20,24],[-31,2],[-24,-20]];
    dirs.forEach(([x,y],i)=>{const s=document.createElement('span');s.className='task-copy-spark';s.style.setProperty('--x',x+'px');s.style.setProperty('--y',y+'px');s.style.animationDelay=(i*18)+'ms';btn.appendChild(s);setTimeout(()=>s.remove(),900)});
    clearTimeout(btn._copyTimer);btn._copyTimer=setTimeout(()=>btn.classList.remove('copied'),1500);
  };
  const makeButton=publicId=>{
    const b=document.createElement('button');b.type='button';b.className='task-id-copy';b.title='Click to copy Task ID';b.setAttribute('aria-label',`Copy Task ID ${publicId}`);
    b.innerHTML=`<span class="task-id-label">Task ID</span><span class="task-id-value">${publicId}</span><span class="task-id-icon">⧉</span><span class="task-copy-pop">Copied ✓</span>`;
    b.addEventListener('click',async()=>{const ok=await copyText(publicId);if(ok)celebrate(b)});
    return b;
  };

  async function syncReviewContext(publicId){
    if(!location.pathname.startsWith('/review'))return;
    const own=document.getElementById('reviewTask');if(own)own.textContent=`Task ${publicId} · L2`;
    try{
      if(typeof item==='undefined'||!item?.source_task_id)return;
      const {data:src}=await client.from('tasks').select('public_task_id').eq('id',Number(item.source_task_id)).maybeSingle();
      if(src?.public_task_id){
        const a=document.getElementById('sourceTask'),b=document.getElementById('summaryTask');
        if(a)a.textContent=`Task ${src.public_task_id} · L1`;
        if(b)b.textContent=`Task ${src.public_task_id}`;
      }
      const top=document.getElementById('topItem');if(top&&item?.submission_id)top.textContent=`Submission #${item.submission_id} · L2 Task ${publicId}`;
    }catch(_){ }
  }

  async function init(){
    const {data,error}=await client.from('tasks').select('id,public_task_id,layer,title').eq('id',internalTaskId).maybeSingle();
    if(error||!data?.public_task_id)return;
    const publicId=data.public_task_id;
    const button=makeButton(publicId);
    if(location.pathname.startsWith('/review')){
      const actions=document.querySelector('.topactions');if(actions)actions.prepend(button);
      await syncReviewContext(publicId);
      if(typeof renderItem==='function'){
        const original=renderItem;
        const wrapped=function(...args){const out=original.apply(this,args);setTimeout(()=>syncReviewContext(publicId),0);return out};
        try{renderItem=wrapped}catch(_){ }
      }
      setTimeout(()=>syncReviewContext(publicId),900);
    }else{
      const head=document.querySelector('.voice-head');const exit=head?.querySelector('a.btn.btn-secondary');
      if(head){const wrap=document.createElement('div');wrap.className='task-copy-wrap';wrap.appendChild(button);if(exit)head.insertBefore(wrap,exit);else head.appendChild(wrap)}
    }
  }
  init();
})();