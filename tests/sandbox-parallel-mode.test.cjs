const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const sql=fs.readFileSync('supabase/migrations/20261115050000_sandbox_parallel_solo_duo.sql','utf8');
test('Solo and Duo have independent active-take uniqueness',()=>{
 assert.match(sql,/owner_id,account_id,project_id,mode/);
 assert.match(sql,/where state='recording'/);
});
test('Solo RPC never reuses or submits a Duo track',()=>{
 assert.equal((sql.match(/mode='solo' and duo_session_id is null/g)||[]).length,4);
 assert.match(sql,/SANDBOX_SOLO_L1_ONLY/);
 assert.match(sql,/admin_sandbox_voice_action/);
});
