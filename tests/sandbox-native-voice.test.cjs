const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const voice=fs.readFileSync('voice-studio-platform.js','utf8');
const studio=fs.readFileSync('voice-studio.html','utf8');
const sandbox=fs.readFileSync('sandbox-native-voice.js','utf8');
const workspace=fs.readFileSync('workspace-sandbox-mode.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20261115010000_sandbox_native_voice_studio.sql','utf8');
test('native studio loads its sandbox adapter before shared production UI',()=>{
 assert.ok(studio.indexOf('/sandbox-native-voice.js')<studio.indexOf('/voice-studio-platform.js'));
 assert.match(voice,/sandbox=window\.SandboxNativeVoice\|\|null/);
 assert.match(voice,/if\(sandbox\)return sandbox\.rpc\(db,name,args\)/);
});
test('sandbox recording uploads use dedicated storage without production fallback',()=>{
 assert.match(voice,/if\(sandbox\)path=await sandbox\.upload/);
 assert.match(sandbox,/storage\.from\('sandbox-voice'\)/);
 assert.match(sandbox,/throw Error\('Production Voice RPC/);
 assert.match(migration,/bucket_id='sandbox-voice'/);
 assert.match(migration,/sandbox_voice_storage_allowed/);
});
test('test assignments open native voice studio instead of simulated UI',()=>{
 assert.match(workspace,/location\.assign\('\/voice-studio\?test_session='/);
 assert.match(workspace,/Native editor not yet supported for this project/);
});
test('review records stay private and no payroll changes are introduced',()=>{
 assert.match(migration,/app_private\.sandbox_voice_takes/);
 assert.match(migration,/SANDBOX_REVIEW_NOT_ALLOWED/);
 assert.doesNotMatch(migration,/\bupdate\s+public\.(vs_sessions|vs_tracks|payments|balances)\b/i);
 assert.doesNotMatch(migration,/\binsert\s+into\s+public\.(vs_sessions|vs_tracks|payments|balances)\b/i);
});
