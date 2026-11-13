(()=>{
'use strict';
if(window.__adatacoreSlackWorkspaceV2)return;window.__adatacoreSlackWorkspaceV2=true;
const U='https://llmhyezgcnbognmmsnzq.supabase.co',K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',ADV=U+'/functions/v1/slack-admin-advanced',COMMUNITY=U+'/functions/v1/slack-community';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
let db,overview=null,memberList=[],active='overview',ready=false;
const css=document.createElement('style');
css.textContent=`
#slackWorkspaceV2{margin:24px 0 0}.sw-tabs{display:flex;flex-wrap:wrap;gap:7px;border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:20px}.sw-tab{border:1px solid transparent;border-radius:10px;background:transparent;color:var(--muted);padding:11px 17px;font:inherit;font-size:12px;font-weight:750;cursor:pointer}.sw-tab[aria-selected="true"]{background:var(--panel2);border-color:var(--line2);color:var(--text)}.sw-page{display:none}.sw-page.active{display:block}.sw-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin:8px 0 19px;flex-wrap:wrap}.sw-header h2{margin:0;font-size:23px;letter-spacing:-.035em}.sw-header p{margin:6px 0 0;font-size:12px;color:var(--muted);line-height:1.6}.sw-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-bottom:18px}.sw-stat,.sw-card{padding:19px;border:1px solid var(--line);background:var(--panel);border-radius:13px}.sw-stat span{font-size:11px;color:var(--muted)}.sw-stat strong{display:block;font-size:22px;margin-top:6px}.sw-columns{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin:15px 0}.sw-card h3{margin:0 0 9px;font-size:16px}.sw-card p{font-size:12px;line-height:1.6;color:var(--muted)}.sw-field{display:block;width:100%;box-sizing:border-box;min-height:40px;border:1px solid var(--line2);border-radius:9px;background:var(--panel2);color:var(--text);padding:9px 11px;font:inherit;font-size:12px}.sw-card label{display:block;font-size:11px;font-weight:750;margin:11px 0 6px}.sw-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:13px}.sw-btn{border:1px solid var(--line2);background:var(--panel2);color:var(--text);border-radius:9px;min-height:37px;padding:8px 13px;font:inherit;font-size:11px;font-weight:750;cursor:pointer}.sw-btn.primary{background:#6d3ce7;color:white;border-color:#6d3ce7}.sw-btn.danger{color:#b42334}.sw-btn:disabled{opacity:.55;cursor:wait}.sw-list{max-height:350px;overflow:auto;border:1px solid var(--line);border-radius:10px;margin-top:10px}.sw-item{padding:11px 13px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px}.sw-item:last-child{border-bottom:0}.sw-item strong{display:block;font-size:12px}.sw-item small{display:block;margin-top:4px;color:var(--muted);font-size:10px;overflow-wrap:anywhere}.sw-inline-message{font-size:12px;color:var(--muted);min-height:16px;white-space:pre-wrap;margin-top:11px}.sw-note{font-size:11px;color:var(--muted);line-height:1.6}.sw-full{grid-column:1/-1}.sw-subtitle{font-size:12px;color:var(--muted);margin:0 0 14px}.sw-page .super-grid{margin:0}.sw-page #slackCommunityPanel{margin-top:14px}.sw-page .super-stats,.sw-page #superSlackMessage{display:none}.sw-page #super-slack>.section-title{display:none}.sw-page .sw-columns .card{margin:0}.sw-pill{font-size:10px;padding:4px 8px;border-radius:20px;background:var(--panel2);color:var(--muted)}.sw-panel-footer{margin:12px 0 0}.sw-check{display:flex!important;align-items:center;gap:7px;font-size:12px!important}.sw-check input{accent-color:#6d3ce7}.sw-toolbar{display:flex;flex-wrap:wrap;gap:8px}.sw-empty{color:var(--muted);padding:15px;font-size:12px}@media(max-width:850px){.sw-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.sw-columns{grid-template-columns:1fr}.sw-full{grid-column:auto}}
`;
document.head.appendChild(css);
async function call(endpoint,body){const {data:{session}}=await db.auth.getSession();if(!session)throw Error('Please sign in again');const res=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:K,'Content-Type':'application/json'},body:JSON.stringify(body)});const out=await res.json().catch(()=>({}));if(!res.ok)throw Error(out.error||'Request failed');return out}
function note(id,s,bad=false){const e=$(id);if(e){e.textContent=s;e.style.color=bad?'#b42334':'var(--muted)'}}
function el(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x}
async function guard(){db=window.supabase.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});const {data,error}=await db.rpc('get_my_admin_access');return !error&&data?.is_super_admin===true}
function make(){
 const main=document.querySelector('main.shell');const s=$('super-slack'),community=$('slackCommunityPanel'),notif=$('slack-notifications');
 if(!main||!s||!community||!notif)return false;
 const root=el('div');root.id='slackWorkspaceV2';
 root.innerHTML=`<div class="sw-tabs" role="tablist" aria-label="Slack administration"><button class="sw-tab" data-page="overview" role="tab" aria-selected="true">Overview</button><button class="sw-tab" data-page="channels" role="tab" aria-selected="false">Channels &amp; Projects</button><button class="sw-tab" data-page="people" role="tab" aria-selected="false">People</button><button class="sw-tab" data-page="automation" role="tab" aria-selected="false">Automation &amp; Settings</button></div>
 <section id="sw-overview" class="sw-page active" role="tabpanel"><div class="sw-header"><div><h2>Slack workspace overview</h2><p>Connection, project mappings, sync status and recent actions.</p></div><button class="sw-btn" id="swReload">Refresh dashboard</button></div><div id="swStats" class="sw-stats"><div class="sw-stat"><span>Connection</span><strong id="swConnection">Checking…</strong></div><div class="sw-stat"><span>Mapped projects</span><strong id="swMapped">—</strong></div><div class="sw-stat"><span>Pending sync jobs</span><strong id="swQueued">—</strong></div><div class="sw-stat"><span>Failed jobs</span><strong id="swFailed">—</strong></div></div><div class="sw-columns"><div class="sw-card"><h3>Project channel directory</h3><p>Find which projects are connected to each private channel.</p><div class="sw-list" id="swMappedList"></div></div><div class="sw-card"><h3>Sync health</h3><p>Retry failed jobs without changing project permissions.</p><div id="swQueueDetail" class="sw-note"></div><div class="sw-actions"><button id="swRetryJobs" class="sw-btn">Retry failed jobs</button><button id="swProcessJobs" class="sw-btn">Process queued jobs</button></div><div id="swHealthMsg" class="sw-inline-message"></div></div><div class="sw-card sw-full"><h3>Recent administration activity</h3><div class="sw-list" id="swActivity"></div></div></div></section>
 <section id="sw-channels" class="sw-page" role="tabpanel"><div class="sw-header"><div><h2>Channels &amp; projects</h2><p>Select a channel, create another, or assign channels to Adatacore projects.</p></div></div><div id="swChannelHost"></div><div class="sw-card" style="margin-top:15px"><h3>Assign an existing channel</h3><p>Select a project by name and use the channel selected above. You don't need to remember a Project Lab number.</p><label for="swAssignSelect">Adatacore project</label><select class="sw-field" id="swAssignSelect"><option value="">Choose a project</option></select><div class="sw-actions"><button id="swAssignExisting" class="sw-btn primary">Assign selected channel</button><button id="swSyncExisting" class="sw-btn">Sync members</button></div><div class="sw-inline-message" id="swAssignMessage"></div></div><div class="sw-columns"><div class="sw-card sw-full"><h3>One-click project channel setup</h3><p>Choose a project and create a dedicated private channel automatically. Existing project-channel mappings are protected from accidental replacement.</p><label for="swProjectSelect">Adatacore project</label><select id="swProjectSelect" class="sw-field"><option value="">Loading projects…</option></select><label for="swProjectChannelName">New private channel name</label><input id="swProjectChannelName" class="sw-field" placeholder="project-name"><div class="sw-actions"><button class="sw-btn primary" id="swBootstrap">Create &amp; assign channel</button></div><div id="swBootstrapMsg" class="sw-inline-message"></div></div></div></section>
 <section id="sw-people" class="sw-page" role="tabpanel"><div class="sw-header"><div><h2>People &amp; membership</h2><p>Search and invite Slack users, inspect channel members, and manage removals.</p></div></div><div class="sw-card" style="margin-bottom:14px"><label for="swPeopleChannel">Channel for member management</label><select id="swPeopleChannel" class="sw-field"><option value="">Choose a channel</option></select><p class="sw-note">The channel selection stays in sync across tabs.</p></div><div id="swPeopleHost"></div><div class="sw-card"><h3>People in selected channel</h3><p>Choose a channel above in Channels &amp; Projects. Removing a user from a project-managed channel may be undone by automatic access sync.</p><div class="sw-actions"><button id="swLoadMembers" class="sw-btn">Show channel members</button></div><div class="sw-list" id="swMemberList"></div><div id="swMemberMsg" class="sw-inline-message"></div></div></section>
 <section id="sw-automation" class="sw-page" role="tabpanel"><div class="sw-header"><div><h2>Automation &amp; settings</h2><p>Send announcements, schedule Slack messages, and configure identity and project synchronization.</p></div></div><div class="sw-columns"><div class="sw-card"><h3>Message composer</h3><p>Messages are posted only to a channel you explicitly select. Scheduled messages use Slack's scheduling service.</p><label for="swSendChannel">Destination channel</label><select id="swSendChannel" class="sw-field"></select><label for="swMessage">Announcement</label><textarea id="swMessage" class="sw-field" rows="6" maxlength="3500" placeholder="Write your announcement…"></textarea><label class="sw-check"><input id="swScheduleToggle" type="checkbox"> Schedule for later</label><div id="swScheduleFields" hidden><label for="swScheduleAt">Send at (your local time)</label><input id="swScheduleAt" type="datetime-local" class="sw-field"></div><div class="sw-actions"><button class="sw-btn primary" id="swSend">Review &amp; send</button></div><div id="swSendMsg" class="sw-inline-message"></div></div><div class="sw-card"><h3>Scheduled announcements</h3><p>Messages submitted through this panel. Slack handles delivery at the scheduled time.</p><div id="swScheduledList" class="sw-list"></div><div class="sw-note sw-panel-footer">Cancel scheduled messages here. Delivery history is maintained by Slack; this panel records scheduling requests, not proof of delivery.</div></div></div><div id="swCommunityHost"></div><div id="swNotificationsHost"></div></section>`;
 main.querySelector('nav[aria-label="Slack management sections"]')?.remove();
 const projectsInfo=$('slack-projects');if(projectsInfo)projectsInfo.hidden=true;
 notif.insertAdjacentElement('beforebegin',root);
 const cards=s.querySelectorAll('.super-grid > section');
 const channelHost=$('swChannelHost'),peopleHost=$('swPeopleHost');
 const channelGrid=el('div','super-grid'),peopleGrid=el('div','super-grid');
 cards.forEach(card=>{if(card.id==='superPeopleTool')peopleGrid.appendChild(card);else channelGrid.appendChild(card)});
 channelHost.appendChild(channelGrid);
 peopleHost.appendChild(peopleGrid);
 $('swCommunityHost').appendChild(community);
 $('swNotificationsHost').appendChild(notif);
 const feedback=$('superSlackMessage');if(feedback){root.querySelector('.sw-tabs').insertAdjacentElement('afterend',feedback);feedback.style.display='block'}s.hidden=true;
 root.querySelectorAll('.sw-tab').forEach(button=>button.onclick=()=>show(button.dataset.page));
 $('swReload').onclick=()=>run('swHealthMsg',loadOverview);
 $('swRetryJobs').onclick=()=>run('swHealthMsg',retry);
 $('swProcessJobs').onclick=()=>run('swHealthMsg',process);
 $('swBootstrap').onclick=()=>run('swBootstrapMsg',bootstrap);$('swAssignExisting').onclick=()=>run('swAssignMessage',assignExisting);$('swSyncExisting').onclick=()=>run('swAssignMessage',syncExisting);
 $('swLoadMembers').onclick=()=>run('swMemberMsg',loadMembers);
 $('swScheduleToggle').onchange=()=>{$('swScheduleFields').hidden=!$('swScheduleToggle').checked;$('swSend').textContent=$('swScheduleToggle').checked?'Review schedule':'Review & send'};
 $('swSend').onclick=()=>run('swSendMsg',sendMessage);
 $('swProjectSelect').onchange=()=>{const p=(overview?.projects||[]).find(x=>String(x.id)===$('swProjectSelect').value);if(p)$('swProjectChannelName').value=('project-'+p.id+'-'+String(p.project_name||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')).slice(0,75)};
 const original=$('superChannel');original?.addEventListener('change',()=>syncChannelSelectors());$('swPeopleChannel').onchange=()=>{if(original){original.value=$('swPeopleChannel').value;original.dispatchEvent(new Event('change'))}};
 const target=new URLSearchParams(location.search).get('slackTab')||location.hash.replace('#','');show(['overview','channels','people','automation'].includes(target)?target:'overview');
 return true;
}
function show(name){active=name;document.querySelectorAll('.sw-page').forEach(x=>x.classList.toggle('active',x.id==='sw-'+name));document.querySelectorAll('.sw-tab').forEach(x=>x.setAttribute('aria-selected',String(x.dataset.page===name)));history.replaceState(null,'',location.pathname+location.search.split('&slackTab=')[0].split('?slackTab=')[0]+'#'+name);if(name==='overview')loadOverview().catch(()=>{});if(name==='automation'||name==='people')syncChannelSelectors()}
function projectName(id){return (overview?.projects||[]).find(p=>Number(p.id)===Number(id))?.project_name||('Project '+id)}
async function loadOverview(){
 overview=await call(ADV,{action:'overview'});
 const status=await call(COMMUNITY,{type:'status'});
 $('swConnection').textContent=status.bot_connected?'Connected':'Offline';
 $('swMapped').textContent=overview.mappings?.length||0;
 $('swQueued').textContent=(overview.queue||[]).filter(x=>x.status==='queued').length;
 const failed=(overview.queue||[]).filter(x=>x.status==='failed');$('swFailed').textContent=failed.length;
 $('swQueueDetail').textContent=failed.length?'Latest error: '+(failed[0].last_error||'Unspecified failure'):'No failed jobs in the latest 300 sync records.';
 const list=$('swMappedList');list.replaceChildren();
 for(const p of overview.mappings||[]){const item=el('div','sw-item');const info=el('span');info.append(el('strong',null,projectName(p.project_id)),el('small',null,'#'+(p.channel_name||p.channel_id)+' · Project '+p.project_id));const a=el('a','sw-btn','Open project');a.href='/admin-project-lab?project='+p.project_id;a.style.textDecoration='none';item.append(info,a);list.appendChild(item)}
 if(!(overview.mappings||[]).length)list.appendChild(el('div','sw-empty','No project-channel assignments yet.'));
 const act=$('swActivity');act.replaceChildren();
 for(const event of overview.activity||[]){const item=el('div','sw-item');const details=el('span');details.append(el('strong',null,String(event.action||'Activity').replace(/_/g,' ')),el('small',null,new Date(event.created_at).toLocaleString()+' · '+(event.success?'Successful':'Failed')));item.append(details,el('span','sw-pill',event.details?.channel_id||''));act.appendChild(item)}
 if(!(overview.activity||[]).length)act.appendChild(el('div','sw-empty','No administration activity yet.'));
 const assigned=$('swAssignSelect');const oldAssigned=assigned.value;assigned.replaceChildren(new Option('Choose project','')); const projects=$('swProjectSelect');const old=projects.value;projects.replaceChildren(new Option('Choose project',''));
 for(const p of overview.projects||[]){projects.add(new Option(p.project_name+' · #'+p.id,p.id));assigned.add(new Option(p.project_name+' · #'+p.id,p.id));}
 if(old)projects.value=old;if(oldAssigned)assigned.value=oldAssigned;
 const scheduled=$('swScheduledList');scheduled.replaceChildren();
 for(const m of overview.scheduled||[]){const item=el('div','sw-item');const x=el('span');x.append(el('strong',null,'#'+(m.channel_name||m.channel_id)),el('small',null,new Date(m.scheduled_for).toLocaleString()+' · Scheduled via Slack · '+String(m.message||'').slice(0,95)));item.appendChild(x);if(m.status==='queued'&&m.slack_schedule_id){const b=el('button','sw-btn danger','Cancel');b.onclick=()=>run('swSendMsg',async()=>{if(!await confirmation('Cancel scheduled message?','Cancel the message scheduled for '+new Date(m.scheduled_for).toLocaleString()+' in #'+(m.channel_name||m.channel_id)+'?','Cancel message',true))return;await call(ADV,{action:'cancel_schedule',id:m.id});note('swSendMsg','Scheduled message cancelled.');await loadOverview()});item.appendChild(b)}scheduled.appendChild(item)}
 if(!(overview.scheduled||[]).length)scheduled.appendChild(el('div','sw-empty','No scheduled messages recorded.'));
 syncChannelSelectors();
}
function syncChannelSelectors(){
 const source=$('superChannel'),destination=$('swSendChannel'),people=$('swPeopleChannel');
 if(!source||!destination)return;
 for(const target of [destination,people]){
  if(!target)continue;
  const old=target===people?source.value:(target.value||source.value);
  target.replaceChildren(new Option('Choose a channel',''));
  for(const option of [...source.options])if(option.value)target.add(new Option(option.textContent,option.value));
  if([...target.options].some(x=>x.value===old))target.value=old;
 }
}
async function run(id,fn){const buttons=[...$('slackWorkspaceV2').querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await fn()}catch(e){note(id,e.message||String(e),true)}finally{buttons.forEach(b=>b.disabled=false)}}
async function retry(){const x=await call(ADV,{action:'retry_jobs'});note('swHealthMsg','Requeued '+x.requeued+' failed sync jobs.');await loadOverview()}
async function process(){const x=await call(COMMUNITY,{type:'process_queue',limit:25});const failures=(x.results||[]).filter(i=>!i.ok);note('swHealthMsg','Processed '+x.processed+' jobs · '+failures.length+' failed.',failures.length>0);await loadOverview()}
async function confirmation(title,message,confirmLabel='Confirm',danger=false){
 if(typeof confirmInApp==='function')return confirmInApp({title,message,confirmLabel,danger});
 return new Promise(resolve=>{
  const layer=el('div','super-modal-backdrop');const panel=el('section','super-modal');panel.setAttribute('role','alertdialog');panel.setAttribute('aria-modal','true');
  const header=el('h2',null,title),desc=el('p',null,message),actions=el('div','super-modal-actions');
  const cancel=el('button',null,'Cancel'),ok=el('button','super-modal-confirm'+(danger?' super-modal-danger':''),confirmLabel);
  const previous=document.activeElement;
  const done=result=>{document.removeEventListener('keydown',key,true);layer.remove();previous?.focus?.();resolve(result)};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();done(false)}else if(e.key==='Tab'){e.preventDefault();(document.activeElement===cancel?ok:cancel).focus()}};
  cancel.onclick=()=>done(false);ok.onclick=()=>done(true);layer.onclick=e=>{if(e.target===layer)done(false)};
  actions.append(cancel,ok);panel.append(header,desc,actions);layer.appendChild(panel);document.body.appendChild(layer);document.addEventListener('keydown',key,true);cancel.focus();
 });
}
async function assignExisting(){
 const project=Number($('swAssignSelect').value),channel=$('superChannel').value;
 if(!project||!channel)throw Error('Select a project and a private Slack channel first.');
 const name=[...$('superChannel').options].find(x=>x.value===channel)?.textContent?.replace(/^#/,'').split(' · ')[0]||channel;
 if(!await confirmation('Assign channel to project?','Connect #'+name+' to '+projectName(project)+'? This may replace an existing mapping.','Assign channel'))return;
 const {error}=await db.rpc('admin_slack_project_update',{p_project_id:project,p_channel_id:channel,p_channel_name:name,p_is_private:true});
 if(error)throw error;note('swAssignMessage','Assigned #'+name+' to '+projectName(project)+'. Click Sync members to apply access rules.');await loadOverview();
}
async function syncExisting(){
 const project=Number($('swAssignSelect').value);if(!project)throw Error('Choose a project first');
 const d=await call(COMMUNITY,{type:'sync_project',project_id:project,limit:100});
 const failed=(d.results||[]).filter(x=>!x.ok);
 note('swAssignMessage','Processed '+Number(d.processed||0)+' sync jobs · '+failed.length+' failed.',failed.length>0);
 await loadOverview();
}
async function bootstrap(){const project=Number($('swProjectSelect').value),name=$('swProjectChannelName').value.trim();if(!project||!name)throw Error('Choose a project and enter a channel name.');if(!await confirmation('Create private project channel?','Create #'+name+' in Slack and assign it to '+projectName(project)+'?','Create & assign'))return;const d=await call(ADV,{action:'create_for_project',project_id:project,name});note('swBootstrapMsg','Created and assigned #'+d.channel.name+'. Use Sync project members to invite eligible contributors.');$('superRefresh')?.click();await loadOverview()}
async function loadMembers(){const channel=$('swPeopleChannel').value||$('superChannel').value;if(!channel)throw Error('Select a channel in Channels & Projects first');const d=await call(ADV,{action:'members_detail',channel_id:channel});memberList=d.members||[];renderMembers(channel);note('swMemberMsg',d.count+' members in this channel.')}
function renderMembers(channel){const list=$('swMemberList');list.replaceChildren();for(const member of memberList){const item=el('div','sw-item'),info=el('span');const name=member.display_name||member.real_name||member.username||member.slack_user_id;info.append(el('strong',null,name),el('small',null,[member.email,member.adatacore_user_id?'Adatacore linked':'Slack member',member.slack_user_id].filter(Boolean).join(' · ')));const btn=el('button','sw-btn danger','Remove');btn.onclick=()=>run('swMemberMsg',async()=>{const allow=await confirmation('Remove member from channel?','Remove '+name+' from this Slack channel? Project syncing may add the person back if they still have project access.','Remove member',true);if(!allow)return;await call(ADV,{action:'remove',channel_id:channel,user_id:member.slack_user_id,confirm_managed:true});await loadMembers();note('swMemberMsg',name+' removed from channel.')});item.append(info,btn);list.appendChild(item)}if(!memberList.length)list.appendChild(el('div','sw-empty','No members found.'))}
async function sendMessage(){const channel=$('swSendChannel').value,message=$('swMessage').value.trim(),scheduled=$('swScheduleToggle').checked;if(!channel)throw Error('Select a destination channel');if(!message)throw Error('Write a message first');const channelName=[...$('swSendChannel').options].find(x=>x.value===channel)?.textContent||channel;const date=$('swScheduleAt').value;
 if(scheduled&&(!date||new Date(date).getTime()<Date.now()+5*60*1000))throw Error('Choose a scheduled time at least 5 minutes in the future');
 const when=scheduled?new Date(date).toLocaleString():'now';if(!await confirmation(scheduled?'Schedule Slack message?':'Send Slack message?','Destination: '+channelName+' · '+(scheduled?'Delivery: '+when:'Send immediately')+'\n\n'+message.slice(0,230),scheduled?'Schedule message':'Send message'))return;
 const result=await call(ADV,{action:scheduled?'schedule':'send',channel_id:channel,channel_name:channelName.replace(/^#/,'').split(' · ')[0],message,...(scheduled?{scheduled_for:new Date(date).toISOString()}:{})});
 note('swSendMsg',scheduled?'Message accepted by Slack for delivery at '+when+'.':'Message sent to '+channelName+'.');$('swMessage').value='';await loadOverview();
}
(async()=>{for(let i=0;i<80;i++){if(window.supabase?.createClient&&$('super-slack')&&$('slackCommunityPanel')&&$('slack-notifications'))break;await new Promise(r=>setTimeout(r,125))}if(!window.supabase?.createClient)return;if(!await guard())return;ready=make();if(ready)try{await loadOverview()}catch(e){note('swHealthMsg','Dashboard error: '+(e.message||e),true)}})();
})();