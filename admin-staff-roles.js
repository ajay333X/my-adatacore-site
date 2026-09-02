(()=>{
  'use strict';
  if(window.__adatacoreStaffRoles)return;window.__adatacoreStaffRoles=true;
  if(!window.supabase?.createClient)return;

  const U='https://llmhyezgcnbognmmsnzq.supabase.co';
  const K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
  const client=window.supabase.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v??'').trim().toLowerCase();

  let people=[],projects=[],roles=[],selectedPersonId='',personOpen=false;

  const style=document.createElement('style');
  style.textContent=`
    .staff-role-card{margin-top:16px;padding:18px}
    .staff-role-grid{display:grid;grid-template-columns:1.2fr .8fr 1fr auto;gap:9px;align-items:end}
    .staff-role-list{display:grid;gap:8px;margin-top:14px}
    .staff-role-row{display:grid;grid-template-columns:minmax(0,1fr) 140px minmax(140px,.8fr) auto auto;gap:9px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:11px;background:var(--panel2);font-size:10px}
    .staff-role-row strong{font-size:11px}
    .staff-role-note{font-size:10px;color:var(--muted);line-height:1.55;margin-top:8px}
    .staff-person-picker{position:relative}
    .staff-person-search-wrap{position:relative}
    .staff-person-search{padding-right:34px!important}
    .staff-person-clear{position:absolute;right:7px;top:50%;transform:translateY(-50%);width:26px;height:26px;border:0;background:transparent;color:var(--muted);cursor:pointer;border-radius:7px;display:none}
    .staff-person-clear:hover{background:var(--panel2);color:var(--text)}
    .staff-person-results{position:absolute;z-index:1500;left:0;right:0;top:calc(100% + 6px);max-height:290px;overflow:auto;padding:6px;background:var(--panel);border:1px solid var(--line2);border-radius:12px;box-shadow:0 18px 45px rgba(20,24,36,.14);display:none}
    .staff-person-results.open{display:block}
    .staff-person-option{width:100%;border:0;background:transparent;color:var(--text);text-align:left;padding:10px;border-radius:9px;cursor:pointer;display:block}
    .staff-person-option:hover,.staff-person-option:focus-visible{background:var(--panel2);outline:none}
    .staff-person-option strong{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .staff-person-option span{display:block;font-size:9px;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .staff-person-empty{padding:14px;text-align:center;color:var(--muted);font-size:10px}
    .staff-person-selected{margin-top:6px;font-size:9px;color:var(--muted);min-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    @media(max-width:900px){.staff-role-grid,.staff-role-row{grid-template-columns:1fr}.staff-person-results{position:fixed;left:14px;right:14px;top:auto;max-height:40vh}}
  `;
  document.head.appendChild(style);

  function mount(){
    const access=document.getElementById('access');
    if(!access||document.getElementById('staffRoleCard'))return;
    const card=document.createElement('section');
    card.id='staffRoleCard';card.className='card staff-role-card';
    card.innerHTML=`
      <div class="section-title" style="margin:0 0 12px">
        <div><div class="eyebrow">Staff permissions</div><h2>Role framework</h2><div class="page-sub">Assign operational roles. Staff access takes effect automatically when the person signs in or opens the dashboard.</div></div>
        <button id="staffRoleRefresh" class="btn btn-secondary">Refresh</button>
      </div>
      <div class="staff-role-grid">
        <label class="field staff-person-picker">Person
          <div class="staff-person-search-wrap">
            <input id="staffPersonSearch" class="input staff-person-search" autocomplete="off" placeholder="Search name, email or UID…" role="combobox" aria-expanded="false" aria-controls="staffPersonResults">
            <button id="staffPersonClear" class="staff-person-clear" type="button" aria-label="Clear selected person">×</button>
          </div>
          <div id="staffPersonResults" class="staff-person-results" role="listbox"></div>
          <div id="staffPersonSelected" class="staff-person-selected">No person selected.</div>
        </label>
        <label class="field">Role<select id="staffRole" class="input"><option value="super_admin">Super Admin</option><option value="project_manager">Project Manager</option><option value="qa_manager">QA Manager</option><option value="finance">Finance</option><option value="support">Support</option></select></label>
        <label class="field">Project<select id="staffProject" class="input"><option value="">Platform-wide</option></select></label>
        <button id="staffRoleSave" class="btn btn-primary">Assign role</button>
      </div>
      <div class="staff-role-note">Project Manager and QA Manager require a project. Support and Finance are platform-wide. A person with multiple active roles receives the combined authorized panels; Super Admin keeps full access.</div>
      <div id="staffRoleMessage" class="staff-role-note"></div>
      <div id="staffRoleList" class="staff-role-list"><div class="empty">Loading staff roles…</div></div>`;
    access.appendChild(card);

    card.querySelector('#staffRoleRefresh').onclick=load;
    card.querySelector('#staffRoleSave').onclick=save;
    card.querySelector('#staffRole').onchange=syncProject;
    card.querySelector('#staffRoleList').onclick=e=>{const b=e.target.closest('[data-role-toggle]');if(b)toggle(b)};
    const input=card.querySelector('#staffPersonSearch');
    input.addEventListener('focus',()=>{personOpen=true;renderPersonResults()});
    input.addEventListener('input',()=>{selectedPersonId='';personOpen=true;renderPersonResults();renderSelectedPerson()});
    input.addEventListener('keydown',e=>{
      if(e.key==='Escape'){personOpen=false;renderPersonResults();input.blur();return}
      if(e.key==='ArrowDown'){e.preventDefault();personOpen=true;renderPersonResults();card.querySelector('.staff-person-option')?.focus()}
      if(e.key==='Enter'){
        const exact=findExactPerson(input.value);
        if(exact){e.preventDefault();selectPerson(exact.id)}
      }
    });
    card.querySelector('#staffPersonResults').onclick=e=>{const b=e.target.closest('[data-person-id]');if(b)selectPerson(b.dataset.personId)};
    card.querySelector('#staffPersonResults').addEventListener('keydown',e=>{
      const current=e.target.closest('.staff-person-option');if(!current)return;
      const opts=[...card.querySelectorAll('.staff-person-option')],i=opts.indexOf(current);
      if(e.key==='ArrowDown'){e.preventDefault();(opts[i+1]||opts[0])?.focus()}
      if(e.key==='ArrowUp'){e.preventDefault();(opts[i-1]||opts[opts.length-1])?.focus()}
      if(e.key==='Enter'){e.preventDefault();selectPerson(current.dataset.personId)}
      if(e.key==='Escape'){e.preventDefault();personOpen=false;renderPersonResults();input.focus()}
    });
    card.querySelector('#staffPersonClear').onclick=()=>clearPerson(true);
    document.addEventListener('click',e=>{if(!card.querySelector('.staff-person-picker')?.contains(e.target)){personOpen=false;renderPersonResults()}});
  }

  function personLabel(p){return p?.full_name||p?.email||p?.uid||'Unnamed'}
  function personMeta(p){return [p?.email,p?.uid].filter(Boolean).join(' · ')}
  function findExactPerson(value){
    const q=norm(value);if(!q)return null;
    return people.find(p=>[p.email,p.uid,p.full_name].some(v=>norm(v)===q))||null;
  }
  function filteredPeople(){
    const q=norm(document.getElementById('staffPersonSearch')?.value);
    const rows=!q?people:people.filter(p=>[p.full_name,p.email,p.uid].some(v=>norm(v).includes(q)));
    return rows.slice(0,12);
  }
  function renderPersonResults(){
    const box=document.getElementById('staffPersonResults'),input=document.getElementById('staffPersonSearch');if(!box||!input)return;
    const rows=filteredPeople();
    box.innerHTML=rows.length?rows.map(p=>`<button class="staff-person-option" type="button" role="option" data-person-id="${esc(p.id)}"><strong>${esc(personLabel(p))}</strong><span>${esc(personMeta(p)||'No email / UID')}</span></button>`).join(''):'<div class="staff-person-empty">No matching person found.</div>';
    box.classList.toggle('open',personOpen);
    input.setAttribute('aria-expanded',personOpen?'true':'false');
  }
  function renderSelectedPerson(){
    const text=document.getElementById('staffPersonSelected'),clear=document.getElementById('staffPersonClear');
    const p=people.find(x=>String(x.id)===String(selectedPersonId));
    if(text)text.textContent=p?`Selected: ${personLabel(p)}${p.email?' · '+p.email:''}`:'No person selected.';
    if(clear)clear.style.display=p?'block':'none';
  }
  function selectPerson(id){
    const p=people.find(x=>String(x.id)===String(id));if(!p)return;
    selectedPersonId=String(p.id);personOpen=false;
    const input=document.getElementById('staffPersonSearch');if(input)input.value=p.email||p.uid||personLabel(p);
    renderPersonResults();renderSelectedPerson();
  }
  function clearPerson(focus=false){
    selectedPersonId='';personOpen=false;
    const input=document.getElementById('staffPersonSearch');if(input){input.value='';if(focus)input.focus()}
    renderPersonResults();renderSelectedPerson();
  }

  function syncProject(){
    const r=document.getElementById('staffRole'),p=document.getElementById('staffProject');if(!r||!p)return;
    const scoped=['project_manager','qa_manager'].includes(r.value);p.disabled=!scoped;if(!scoped)p.value='';
  }

  function render(){
    mount();
    const project=document.getElementById('staffProject'),list=document.getElementById('staffRoleList');
    if(project)project.innerHTML='<option value="">Choose project…</option>'+projects.map(p=>`<option value="${p.id}">${esc(p.project_name)}</option>`).join('');
    if(list)list.innerHTML=roles.length?roles.map(r=>`<div class="staff-role-row"><div><strong>${esc(r.name||r.email)}</strong><div class="subtle">${esc(r.email||'')}</div></div><span class="pill pill-brand">${esc(String(r.role||'').replaceAll('_',' '))}</span><span>${esc(r.project_name||'Platform-wide')}</span><span class="pill ${r.active?'pill-green':'pill-gray'}">${r.active?'Active':'Disabled'}</span><button class="btn btn-secondary" data-role-toggle="${esc(r.id)}" data-user="${esc(r.user_id)}" data-role="${esc(r.role)}" data-project="${r.project_id??''}" data-active="${r.active?'1':'0'}">${r.active?'Disable':'Enable'}</button></div>`).join(''):'<div class="empty">No staff roles assigned yet.</div>';
    renderPersonResults();renderSelectedPerson();syncProject();
  }

  async function load(){
    mount();const msg=document.getElementById('staffRoleMessage');if(msg)msg.textContent='Loading…';
    try{
      const [{data:s,error:se},{data:a,error:ae}]=await Promise.all([client.rpc('admin_staff_roles_snapshot'),client.rpc('admin_assignment_center_snapshot')]);
      if(se)throw se;if(ae)throw ae;
      roles=Array.isArray(s?.roles)?s.roles:[];people=Array.isArray(a?.people)?a.people:[];projects=Array.isArray(a?.projects)?a.projects:[];
      render();if(msg)msg.textContent='';
    }catch(e){if(msg)msg.textContent='Unable to load staff roles: '+e.message}
  }

  async function save(){
    const role=document.getElementById('staffRole')?.value,project=document.getElementById('staffProject')?.value||null,msg=document.getElementById('staffRoleMessage');
    let person=selectedPersonId;
    if(!person){const exact=findExactPerson(document.getElementById('staffPersonSearch')?.value);if(exact){person=String(exact.id);selectedPersonId=person}}
    if(!person){if(msg)msg.textContent='Search for and select a person first.';return}
    if(!role)return;
    if(['project_manager','qa_manager'].includes(role)&&!project){if(msg)msg.textContent='Choose a project for this role.';return}
    if(msg)msg.textContent='Saving role…';
    const {error}=await client.rpc('admin_set_staff_role',{p_user_id:person,p_role:role,p_project_id:project?Number(project):null,p_active:true});
    if(error){if(msg)msg.textContent=error.message;return}
    if(msg)msg.textContent='Role assigned. It will apply automatically on the person’s next dashboard/login.';
    await load();
  }

  async function toggle(b){
    const msg=document.getElementById('staffRoleMessage'),next=b.dataset.active!=='1';b.disabled=true;if(msg)msg.textContent=next?'Enabling role…':'Disabling role…';
    const {error}=await client.rpc('admin_set_staff_role',{p_user_id:b.dataset.user,p_role:b.dataset.role,p_project_id:b.dataset.project?Number(b.dataset.project):null,p_active:next});
    if(error){b.disabled=false;if(msg)msg.textContent=error.message;return}
    if(msg)msg.textContent=next?'Role enabled.':'Role disabled.';await load();
  }

  mount();load();
})();
