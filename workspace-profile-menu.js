(()=>{
  'use strict';
  if(window.__adatacoreProfileMenu)return;
  window.__adatacoreProfileMenu=true;

  const chip=document.querySelector('.page-header .profile-chip');
  if(!chip)return;

  const style=document.createElement('style');
  style.textContent=`
    .account-menu-wrap{position:relative;flex:0 0 auto}
    .profile-chip.account-trigger{cursor:pointer;user-select:none;transition:border-color .15s ease,box-shadow .15s ease,background .15s ease;outline:none}
    .profile-chip.account-trigger:hover,.profile-chip.account-trigger[aria-expanded="true"]{border-color:rgba(124,58,237,.34);background:var(--panel);box-shadow:0 8px 24px rgba(22,24,35,.07)}
    .profile-chip.account-trigger:focus-visible{box-shadow:0 0 0 3px rgba(124,58,237,.14)}
    .account-chevron{font-size:11px;color:var(--muted);margin-left:2px;transition:transform .15s ease}
    .profile-chip.account-trigger[aria-expanded="true"] .account-chevron{transform:rotate(180deg)}
    .account-menu{position:absolute;right:0;top:calc(100% + 9px);z-index:1200;width:245px;padding:7px;background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 18px 48px rgba(22,24,35,.14);display:none}
    .account-menu.open{display:block}
    .account-menu-head{padding:10px 10px 9px;border-bottom:1px solid var(--line);margin-bottom:5px}
    .account-menu-name{font-size:12px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .account-menu-role{font-size:10px;color:var(--muted);margin-top:3px}
    .account-menu-item{width:100%;display:flex;align-items:center;gap:10px;border:0;background:transparent;color:var(--text);border-radius:9px;padding:10px 11px;font:650 12px/1.2 inherit;text-align:left;cursor:pointer}
    .account-menu-item:hover,.account-menu-item:focus-visible{background:var(--panel2);outline:none}
    .account-menu-icon{width:18px;text-align:center;color:var(--muted)}
    .account-menu-divider{height:1px;background:var(--line);margin:5px 4px}
    .account-menu-item.danger{color:var(--red)}
    .account-menu-item.danger .account-menu-icon{color:var(--red)}
    @media(max-width:640px){
      .profile-chip.account-trigger{display:flex;padding:5px;border-radius:12px}
      .profile-chip.account-trigger .account-copy,.profile-chip.account-trigger .account-chevron{display:none}
      .profile-chip.account-trigger .avatar{width:36px;height:36px}
      .account-menu{position:fixed;right:12px;top:68px;width:min(280px,calc(100vw - 24px))}
    }
  `;
  document.head.appendChild(style);

  chip.classList.add('account-trigger');
  chip.setAttribute('role','button');
  chip.setAttribute('tabindex','0');
  chip.setAttribute('aria-haspopup','menu');
  chip.setAttribute('aria-expanded','false');
  chip.setAttribute('aria-label','Open account menu');
  const copy=chip.children[1];
  if(copy)copy.classList.add('account-copy');
  const chevron=document.createElement('span');
  chevron.className='account-chevron';
  chevron.setAttribute('aria-hidden','true');
  chevron.textContent='▾';
  chip.appendChild(chevron);

  const wrap=document.createElement('div');
  wrap.className='account-menu-wrap';
  chip.parentNode.insertBefore(wrap,chip);
  wrap.appendChild(chip);

  const menu=document.createElement('div');
  menu.className='account-menu';
  menu.setAttribute('role','menu');
  menu.innerHTML=`
    <div class="account-menu-head">
      <div id="accountMenuName" class="account-menu-name">Contributor</div>
      <div class="account-menu-role">Contributor account</div>
    </div>
    <button class="account-menu-item" type="button" role="menuitem" data-account-view="profile"><span class="account-menu-icon">◉</span><span>Profile</span></button>
    <button class="account-menu-item" type="button" role="menuitem" data-account-view="earnings"><span class="account-menu-icon">$</span><span>Earnings & payments</span></button>
    <div class="account-menu-divider"></div>
    <button class="account-menu-item danger" type="button" role="menuitem" data-account-action="signout"><span class="account-menu-icon">↪</span><span>Sign out</span></button>
  `;
  wrap.appendChild(menu);

  const setOpen=open=>{
    chip.setAttribute('aria-expanded',open?'true':'false');
    menu.classList.toggle('open',open);
    if(open){
      const current=document.getElementById('name')?.textContent?.trim();
      const label=menu.querySelector('#accountMenuName');
      if(label)label.textContent=current||'Contributor';
    }
  };
  const toggle=()=>setOpen(!menu.classList.contains('open'));

  chip.addEventListener('click',e=>{e.stopPropagation();toggle()});
  chip.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}
    if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);menu.querySelector('.account-menu-item')?.focus();}
  });
  menu.addEventListener('click',async e=>{
    const view=e.target.closest('[data-account-view]')?.dataset.accountView;
    if(view){setOpen(false);location.hash=view;return;}
    const action=e.target.closest('[data-account-action]')?.dataset.accountAction;
    if(action==='signout'){
      const button=e.target.closest('button');
      if(button){button.disabled=true;button.querySelector('span:last-child').textContent='Signing out…';}
      try{await db.auth.signOut();}finally{location.replace('/auth');}
    }
  });
  document.addEventListener('click',e=>{if(!wrap.contains(e.target))setOpen(false)});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){setOpen(false);chip.focus();}});
})();
