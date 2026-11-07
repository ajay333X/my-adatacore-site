(()=>{'use strict';
const U='https://llmhyezgcnbognmmsnzq.supabase.co',K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const client=supabase.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id),escape=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[x])),n=v=>Number(v||0).toLocaleString(),sum=(rs,key)=>rs.reduce((t,x)=>t+Number(x[key]||0),0);
const params=new URLSearchParams(location.search);const chosen=params.get('project')||'',allowedIds=new Set();
let latest=null,inFlight=false,timer=null;
const status=(msg,bad=false)=>{$('notice').innerHTML=msg?'<div class="'+(bad?'oc-error':'oc-chip')+'" style="margin-bottom:15px">'+escape(msg)+'</div>':''};
async function call(name,args){const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message);return data}
function kpi(id,value){$(id).textContent=value}
function badge(val){return val==='active'?'<span class="oc-chip good">Active</span>':val==='paused'?'<span class="oc-chip warn">Paused</span>':'<span class="oc-chip">'+escape(val||'Unknown')+'</span>'}
function render(data){
 latest=data;const rows=data.projects||[],daily=data.daily||[];
 const l1=sum(rows,'l1_pending'),l2=sum(rows,'l2_pending'),review=sum(rows,'reviews_pending');
 const totalApprove=sum(rows,'approvals'),totalReject=sum(rows,'rejections');
 [['kL1',n(l1)],['kL2',n(l2)],['kPeople',n(sum(rows,'contributors_active'))],['kSubmissions',n(sum(rows,'submissions_window'))],['kAudioL1',n(sum(rows,'l1_audio_available'))],['kAudioL2',n(sum(rows,'l2_audio_available'))],['kReviews',n(review)],['kApproval',totalApprove+totalReject?(100*totalApprove/(totalApprove+totalReject)).toFixed(1)+'%':'N/A']].forEach(([id,value])=>kpi(id,value));
 const max=Math.max(1,...daily.map(x=>Math.max(Number(x.new_tasks||0),Number(x.submissions||0))));
 $('chartRange').textContent=data.days+' days';
 $('workChart').innerHTML=daily.length?daily.map(d=>{
 const tasks=Number(d.new_tasks||0),sub=Number(d.submissions||0),date=new Date(String(d.date)+'T00:00:00');
 return '<div class="oc-day" title="'+escape(d.date)+': '+tasks+' tasks created, '+sub+' submissions"><div class="oc-pair"><span class="oc-bar" style="height:'+Math.max(2,Math.round(tasks/max*132))+'px"></span><span class="oc-bar alt" style="height:'+Math.max(2,Math.round(sub/max*132))+'px"></span></div><small>'+date.toLocaleDateString(undefined,{month:'short',day:'numeric'})+'</small></div>'
 }).join(''):'<div class="oc-placeholder">No activity in this period</div>';
 const ordered=rows.map(p=>({p,count:Number(p.l2_pending||0)+Number(p.l2_audio_available||0)+Number(p.reviews_pending||0)})).sort((a,b)=>b.count-a.count);
 $('riskList').innerHTML=ordered.filter(x=>x.count>0).slice(0,5).map(({p,count})=>'<div class="oc-risk"><span class="oc-risk-icon">L2</span><div class="oc-risk-main"><strong>'+escape(p.name)+'</strong><small>'+n(p.l2_pending)+' L2 assigned · '+n(p.l2_audio_available)+' L2 audio ready · '+n(p.reviews_pending)+' final reviews</small></div><span class="oc-risk-num">'+n(count)+'</span></div>').join('')||'<div class="oc-placeholder">No pending review workload in the selected project scope.</div>';
 $('projectRows').innerHTML=rows.length?rows.map(p=>{
 const approved=Number(p.approvals||0),rejected=Number(p.rejections||0),quality=approved+rejected?(100*approved/(approved+rejected)).toFixed(1)+'%':'—';
 return '<tr><td><a class="oc-project-link" href="/admin/project-lab?project='+Number(p.id)+'">'+escape(p.name)+'</a><div style="font-size:10px;color:var(--oc-muted)">#'+Number(p.id)+' · '+escape(p.type)+'</div></td><td>'+badge(p.lifecycle)+'</td><td>'+n(p.l1_pending)+'</td><td>'+n(p.l2_pending)+'</td><td>'+n(p.l1_audio_available)+'</td><td>'+n(p.l2_audio_available)+'</td><td>'+n(p.contributors_assigned)+'</td><td>'+n(p.submissions_window)+'</td><td>'+quality+'</td><td><a class="oc-btn" href="/admin/project-lab?project='+Number(p.id)+'" style="min-height:32px">Open project ↗</a></td></tr>'
 }).join(''):'<tr><td colspan="10" class="oc-placeholder">No authorized projects found.</td></tr>';
 $('lastUpdated').textContent='Updated '+new Date(data.generated_at||Date.now()).toLocaleTimeString();
}
async function load(){
 if(inFlight)return;inFlight=true;$('refreshBtn').disabled=true;$('refreshBtn').textContent='Updating…';
 try{
  const val=$('projectFilter').value,days=Number($('periodFilter').value||7);
  const d=await call('admin_live_operations_dashboard',{p_project_id:val?Number(val):null,p_days:days});
  render(d);status('');
  const url=new URL(location.href);if(val)url.searchParams.set('project',val);else url.searchParams.delete('project');url.searchParams.set('days',String(days));
  history.replaceState(null,'',url.pathname+url.search);
 }catch(e){status('Unable to read live project data: '+e.message,true)}
 finally{inFlight=false;$('refreshBtn').disabled=false;$('refreshBtn').textContent='↻ Refresh'}
}
async function boot(){
 const auth=await client.auth.getUser();if(!auth.data?.user){location.replace('/auth');return}
 const {data:access,error}=await client.rpc('get_my_admin_access');
 if(error||!access?.allowed){location.replace('/workspace');return}
 const allowed=access.is_super_admin?null:new Set((access.projects||[]).filter(p=>Array.isArray(p.roles)&&p.roles.some(r=>['project_manager','qa_manager'].includes(r))).map(p=>Number(p.id)));
 const baseline=await call('admin_live_operations_dashboard',{p_project_id:null,p_days:7});
 const projects=baseline.projects||[];
 const select=$('projectFilter');
 select.innerHTML='<option value="">All permitted projects</option>'+projects.filter(p=>!allowed||allowed.has(Number(p.id))).map(p=>'<option value="'+Number(p.id)+'">'+escape(p.name)+' (#'+Number(p.id)+')</option>').join('');
 if(chosen&&projects.some(p=>String(p.id)===chosen))select.value=chosen;
 const days=params.get('days');if(['7','14','30'].includes(days))$('periodFilter').value=days;
 if(!chosen&&!days){render(baseline);status('')}else await load();
 $('projectFilter').onchange=load;$('periodFilter').onchange=load;$('refreshBtn').onclick=load;
 timer=setInterval(()=>{if(!document.hidden)load()},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
}
boot().catch(e=>status('Operations dashboard could not initialize: '+e.message,true));
})();