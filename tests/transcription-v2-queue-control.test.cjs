const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const get=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=get('transcription-lab-v2.html');
const control=get('transcription-lab-v2-queue-control.js');
const style=get('transcription-lab-v2-queue-control.css');
const oldCore=get('transcription-lab-v2-core.js');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const set=new Set(ids);
test('Queue Control tab and live L1/L2 totals are present without replacing the original views',()=>{
 assert.equal(ids.length,set.size,'No duplicate HTML IDs');
 for(const id of ['txqL1Ready','txqL1Assigned','txqL2Waiting','txqL2Assigned',
 'txqApproved','txqOther','txqRows','txqCount','txqFilter','txqSearch',
 'txqTarget','txqAssignee','txqImpact','txqApply','txqNotice','txqRefresh',
 'txqSelectedName','txqConfirmDialog','txqConfirm','txqCancel','txqOpenPeople']){
  assert.ok(set.has(id),'Missing queue control: '+id);
 }
 for(const existing of ['audioRows','queueRefresh','assignDialog','assignLayer',
 'assignPeople','assignConfirm','v2opsQaList','v2opsPeopleList','txLevelsPanel','totalCount']){
  assert.ok(set.has(existing),'Original operation missing: '+existing);
 }
 assert.ok(html.includes('data-tx-view="queues"'));
 assert.ok(html.includes('data-tx-tab="queues"'));
 assert.ok(html.includes('/transcription-lab-v2-queue-control.js?v=1'));
 assert.ok(html.includes('/transcription-lab-v2-queue-control.css?v=1'));
});
test('Queue routing is a deliberate admin-only action on one selected audio item',()=>{
 assert.doesNotThrow(()=>new vm.Script(control));
 assert.ok(control.includes("tx_admin_queue_board"));
 assert.ok(control.includes("tx_admin_queue_route"));
 for(const name of ['p_item:a.id','p_target:target','p_assignee:person?.id||null']){
  assert.ok(control.includes(name),'Missing intended action parameter '+name);
 }
 assert.ok(control.includes('showModal()'));
 assert.ok(control.includes('Existing')===false||control.includes('No transcript edits'));
 assert.ok(!control.includes('db.from('),'Browser must not mutate task tables directly');
 assert.ok(!control.includes('.innerHTML'),'User-generated audio labels must use safe text nodes');
});
test('Queue UI explains locked stages and prevents reviewer self-review by email',()=>{
 for(const fragment of ["route_l1","route_l2","L2 needs an actual submitted L1 transcript",
 "Reviewers cannot review their own L1 submissions","already assigned to a reviewer",
 "Approved work is locked","No active L2 reviewers","txqTabBadge"]){
  assert.ok(control.includes(fragment),'Missing safety explanation: '+fragment);
 }
 assert.ok(html.includes('L3 is not configured'));
 assert.ok(!html.includes('<option value="L3">'));
});
test('Project switching, manual refresh and original live queue stay synchronized',()=>{
 assert.ok(control.includes("document.addEventListener('txv2:data'"));
 assert.ok(control.includes("queueRefresh"));
 assert.ok(control.includes("projectId=id;board=null;selectedId=null"));
 assert.ok(control.includes("txqOpenPeople"));
 assert.ok(oldCore.includes("rpc('tx_get_lab'"));
 assert.ok(oldCore.includes("rpc('tx_assign'"));
 assert.ok(oldCore.includes("document.dispatchEvent(new CustomEvent('txv2:data'"));
});
test('Responsive panels and readable controls support reduced motion',()=>{
 assert.equal((style.match(/{/g)||[]).length,(style.match(/}/g)||[]).length);
 for(const x of ['txq-metrics','txq-rows','txq-confirm','@media(max-width:900px)',
 '@media(max-width:570px)','prefers-reduced-motion','focus-visible']){
  assert.ok(style.includes(x),'Missing queue UI style: '+x);
 }
 for(const id of control.split("$('").slice(1).map(s=>s.split("'")[0])){
  assert.ok(set.has(id),'Unknown DOM element referenced by queue script: '+id);
 }
});
