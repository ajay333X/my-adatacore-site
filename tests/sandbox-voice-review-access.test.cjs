const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const sql=fs.readFileSync('supabase/migrations/20261115040000_sandbox_voice_review_read.sql','utf8');
test('test audio upload requires an active L1 session',()=>{
 assert.match(sql,/p_write and t\.state='recording'/);
 assert.match(sql,/s\.ended_at is null/);
 assert.match(sql,/s\.expires_at>now\(\)/);
 assert.match(sql,/a\.level='L1'/);
});
test('review playback is owner and project capability restricted, not session dependent',()=>{
 assert.match(sql,/t\.owner_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/not p_write and/);
 assert.match(sql,/admin_has_capability\('qa_review',t\.project_id\)/);
 assert.match(sql,/admin_has_capability\('project_manage',t\.project_id\)/);
});
