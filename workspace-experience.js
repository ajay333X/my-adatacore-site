(()=>{
  'use strict';
  if(window.__adatacoreWorkspaceExperience)return;
  window.__adatacoreWorkspaceExperience=true;
  if(!window.supabase?.createClient)return;

  const U='https://llmhyezgcnbognmmsnzq.supabase.co';
  const K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
  const client=window.supabase.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate=v=>{try{return new Date(v).toLocaleString()}catch(_){return ''}};

  const style=document.createElement('style');
  style.textContent=`.workspace-notify-wrap{position:relative;margin-left:auto}.workspace-notify-btn{width:42px;height:42px;border-radius:12px;border:1px solid var(--line);background:var(--panel);color:var(--text);cursor:pointer;display:grid;place-items:center;position:relative}.workspace-notify-btn:hover{background:var(--panel2)}.workspace-notify-count{position:absolute;right:-5px;top:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--red);color:#fff;display:grid;place-items:center;font-size:9px;font-weight:850;border:2px solid var(--panel)}.workspace-notify-panel{position:absolute;right:0;top:50px;width:min(390px,calc(100vw - 28px));max-height:520px;overflow:auto;padding:8px;border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:0 22px 70px rgba(0,0,0,.22);z-index:200;display:none}.workspace-notify-panel.open{display:block}.notify-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px}.notify-head strong{font-size:12px}.notify-list{display:grid;gap:5px}.notify-item{display:block;width:100%;text-align:left;padding:11px;border:1px solid transparent;border-radius:11px;background:transparent;color:var(--text);cursor:pointer}.notify-item:hover{background:var(--panel2)}.notify-item.unread{background:var(--brand-soft);border-color:rgba(124,58,237,.12)}.notify-title{font-size:11px;font-weight:800}.notify-body{font-size:10px;color:var(--muted);line-height:1.5;margin-top:4px}.notify-time{font-size:8px;color:var(--muted2);margin-top:6px}@media(max-width:640px){.workspace-notify-wrap{margin-left:0}.workspace-notify-panel{position:fixed;right:14px;left:14px;top:70px;width:auto}}`;
  document.head.appendChild(style);

  function mount(){
    document.querySelector('[data-adatacore-quality-link]')?.remove();
    document.getElementById('view-quality')?.remove();
    const header=document.querySelector('.page-header');
    if(header&&!document.getElementById('workspaceNotifyWrap')){
      const wrap=document.createElement('div');wrap.id='workspaceNotifyWrap';wrap.className='workspace-notify-wrap';
      wrap.innerHTML=`<button id="workspaceNotifyBtn" class="workspace-notify-btn" type="button" aria-label="Notifications">🔔<span id="workspaceNotifyCount" class="workspace-notify-count" hidden>0</span></button><div id="workspaceNotifyPanel" class="workspace-notify-panel"><div class="notify-head"><strong>Notifications</strong><button id="markAllNotifications" class="btn btn-secondary" type="button">Mark all read</button></div><div id="workspaceNotifyList" class="notify-list"><div class="empty-compact">Loading…</div></div></div>`;
      const chip=header.querySelector('.profile-chip');chip?header.insertBefore(wrap,chip):header.appendChild(wrap);
      wrap.querySelector('#workspaceNotifyBtn')?.addEventListener('click',async e=>{e.stopPropagation();wrap.querySelector('#workspaceNotifyPanel')?.classList.toggle('open');await loadNotifications();});
      wrap.querySelector('#markAllNotifications')?.addEventListener('click',async()=>{await client.rpc('mark_all_my_notifications_read');await loadNotifications();});
    }
  }

  async function loadNotifications(){
    const list=document.getElementById('workspaceNotifyList'),countEl=document.getElementById('workspaceNotifyCount');if(!list||!countEl)return;
    const {data,error}=await client.rpc('get_my_notifications',{p_limit:40});
    if(error){list.innerHTML='<div class="empty-compact">Unable to load notifications.</div>';return}
    const items=Array.isArray(data?.items)?data.items:[],unread=Number(data?.unread||0);countEl.hidden=unread<=0;countEl.textContent=unread>99?'99+':String(unread);
    list.innerHTML=items.length?items.map(n=>`<button class="notify-item ${n.read_at?'':'unread'}" data-notification="${n.id}" data-link="${esc(n.link||'')}"><div class="notify-title">${esc(n.title)}</div>${n.body?`<div class="notify-body">${esc(n.body)}</div>`:''}<div class="notify-time">${fmtDate(n.created_at)}</div></button>`).join(''):'<div class="empty-compact">You are all caught up.</div>';
    list.querySelectorAll('[data-notification]').forEach(btn=>btn.addEventListener('click',async()=>{await client.rpc('mark_my_notification_read',{p_id:btn.dataset.notification});const link=btn.dataset.link;if(link)location.href=link;else await loadNotifications();}));
  }

  mount();loadNotifications();
  if(location.hash==='#quality')history.replaceState(null,'','#overview');
  document.addEventListener('click',e=>{const panel=document.getElementById('workspaceNotifyPanel'),wrap=document.getElementById('workspaceNotifyWrap');if(panel?.classList.contains('open')&&!wrap?.contains(e.target))panel.classList.remove('open')});
})();
