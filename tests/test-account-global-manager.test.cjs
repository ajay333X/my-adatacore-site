const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('admin-test-accounts.html','utf8');
const sql=fs.readFileSync('supabase/migrations/20261115030000_sandbox_global_accounts.sql','utf8');
test('global manager shows identities regardless of home project while activity remains scoped',()=>{
 assert.match(sql,/where a\.owner_id=v_owner\)/);
 assert.match(sql,/where owner_id=v_owner and project_id=p_project_id/);
 assert.match(html,/All test identities are listed/);
 assert.match(html,/Home group:/);
});
test('account updates use an authorized and audited server action',()=>{
 assert.match(sql,/v_account\.id is null/);
 assert.match(sql,/admin_has_capability\('project_manage',v_account\.project_id\)/);
 assert.match(sql,/SANDBOX_ACCOUNT_NAME_EXISTS/);
 assert.match(sql,/update app_private\.sandbox_test_sessions set ended_at=now\(\)/);
 assert.match(sql,/account\.updated/);
 assert.match(html,/admin_sandbox_update_account/);
});
test('manager provides accessible per-account control and clearly marks inactive identities',()=>{
 assert.match(html,/data-edit-form/);
 assert.match(html,/data-edit-account/);
 assert.match(html,/aria-expanded/);
 assert.match(html,/Active':'Suspended/);
 assert.match(html,/!a\.active\|\|!grants\.length/);
});
