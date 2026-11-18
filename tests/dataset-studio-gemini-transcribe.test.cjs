const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const backend=fs.readFileSync('supabase/functions/dataset-studio/index.ts','utf8');
const ui=fs.readFileSync('audio-dataset-studio.js','utf8');
const page=fs.readFileSync('audio-dataset-studio.html','utf8');

test('Gemini appears beside original Groq and OpenAI providers',()=>{
 for(const key of ['groq','openai','gemini']){
  assert.ok(backend.includes('raw==="'+key+'"'),'backend provider missing '+key);
  assert.ok(ui.includes('value="'+key+'"'),'frontend provider missing '+key);
 }
 assert.match(page,/id="view-library"/);
 assert.match(page,/id="view-applications"/);
});
test('Gemini server key remains private and is never included in frontend code',()=>{
 assert.match(backend,/Deno\.env\.get\("GEMINI_API_KEY"\)/);
 assert.match(backend,/gemini-3\.5-transcribe/);
 assert.doesNotMatch(ui,/AIza[0-9A-Za-z_\-]{20,}/);
});
test('Gemini requires explicit per-clip data use confirmation',()=>{
 assert.match(backend,/provider==="gemini" && !allowGoogleDataUse/);
 assert.match(backend,/body\.allow_google_data_use===true/);
 assert.match(ui,/data-gemini-consent/);
 assert.match(ui,/allow_google_data_use:allowGoogleDataUse/);
});
test('Gemini uses documented Interactions API mode and inline WAV payload',()=>{
 assert.match(backend,/generativelanguage\.googleapis\.com\/v1beta\/interactions/);
 assert.match(backend,/const config:any=\{mode:\{type:"verbatim"\}\}/);
 assert.match(backend,/input:\[\{type:"audio",data:b64,mime_type:"audio\/wav"\}\]/);
 assert.match(backend,/generation_config:\{transcription_config:config\}/);
 assert.match(backend,/timestamp(s)?_available:false/);
});
test('Existing transcription status and models are preserved and verified transcripts protected',()=>{
 assert.match(backend,/whisper-large-v3-turbo/);
 assert.match(backend,/gpt-transcribe/);
 assert.match(backend,/\.neq\("transcript_status","human_verified"\)/);
 assert.match(backend,/if\(clip\.transcript_status==="human_verified"\)/);
 assert.match(ui,/['"]human_verified['"]/);
});
test('frontend JavaScript syntax valid',()=>assert.doesNotThrow(()=>new Function(ui)));