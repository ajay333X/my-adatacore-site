const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const file=(name)=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=file('assignment-center.html'),script=file('assignment-center-v2.js'),css=file('assignment-center-v2.css');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const known=new Set(ids);

test('Unified Assignment Center replaces old UI without changing the route',()=>{
 assert.ok(html.includes('Assignment Center · Adatacore'));
 assert.ok(html.includes('/assignment-center-v2.js?v=1'));
 assert.ok(html.includes('/assignment-center-v2.css?v=1'));
 assert.ok(!html.includes('/assignment-center.js?v=1'),'Retired assignment controller must not run twice');
 assert.equal(known.size,ids.length,'No duplicated control IDs');
 for(const id of ['projectList','projectSearch','peopleList','peopleSearch','peopleFilter','activeOnly','selectVisible',
 'selectedInfo','clearSelection','statProjects','statPeople','statGrants','statRevoked',
 'accessAction','reviewLevel','reviewLimit','taskLayer','taskTarget','autoCapacity',
 'applyChanges','confirmRevoke','revokeCancel','revokeConfirm','actionResult','syncStatus','previewSummary']){
  assert.ok(known.has(id),'Missing control: '+id);
 }
});
test('All projects and all contributors are driven by live scoped server snapshot',()=>{
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.ok(script.includes("admin_assignment_center_v2_snapshot"));
 assert.ok(script.includes("admin_assignment_center_preview"));
 assert.ok(script.includes("get_my_admin_access"));
 assert.ok(script.includes("new URLSearchParams(location.search)"));
 assert.ok(script.includes("public")===false,'Frontend must not reference SQL tables');
 assert.ok(script.includes("model.projects"));
 assert.ok(script.includes("model.people"));
 assert.ok(script.includes("model.review_levels"));
 assert.ok(script.includes("model.access"));
});
test('Grant revoke and assignments use one authorized atomic backend call',()=>{
 assert.ok(script.includes("admin_assignment_center_v2_apply"));
 assert.ok(script.includes("p_project_id:Number(project.id)"));
 assert.ok(script.includes("p_user_ids:allSelected().map(p=>p.id)"));
 assert.ok(script.includes("p_access:"));
 assert.ok(script.includes("p_review_level:"));
 assert.ok(script.includes("p_assign_layer:"));
 assert.ok(script.includes("p_target_limit:"));
 assert.ok(script.includes("p_auto_capacity:"));
 assert.ok(script.includes("confirmRevoke"));
 assert.ok(!script.includes(".from("),'Browser must not mutate permission or task tables directly');
 assert.ok(!script.includes(".innerHTML"),'Roster must render safely with text nodes');
});
test('Statuses distinguish inherited project access and transcription explicit enrollment',()=>{
 assert.ok(script.includes("tx()?'Not enrolled':'Inherited'"));
 assert.ok(script.includes("Grant / restore access")===false,'Options live in HTML');
 assert.ok(html.includes("Grant / restore access"));
 assert.ok(html.includes("Revoke project access"));
 assert.ok(html.includes("L2 · Review only"));
 assert.ok(html.includes("L1 + L2 · Both levels"));
 assert.ok(html.includes("Paused · No new tasks"));
 assert.ok(script.includes("L2 only prevents new L1 transcription claims"));
 assert.ok(html.includes('L3 is not yet part of this review pipeline'));
});
test('No fabricated success if a permission is saved but no tasks are assigned',()=>{
 assert.ok(script.includes("created_tasks"));
 assert.ok(script.includes("Zero new tasks assigned."));
 assert.ok(script.includes("Existing active work already meets the target."));
 assert.ok(script.includes("data?.results"));
 assert.ok(script.includes("No changes were confirmed"));
});
test('Reviewer workspace stops offering new L1 for L2-only but preserves assigned work',()=>{
 const groups=file('workspace-project-groups.js');
 const taskOpen=file('workspace-task-open-fix.js');
 assert.doesNotThrow(()=>new vm.Script(groups));
 assert.doesNotThrow(()=>new vm.Script(taskOpen));
 assert.ok(groups.includes("canClaim:p.can_claim_l1!==false"));
 assert.ok(groups.includes("Finish existing L1"));
 assert.ok(groups.includes("!g.canClaim||g.remaining<=0||g.queue===0"));
 assert.ok(groups.includes("g.canClaim&&(g.hasAccess||g.count>0)"));
 assert.ok(taskOpen.includes("button.dataset.transcriptionProject"));
 assert.ok(groups.includes("'/transcription-v2'"));
 assert.ok(file('workspace.html').includes('/workspace-project-groups.js?v=6'));
 assert.ok(file('workspace.html').includes('/workspace-task-open-fix.js?v=2'));
});
test('Responsive accessible interaction, focus and reduced-motion support',()=>{
 assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
 for(const token of ['@media(max-width:760px)','@media(max-width:520px)',
   'prefers-reduced-motion','focus-visible','ac-workspace','ac-roster']){
  assert.ok(css.includes(token),'Missing responsive pattern: '+token);
 }
 for(const id of script.split("$('").slice(1).map(s=>s.split("'")[0])){
  assert.ok(known.has(id),'Script references nonexistent control: '+id);
 }
});
