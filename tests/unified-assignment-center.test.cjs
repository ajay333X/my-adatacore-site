const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const file=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=file('assignment-center.html'),script=file('assignment-center-simple.js');
const style=file('assignment-center-simple.css'),entry=file('assignment-center-entry.html');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const known=new Set(ids);
test('Three clear assignment inputs replace complicated action targets',()=>{
 assert.equal(ids.length,known.size,'Duplicate HTML IDs');
 for(const id of ['levelChoice','membershipAction','dailyTasks','applyChanges','selectedPreview',
 'peopleList','projectList','peopleSearch','projectSearch','dailySummary','actionResult',
 'confirmRevoke','dailyMinus','dailyPlus','dailyHelp']){
  assert.ok(known.has(id),'Missing UI '+id);
 }
 for(const retired of ['taskTarget','taskLayer','autoCapacity','targetDown','targetUp','reviewLimit','accessAction']){
  assert.ok(!known.has(retired),'Old confusing input still present: '+retired);
 }
 assert.ok(html.includes('<option value="active">Add to project</option>'));
 assert.ok(html.includes('<option value="revoked">Remove from project</option>'));
 assert.ok(html.includes('Tasks per day'));
 assert.ok(html.includes('00:00 UTC'));
});
test('New admin route loads only the simple assignment controller',()=>{
 assert.ok(html.includes('/assignment-center-simple.js?v=1'));
 assert.ok(html.includes('/assignment-center-simple.css?v=1'));
 assert.ok(!html.includes('src="/assignment-center-v2.js'));
 assert.ok(entry.includes('/assignment-center-simple.js?v=1'));
 const boot=entry.split('<script>')[1]?.split('</script>')[0];
 assert.ok(boot);
 assert.doesNotThrow(()=>new vm.Script(boot));
});
test('Simple center retrieves real per-person roles, project membership and daily counts',()=>{
 assert.doesNotThrow(()=>new vm.Script(script));
 for(const token of ['admin_assignment_center_simple_snapshot','admin_assignment_center_simple_apply',
 'daily_settings','access_limits','assigned_today','model.projects','model.people',
 'model.review_levels','model.access','get_my_admin_access','project?.project_type']){
  assert.ok(script.includes(token),'Missing live data integration '+token);
 }
});
test('Daily quota is an actual server-side setting, not a one-time active-task target',()=>{
 for(const token of ["p_tasks_per_day:", 
 "p_membership:$('membershipAction').value",
 "p_level:",'p_project_id:Number(project.id)']){
  assert.ok(script.includes(token),'RPC does not send '+token);
 }
 assert.ok(!script.includes('p_target_limit'),'Do not send old active task target');
 assert.ok(!script.includes('p_auto_capacity'),'Do not synthesize inventory');
 assert.ok(script.includes('00:00 UTC'));
});
test('Revoke action is confirmed and does not delete task records',()=>{
 assert.ok(script.includes('confirmRevoke'));
 assert.ok(script.includes('revokeConfirm'));
 assert.ok(script.includes('No new tasks assigned now'));
 assert.ok(html.includes('Existing work will remain recorded.'));
 assert.ok(!script.includes('db.from('),'Permission mutations must use authorized RPC only');
 assert.ok(!script.includes('.innerHTML'),'Untrusted names must be rendered as text');
});
test('Existing project directory and contributor selection remain accessible',()=>{
 for(const id of ['projectList','peopleList','peopleFilter','activeOnly','selectVisible',
 'visibleCount','selectedInfo','clearSelection','projectCount','refreshAll']){
  assert.ok(known.has(id));
 }
 for(const id of script.split("$('").slice(1).map(s=>s.split("'")[0])){
  assert.ok(known.has(id),'Script references missing element '+id);
 }
 assert.equal((style.match(/{/g)||[]).length,(style.match(/}/g)||[]).length,'CSS braces');
 assert.ok(style.includes('prefers-reduced-motion'));
 assert.ok(style.includes('@media(max-width:760px)'));
});
test('L2 contributor workspace still blocks new L1 claims without deleting old tasks',()=>{
 const workspace=file('workspace-project-groups.js');
 const taskRouter=file('workspace-task-open-fix.js');
 assert.doesNotThrow(()=>new vm.Script(workspace));
 assert.doesNotThrow(()=>new vm.Script(taskRouter));
 assert.ok(workspace.includes('canClaim:p.can_claim_l1!==false'));
 assert.ok(workspace.includes('Finish existing L1'));
 assert.ok(taskRouter.includes("'/transcription-v2'"));
});
