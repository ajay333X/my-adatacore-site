const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const adapter=fs.readFileSync('sandbox-native-voice.js','utf8');
const studio=fs.readFileSync('voice-studio-platform.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261115020000_sandbox_native_voice_duo.sql','utf8');
test('sandbox agents use dummy identity for matching while production auth remains unchanged',()=>{
 assert.match(studio,/me=\{\.\.\.user,id:context\.account_id\}/);
 assert.match(studio,/if\(sandbox\)\{const context=await sandbox.initialize\(db\)/);
 assert.match(studio,/sandbox\.getDuo\(db,session\.id\)/);
 assert.match(studio,/sandbox\.tracks\(db,session\.id\)/);
});
test('isolated Duo sessions never submit into live voice tables',()=>{
 assert.match(sql,/app_private\.sandbox_voice_duo_sessions/);
 assert.match(sql,/app_private\.sandbox_voice_duo_signals/);
 assert.match(sql,/storage\.objects where bucket_id='sandbox-voice'/);
 assert.doesNotMatch(sql,/insert into public\.vs_(sessions|tracks|signals)/i);
 assert.doesNotMatch(sql,/update public\.vs_(sessions|tracks|signals)/i);
 assert.match(adapter,/this\.duo\(db,'submit'/);
 assert.match(adapter,/sandbox-voice/);
});
test('native Duo RPCs are routed through isolated actions',()=>{
 for(const name of ['vs_enter','vs_waiting','vs_consent','vs_request_recording','vs_respond_recording','vs_begin','vs_track_progress','vs_flag_task'])assert.ok(adapter.includes(name),name);
 assert.match(studio,/sandbox\.signal\(db,session\.id,kind,payload\)/);
 assert.match(studio,/sandbox\.signals\(db,session\.id,signalId\)/);
 assert.match(adapter,/lastMode==='duo'/);
});
test('state machine enforces two-person consent and per-actor audio submission',()=>{
 assert.match(sql,/actor_a<>v_account\.id/);
 assert.match(sql,/consent_a and consent_b/);
 assert.match(sql,/DUO_START_NOT_ALLOWED/);
 assert.match(sql,/SANDBOX_AUDIO_UPLOAD_REQUIRED/);
 assert.match(sql,/actor_a_track_state='submitted' and actor_b_track_state='submitted'/);
 assert.match(sql,/actor_a uuid not null/);
 assert.match(sql,/actor_b uuid/);
});
