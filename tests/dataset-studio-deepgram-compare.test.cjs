const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const worker=fs.readFileSync('supabase/functions/dataset-studio/index.ts','utf8');
const ui=fs.readFileSync('audio-dataset-studio.js','utf8');
const html=fs.readFileSync('audio-dataset-studio.html','utf8');

test('Deepgram Nova-3 provider is optional and previous choices remain available',()=>{
 for(const name of ['groq','openai','gemini','deepgram']){
  assert.ok(worker.includes('raw==="'+name+'"'),'server provider missing '+name);
  assert.ok(ui.includes('value="'+name+'"'),'UI provider missing '+name);
 }
 assert.match(worker,/DEEPGRAM_API_KEY/);
 assert.match(worker,/deepgram\/nova-3/);
});
test('Deepgram sends WAV with correct auth, language and model improvement opt-out',()=>{
 assert.match(worker,/api\.deepgram\.com\/v1\/listen/);
 assert.match(worker,/Authorization":"Token " \+key/);
 assert.match(worker,/Content-Type":"audio\/wav"/);
 assert.match(worker,/mip_opt_out:"true"/);
 assert.match(worker,/language:code/);
 assert.match(worker,/alternative\.words\.slice\(0,600\)/);
 assert.match(worker,/filler_words:"true"/);
});
test('Deepgram requires permission to process recordings',()=>{
 assert.match(worker,/if\(provider==="deepgram" && !allowDeepgramProcessing\)/);
 assert.match(worker,/body\.allow_deepgram_processing===true/);
 assert.match(ui,/data-deepgram-consent/);
 assert.match(ui,/allow_deepgram_processing/);
});
test('comparison runs exactly two different providers and is explicitly authorized',()=>{
 assert.match(worker,/body\.confirm_api_usage!==true/);
 assert.match(worker,/body\.providers\.length!==2/);
 assert.match(worker,/body\.providers\[0\]===body\.providers\[1\]/);
 assert.match(worker,/Promise\.allSettled/);
 assert.match(worker,/non_persistent:true/);
 assert.match(ui,/data-compare-a/);
 assert.match(ui,/data-compare-b/);
 assert.match(ui,/window\.confirm\('Run two external AI transcription requests/);
});
test('comparison cannot silently replace or verify existing transcripts',()=>{
 const start=worker.indexOf('if(action==="compare"){');
 const end=worker.indexOf('const provider=safeProvider(body.provider);',start);
 assert.ok(start>0&&end>start,'comparison handler missing');
 assert.doesNotMatch(worker.slice(start,end),/\.update\(/);
 assert.match(ui,/comparisonSelections\.set\(/);
 assert.match(ui,/data-clip-action="choose-comparison"/);
 assert.match(ui,/Transcript saved as an edited draft/);
 assert.match(worker,/\.neq\("transcript_status","human_verified"\)/);
});
test('existing Studio sections, drafts and editor are retained',()=>{
 for(const id of ['view-sources','view-applications','view-editor','view-library','view-overview'])assert.ok(html.includes('id="'+id+'"'));
 for(const name of ['whisper-large-v3-turbo','gpt-transcribe','gemini-3.5-transcribe'])assert.ok(worker.includes(name));
 assert.match(ui,/function createClip\(/);
 assert.match(ui,/function renderClips\(/);
});
test('UI JavaScript parses',()=>assert.doesNotThrow(()=>new Function(ui)));
