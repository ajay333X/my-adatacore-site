const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const center=fs.readFileSync('admin-command-center.js','utf8');
const entry=fs.readFileSync('admin-entry.html','utf8');
const routes=JSON.parse(fs.readFileSync('vercel.json','utf8')).rewrites||[];
test('command center loads through the protected admin shell',()=>{
 assert.match(entry,/admin-command-center\.js/);
 assert.match(entry,/get_my_admin_access/);
 assert.match(center,/__adatacoreAdminAccess/);
 assert.match(center,/if\(!access\?\.allowed\)return false/);
});
test('command center hides privileged links for non-super administrators',()=>{
 assert.match(center,/access\.is_super_admin\?basic\.concat\(privileged\):basic/);
 assert.match(center,/\['Finance'/);
 assert.match(center,/\['Test accounts'/);
});
test('command center targets currently mapped routes',()=>{
 for (const path of ['/admin/operations','/admin/live-operations','/admin/assignments','/admin/test-accounts','/admin/finance']){
  assert.ok(routes.some(r=>r.source===path),'Missing route '+path);
 }
});
test('keyboard dialog supports search and escape, and does not synthesize metrics',()=>{
 assert.match(center,/e\.key\.toLowerCase\(\)==='k'/);
 assert.match(center,/e\.key==='Escape'/);
 assert.match(center,/search\.addEventListener\('input',render\)/);
 assert.doesNotMatch(center,/fakeMetrics|Math\.random\(\)/);
});

test('personal pins retain authorized search results and do not override access',()=>{
 assert.match(center,/adatacore-admin-command-pins-v1/);
 assert.match(center,/tools\.filter\(t=>t\.join\(' '\)\.toLowerCase\(\)\.includes\(q\)\)/);
 assert.match(center,/localStorage\.setItem\(pinKey,JSON\.stringify\(pins\)\)/);
 assert.match(center,/pin\.setAttribute\('aria-label'/);
});
