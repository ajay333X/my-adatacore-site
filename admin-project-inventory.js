(()=>{
  let inventoryRows=[],taskRows=[];
  const style=document.createElement('style');
  style.textContent=`
    .project-stock-list{display:grid;gap:12px}.project-stock-card{padding:18px;border:1px solid var(--line);border-radius:14px;background:var(--panel2)}
    .project-stock-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.project-stock-name{font-size:16px;font-weight:850}.project-stock-meta{font-size:10px;color:var(--muted);margin-top:5px}
    .project-stock-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:14px}.project-stock-stat{padding:11px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}.project-stock-stat span{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted2);font-weight:850}.project-stock-stat strong{display:block;font-size:18px;margin-top:5px}
    .project-stock-controls{display:grid;grid-template-columns:130px 110px auto auto;gap:8px;align-items:end;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}.project-stock-controls .field{margin:0}.project-stock-controls .btn{min-height:40px}.project-stock-danger{margin-top:10px;display:flex;justify-content:flex-end}.inventory-hint{margin-top:11px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel2);font-size:10px;color:var(--muted);line-height:1.5}.inventory-hint strong{color:var(--text)}
    .inventory-flash{animation:inventoryFlash .62s ease}@keyframes inventoryFlash{0%{transform:scale(1)}35%{transform:scale(1.018);box-shadow:0 0 0 4px rgba(124,92,255,.08)}100%{transform:scale(1)}}
    @media(max-width:1050px){.project-stock-grid{grid-template-columns:repeat(3,1fr)}.project-stock-controls{grid-template-columns:1fr 1fr}}
    @media(max-width:640px){.project-stock-head{flex-direction:column}.project-stock-grid{grid-template-columns:1fr 1fr}.project-stock-controls{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const inventoryFor=id=>inventoryRows.find(x=>Number(x.project_id)===Number(id))||{l1_available:0,l2_available:0};
  const projectTasks=name=>taskRows.filter(t=>t.title===name);
  const availableFor=(projectId,layerName)=>{const inv=inventoryFor(projectId);return Number(layerName==='L2'?inv.l2_available:inv.l1_available)||0};

  function renderInventoryProjects(){
    if(!projectList)return;
    projectList.classList.add('project-stock-list');
    projectList.innerHTML=projects.length?projects.map(p=>{
      const inv=inventoryFor(p.id),rows=projectTasks(p.project_name),l1=rows.filter(t=>t.layer==='L1'),l2=rows.filter(t=>t.layer==='L2'),pending=rows.filter(t=>t.status==='pending').length,finished=rows.filter(t=>t.status!=='pending').length,total=Number(inv.l1_available||0)+Number(inv.l2_available||0);
      return `<article class="project-stock-card" id="stock-card-${p.id}"><div class="project-stock-head"><div><div class="project-stock-name">${esc(p.project_name)}</div><div class="project-stock-meta">L1 rate $${Number(p.l1_rate||0).toFixed(2)} · L2 rate $${Number(p.l2_rate||0).toFixed(2)} · ${p.is_published===false?'Unpublished':'Published'}</div></div><span class="pill ${total>0?'pill-green':'pill-gray'}">${total} available</span></div><div class="project-stock-grid"><div class="project-stock-stat"><span>Total available</span><strong>${total}</strong></div><div class="project-stock-stat"><span>L1 available</span><strong>${Number(inv.l1_available||0)}</strong></div><div class="project-stock-stat"><span>L2 available</span><strong>${Number(inv.l2_available||0)}</strong></div><div class="project-stock-stat"><span>Assigned / open</span><strong>${pending}</strong></div><div class="project-stock-stat"><span>Past tasks</span><strong>${finished}</strong></div></div><div class="project-stock-controls"><label class="field">Layer<select class="input" id="inv-layer-${p.id}"><option value="L1">L1 production</option><option value="L2">L2 review</option></select></label><label class="field">Quantity<input class="input" id="inv-qty-${p.id}" type="number" min="1" max="100000" step="1" value="1"></label><button class="btn btn-primary" onclick="adjustProjectTasks(${p.id},1)">＋ Upload / add tasks</button><button class="btn btn-secondary" onclick="adjustProjectTasks(${p.id},-1)">− Remove available</button></div><div class="project-stock-danger"><button class="btn btn-danger" onclick='deleteProject(${p.id},${JSON.stringify(p.project_name)})'>Delete project</button></div></article>`
    }).join(''):'<div class="empty">No projects yet.</div>';
    projectSelect.innerHTML=projects.map(p=>{const inv=inventoryFor(p.id);return `<option value="${p.id}">${esc(p.project_name)} — L1 ${Number(inv.l1_available||0)} · L2 ${Number(inv.l2_available||0)}</option>`}).join('');
    updateAssignmentInventoryHint();
  }

  loadProjects=async function(){
    const [{data:p,error:pe},{data:i,error:ie},{data:t,error:te}]=await Promise.all([
      db.from('project_lab').select('*').order('created_at',{ascending:false}),
      db.from('project_task_inventory').select('project_id,l1_available,l2_available,updated_at'),
      db.from('tasks').select('id,title,layer,status,createdAt,public_task_id')
    ]);
    if(pe){projectList.innerHTML=`<div class="empty">${esc(pe.message)}</div>`;return}
    projects=p||[];inventoryRows=ie?[]:(i||[]);taskRows=te?[]:(t||[]);renderInventoryProjects();
  };

  window.adjustProjectTasks=async function(projectId,direction){
    const layerEl=document.getElementById(`inv-layer-${projectId}`),qtyEl=document.getElementById(`inv-qty-${projectId}`);if(!layerEl||!qtyEl)return;
    const qty=Math.floor(Number(qtyEl.value||0));if(!Number.isFinite(qty)||qty<1)return alert('Enter a task quantity of at least 1.');
    const layerName=layerEl.value,delta=qty*(direction<0?-1:1),project=projects.find(p=>Number(p.id)===Number(projectId));
    if(direction<0&&!confirm(`Remove ${qty} unassigned ${layerName} task${qty===1?'':'s'} from ${project?.project_name||'this project'}? Already assigned tasks will not be touched.`))return;
    const {error}=await db.rpc('admin_adjust_project_task_inventory',{p_project_id:Number(projectId),p_layer:layerName,p_delta:delta});
    if(error)return alert(error.message);
    await loadProjects();const card=document.getElementById(`stock-card-${projectId}`);if(card){card.classList.remove('inventory-flash');void card.offsetWidth;card.classList.add('inventory-flash')}
  };

  const baseCreateProject=createProject;
  createProject=async function(){await baseCreateProject();await loadProjects()};
  const baseDeleteProject=deleteProject;
  deleteProject=async function(id,name){await baseDeleteProject(id,name);await loadProjects()};

  assignTask=async function(){
    if(!projectSelect.value||!target.value.trim())return;
    const projectId=Number(projectSelect.value),layerName=layer.value,available=availableFor(projectId,layerName);
    if(available<=0)return alert(`No ${layerName} task inventory is available for this project. Open Projects and upload task quantity first.`);
    const {data,error}=await db.rpc('admin_assign_task',{p_user_key:target.value.trim(),p_project_id:projectId,p_layer:layerName});
    if(error)return alert(error.message);
    let publicId='';if(data){const {data:t}=await db.from('tasks').select('public_task_id').eq('id',Number(data)).maybeSingle();publicId=t?.public_task_id||''}
    target.value='';await Promise.all([loadProjects(),loadTaskMetric()]);updateAssignmentInventoryHint();alert(publicId?`Task ${publicId} assigned successfully.`:'Task assigned successfully.');
  };

  function updateAssignmentInventoryHint(){
    const panel=document.getElementById('tasks');if(!panel)return;let hint=document.getElementById('assignmentInventoryHint');
    if(!hint){hint=document.createElement('div');hint.id='assignmentInventoryHint';hint.className='inventory-hint';const card=panel.querySelector('.card');card?.appendChild(hint)}
    if(!projectSelect?.value){hint.textContent='Create a project and upload task quantity before assigning work.';return}
    const project=projects.find(p=>Number(p.id)===Number(projectSelect.value)),layerName=layer?.value||'L1',available=availableFor(projectSelect.value,layerName);
    hint.innerHTML=`<strong>${available} ${layerName} task${available===1?'':'s'} available</strong> in ${esc(project?.project_name||'selected project')}. Assigning this task will consume one available slot.`;
  }
  projectSelect?.addEventListener('change',updateAssignmentInventoryHint);layer?.addEventListener('change',updateAssignmentInventoryHint);

  const projectsPanel=document.getElementById('projects');if(projectsPanel){const heading=projectsPanel.querySelector('.section-title .page-sub');if(!heading){const title=projectsPanel.querySelector('.section-title>div');if(title){const sub=document.createElement('div');sub.className='page-sub';sub.textContent='Upload unassigned L1/L2 task quantity, monitor availability, and remove unused capacity without touching completed work.';title.appendChild(sub)}}}
})();