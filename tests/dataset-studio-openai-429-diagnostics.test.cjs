const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const server=fs.readFileSync('supabase/functions/dataset-studio/index.ts','utf8');
const ui=fs.readFileSync('audio-dataset-studio.js','utf8');
test('classifies OpenAI 429 quota, credit and spending errors separately from rate throttling',()=>{
 for(const e of ['credit_balance_exhausted','insufficient_quota','project_spend_limit_exceeded','organization_spend_limit_exceeded','organization_usage_limit_exceeded']){
  assert.ok(server.includes(e),'Missing OpenAI error '+e);
 }
 assert.match(server,/temporary rate limit reached/);
 assert.match(server,/Retry after at least/);
 assert.match(server,/const seconds=\/\^\[0-9\]\+\$\/\.test\(rawRetry\)/);
});
test('transcription sends OpenAI-compatible language hints',()=>{
 assert.match(server,/if\(provider==="openai"\)form\.append\("languages\[\]",lang\)/);
 assert.match(server,/else form\.append\("language",lang\)/);
});
test('failed provider calls preserve existing drafts and verified transcripts',()=>{
 assert.match(server,/if\(!response\.ok\)/);
 assert.match(server,/if\(clip\.transcript_status==="human_verified"\)/);
 assert.match(server,/\.neq\("transcript_status","human_verified"\)/);
 assert.match(ui,/Existing drafts stay unchanged on failure/);
});
test('provider status distinguishes installed keys from available quota',()=>{
 assert.match(ui,/API key installed \(billing not checked\)/);
 assert.doesNotMatch(ui,/Ready':'API key required/);
});
test('Browser UI script has valid JavaScript syntax',()=>assert.doesNotThrow(()=>new Function(ui)));