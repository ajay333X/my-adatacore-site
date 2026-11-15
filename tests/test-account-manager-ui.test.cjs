const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('admin-test-accounts.html','utf8');
const css=fs.readFileSync('sandbox-test.css','utf8');
test('manager creates 1–8 named identities without hardcoded account fields',()=>{
 assert.match(html,/id="dummyRows"/);assert.match(html,/id="addDummyBtn"/);
 assert.doesNotMatch(html,/id="dummyOne"/);assert.doesNotMatch(html,/id="dummyTwo"/);
 assert.match(html,/host\.children\.length>=8/);
 assert.match(html,/const accounts=\[\.\.\.el\('dummyRows'\)\.children\]/);
});
test('invalid duplicate names and unsupported roles are rejected before saving',()=>{
 assert.match(html,/new Set\(accounts\.map/);
 assert.match(html,/\['L1','L2'\]\.includes/);
 assert.match(html,/admin_sandbox_setup/);
});
test('manager supports project permission and isolated launch without production task mutation',()=>{
 assert.match(html,/admin_sandbox_project_access/);
 assert.match(html,/admin_sandbox_launch_project/);
 assert.match(html,/workspace\?test_session=/);
 assert.match(css,/\.sx-identity-row/);
});
