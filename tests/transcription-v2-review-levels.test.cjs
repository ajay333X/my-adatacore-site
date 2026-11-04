const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const page=read('transcription-lab-v2.html');
const script=read('transcription-lab-v2-levels.js');
const style=read('transcription-lab-v2-levels.css');
const ids=[...page.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const known=new Set(ids);

test('Existing Transcription Lab V2 control IDs remain unique alongside reviewer permissions',()=>{
 assert.equal(ids.length,known.size,'Duplicate control IDs');
 for(const id of ['assignDialog','assignLayer','assignPeople','assignQty','assignConfirm',
 'v2opsPeopleList','v2opsPeopleSearch','v2opsQaList','v2opsRulesSave',
 'txLevelsPanel','txLevelsHeading','txLevelsSearch','txLevelsRoster','txLevelsRefresh',
 'txLevelsAssign','txLevelsMode','txLevelsLimit','txLevelsSave','txLevelsDialog',
 'txLevelsManageFromAssign','txLevelsNotice','txLevelsActive','txLevelsPerson',
 'txLevelsCancel','txLevelsCancelTop','txLevelsCount','txLevelsAssignHelp']){
  assert.ok(known.has(id),'Missing '+id);
 }
});
test('Admin role manager is a separate module and does not replace the original assignment RPC',()=>{
 assert.ok(page.includes('/transcription-lab-v2-levels.js?v=1'));
 assert.ok(page.includes('/transcription-lab-v2-levels.css?v=1'));
 assert.ok(page.includes('/transcription-lab-v2-core.js?v=2'));
 const core=read('transcription-lab-v2-core.js');
 assert.ok(core.includes("rpc('tx_assign'"),'Existing task assignment retained');
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.ok(script.includes("tx_admin_review_levels"));
 assert.ok(script.includes("tx_admin_set_review_level"));
 assert.ok(script.includes("txv2:data"));
 assert.ok(!script.includes("db.from("),'Role table must stay private behind authorized RPCs');
});
test('Review-level selection is per-project and capacity-aware',()=>{
 for(const token of ["projectId","active_l1","active_l2","l1_remaining","l2_limit",
   "L1","L2","BOTH","PAUSED","p_project_id:projectId","p_user_id:selected.user_id"]){
  assert.ok(script.includes(token),'Missing '+token);
 }
 assert.ok(page.includes('<option value="L3" disabled>'),'L3 should not appear as operational before the review engine supports it');
 assert.ok(script.includes("modal.showModal()"));
 assert.ok(script.includes("assignConfirm.textContent=reviewer"));
});
test('Members are rendered as text and no user data is injected into unsafe HTML',()=>{
 assert.ok(script.includes("el.textContent=String(text)"));
 assert.ok(script.includes("roster.replaceChildren()"));
 assert.ok(!script.includes("roster.innerHTML"));
 assert.ok(!script.includes("eval("));
 for(const id of script.split("$('").slice(1).map(x=>x.split("'")[0])){
  assert.ok(known.has(id),'Role manager references missing DOM element: '+id);
 }
});
test('Role manager is responsive and preserves reduced-motion accessibility',()=>{
 assert.equal((style.match(/{/g)||[]).length,(style.match(/}/g)||[]).length);
 assert.ok(style.includes('@media(max-width:640px)'));
 assert.ok(style.includes('prefers-reduced-motion'));
 assert.ok(style.includes('focus-visible'));
});
