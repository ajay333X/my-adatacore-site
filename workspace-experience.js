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
  style.textContent=`
    .workspace-notify-wrap{position:relative;margin-left:auto}.workspace-notify-btn{width:42px;height:42px;border-radius:12px;border:1px solid var(--line);background:var(--panel);color:var(--text);cursor:pointer;display:grid;place-items:center;position:relative}.workspace-notify-btn:hover{background:var(--panel2)}.workspace-notify-count{position:absolute;right:-5px;top:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--red);color:#fff;display:grid;place-items:center;font-size:9px;font-weight:850;border:2px solid var(--panel)}.workspace-notify-panel{position:absolute;right:0;top:50px;width:min(390px,calc(100vw - 28px));max-height:520px;overflow:auto;padding:8px;border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:0 22px 70px rgba(0,0,0,.22);z-index:200;display:none}.workspace-notify-panel.open{display:block}.notify-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px}.notify-head strong{font-size:12px}.notify-list{display:grid;gap:5px}.notify-item{display:block;width:100%;text-align:left;padding:11px;border:1px solid transparent;border-radius:11px;background:transparent;color:var(--text);cursor:pointer}.notify-item:hover{background:var(--panel2)}.notify-item.unread{background:var(--brand-soft);border-color:rgba(124,58,237,.12)}.notify-title{font-size:11px;font-weight:800}.notify-body{font-size:10px;color:var(--muted);line-height:1.5;margin-top:4px}.notify-time{font-size:8px;color:var(--muted2);margin-top:6px}.quality-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.quality-card{padding:18px}.quality-card span{display:block;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}.quality-card strong{display:block;font-size:27px;margin-top:7px}.quality-layout{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px}.quality-panel{padding:18px}.quality-panel h3{font-size:14px;margin:0 0 12px}.quality-project{display:grid;grid-template-columns:minmax(0,1fr) repeat(3,70px);gap:9px;padding:11px 0;border-bottom:1px solid var(--line);font-size:10px}.quality-project:last-child{border-bottom:0}.quality-project strong{font-size:11px}.quality-feedback{padding:12px 0;border-bottom:1px solid var(--line)}.quality-feedback:last-child{border-bottom:0}.quality-feedback strong{display:block;font-size:11px}.quality-feedback p{font-size:11px;line-height:1.55;margin:5px 0;color:var(--text)}.quality-feedback small{font-size:9px;color:var(--muted)}
    @media(max-width:900px){.quality-grid{grid-template-columns:1fr 1fr}.quality-layout{grid-template-columns:1fr}}@media(max-width:640px){.quality-grid{grid-template-columns:1fr}.workspace-notify-wrap{margin-left:0}.workspace-notify-panel{position:fixed;right:14px;left:14px;top:70px;width:auto}}
  `;
  document.head.appendChild(style);

  function mount(){
    const navGroup=document.querySelector('.sidebar .nav-group');
    if(navGroup&&!document.querySelector('[data-adatacore-quality-link]')){
      const profile=navGroup.querySelector('[data-view-link="profile"]');
      const link=document.createElement('a');link.className='nav-link';link.href='#quality';link.dataset.adatacoreQualityLink='1';link.textContent='Quality';
      profile?navGroup.insertBefore(link,profile):navGroup.appendChild(link);
      link.addEventListener('click',e=>{e.preventDefault();history.replaceState(null,'','#quality');showQuality();});
    }

    const main=document.querySelector('.app-main');
    if(main&&!document.getElementById('view-quality')){
      const section=document.createElement('section');section.id='view-quality';section.className='workspace-view';
      section.innerHTML=`<div class="section-title"><div><div class="eyebrow">Performance</div><h2>Your quality</h2><div class="page-sub">Review outcomes and recent reviewer feedback in one place.</div></div><button id="qualityRefresh" class="btn btn-secondary" type="button">Refresh</button></div><div id="qualityBody"><div class="card empty">Loading quality summary…</div></div>`;
      const profile=document.getElementById('view-profile');profile?main.insertBefore(section,profile):main.appendChild(section);
      section.querySelector('#qualityRefresh')?.addEventListener('click',loadQuality);
    }

    const header=document.querySelector('.page-header');
    if(header&&!document.getElementById('workspaceNotifyWrap')){
      const wrap=document.createElement('div');wrap.id='workspaceNotifyWrap';wrap.className='workspace-notify-wrap';
      wrap.innerHTML=`<button id="workspaceNotifyBtn" class="workspace-notify-btn" type="button" aria-label="Notifications">🔔<span id="workspaceNotifyCount" class="workspace-notify-count" hidden>0</span></button><div id="workspaceNotifyPanel" class="workspace-notify-panel"><div class="notify-head"><strong>Notifications</strong><button id="markAllNotifications" class="btn btn-secondary" type="button">Mark all read</button></div><div id="workspaceNotifyList" class="notify-list"><div class="empty-compact">Loading…</div></div></div>`;
      const chip=header.querySelector('.profile-chip');chip?header.insertBefore(wrap,chip):header.appendChild(wrap);
      wrap.querySelector('#workspaceNotifyBtn')?.addEventListener('click',async e=>{e.stopPropagation();wrap.querySelector('#workspaceNotifyPanel')?.classList.toggle('open');await loadNotifications();});
      wrap.querySelector('#markAllNotifications')?.addEventListener('click',async()=>{await client.rpc('mark_all_my_notifications_read');await loadNotifications();});
    }
  }

  function showQuality(){
    mount();
    document.querySelectorAll('.workspace-view').forEach(v=>v.classList.toggle('active',v.id==='view-quality'));
    document.querySelectorAll('.sidebar .nav-link').forEach(v=>v.classList.toggle('active',v.dataset.adatacoreQualityLink==='1'));
    const eyebrow=document.getElementById('viewEyebrow'),heading=document.getElementById('viewHeading'),sub=document.getElementById('viewSub');
    if(eyebrow)eyebrow.textContent='Contributor performance';if(heading)heading.textContent='Quality';if(sub)sub.textContent='Your review outcomes, approval rate and latest feedback.';
    loadQuality();
  }

  async function loadQuality(){
    const body=document.getElementById('qualityBody');if(!body)return;
    body.innerHTML='<div class="card empty">Loading quality summary…</div>';
    const {data,error}=await client.rpc('get_my_quality_summary');
    if(error){body.innerHTML=`<div class="card empty">Unable to load quality: ${esc(error.message)}</div>`;return}
    const d=data||{},projects=Array.isArray(d.projects)?d.projects:[],feedback=Array.isArray(d.recent_feedback)?d.recent_feedback:[];
    body.innerHTML=`<div class="quality-grid"><div class="card quality-card"><span>Approval rate</span><strong>${d.approval_rate==null?'—':esc(d.approval_rate)+'%'}</strong></div><div class="card quality-card"><span>Approved</span><strong>${Number(d.approved||0)}</strong></div><div class="card quality-card"><span>Pending</span><strong>${Number(d.pending||0)}</strong></div><div class="card quality-card"><span>Rejected</span><strong>${Number(d.rejected||0)}</strong></div></div><div class="quality-layout"><section class="card quality-panel"><h3>Project performance</h3>${projects.length?projects.map(p=>`<div class="quality-project"><strong>${esc(p.project||'Project')}</strong><span>${Number(p.approved||0)} approved</span><span>${Number(p.pending||0)} pending</span><span>${Number(p.rejected||0)} rejected</span></div>`).join(''):'<div class="empty-compact">No reviewed submissions yet.</div>'}</section><section class="card quality-panel"><h3>Recent reviewer feedback</h3>${feedback.length?feedback.map(f=>`<div class="quality-feedback"><strong>${esc(f.project||'Project')} · ${esc(f.decision||'Review')}</strong><p>${esc(f.feedback||'')}</p><small>${fmtDate(f.created_at)}</small></div>`).join(''):'<div class="empty-compact">No written reviewer feedback yet.</div>'}</section></div>`;
  }

  async function loadNotifications(){
    const list=document.getElementById('workspaceNotifyList'),countEl=document.getElementById('workspaceNotifyCount');if(!list||!countEl)return;
    const {data,error}=await client.rpc('get_my_notifications',{p_limit:40});
    if(error){list.innerHTML=`<div class="empty-compact">Unable to load notifications.</div>`;return}
    const items=Array.isArray(data?.items)?data.items:[],unread=Number(data?.unread||0);countEl.hidden=unread<=0;countEl.textContent=unread>99?'99+':String(unread);
    list.innerHTML=items.length?items.map(n=>`<button class="notify-item ${n.read_at?'':'unread'}" data-notification="${n.id}" data-link="${esc(n.link||'')}"><div class="notify-title">${esc(n.title)}</div>${n.body?`<div class="notify-body">${esc(n.body)}</div>`:''}<div class="notify-time">${fmtDate(n.created_at)}</div></button>`).join(''):'<div class="empty-compact">You are all caught up.</div>';
    list.querySelectorAll('[data-notification]').forEach(btn=>btn.addEventListener('click',async()=>{await client.rpc('mark_my_notification_read',{p_id:btn.dataset.notification});const link=btn.dataset.link;if(link)location.href=link;else await loadNotifications();}));
  }

  mount();loadNotifications();
  if(location.hash==='#quality')setTimeout(showQuality,0);
  window.addEventListener('hashchange',()=>{if(location.hash==='#quality')showQuality()});
  document.addEventListener('click',e=>{const panel=document.getElementById('workspaceNotifyPanel'),wrap=document.getElementById('workspaceNotifyWrap');if(panel?.classList.contains('open')&&!wrap?.contains(e.target))panel.classList.remove('open')});
})();
