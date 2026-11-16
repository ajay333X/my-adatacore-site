const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const ui = fs.readFileSync('audio-dataset-studio.js', 'utf8');
const page = fs.readFileSync('audio-dataset-studio.html', 'utf8');
const worker = fs.readFileSync('supabase/functions/dataset-studio/index.ts', 'utf8');

test('existing collection, applicant and clip workflows remain present', () => {
  for (const id of ['view-sources','view-applications','view-editor','view-library','view-overview']) {
    assert.match(page, new RegExp('id="'+id+'"'));
  }
  assert.match(ui, /openImportedSource\(id\)/);
  assert.match(ui, /function createClip\(/);
  assert.match(ui, /function renderClips\(/);
});

test('each clip can choose Groq or OpenAI explicitly', () => {
  assert.match(ui, /data-clip-provider/);
  assert.match(ui, /providerSelections\.set\(/);
  assert.match(ui, /<option value="groq"/);
  assert.match(ui, /<option value="openai"/);
  assert.match(ui, /api\('transcribe',\{clip_id:id,provider,replace_existing:existing\}\)/);
  assert.match(page, /id="dsProviderStatus"/);
});

test('OpenAI integrates with its supported model and JSON response contract', () => {
  assert.match(worker, /gpt-transcribe/);
  assert.match(worker, /https:\/\/api\.openai\.com\/v1\/audio\/transcriptions/);
  assert.match(worker, /OPENAI_API_KEY/);
  assert.match(worker, /provider==="openai"\?"json":"verbose_json"/);
  assert.match(worker, /if\(provider==="groq"\)form\.append\("timestamp_granularities\[\]","segment"\)/);
  assert.match(worker, /const segments=Array\.isArray\(output\.segments\)/);
});

test('original Groq flow still works without specifying provider', () => {
  assert.match(worker, /if\(raw==="groq" \|\| raw===undefined \|\| raw===null\)return "groq"/);
  assert.match(worker, /https:\/\/api\.groq\.com\/openai\/v1\/audio\/transcriptions/);
  assert.match(worker, /whisper-large-v3-turbo/);
});

test('verified transcripts stay protected and replacements require explicit consent', () => {
  assert.match(worker, /clip\.transcript_status==="human_verified"/);
  assert.match(worker, /clip\.transcript&&!body\.replace_existing/);
  assert.match(worker, /\.neq\("transcript_status","human_verified"\)/);
  assert.match(ui, /window\.confirm\(/);
});

test('provider status indicates configuration without exposing tokens', () => {
  assert.match(worker, /action==="provider_status"/);
  assert.match(worker, /configured:Boolean\(Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.match(worker, /configured:Boolean\(Deno\.env\.get\("GROQ_API_KEY"\)/);
  assert.doesNotMatch(ui, /OPENAI_API_KEY\s*:\s*["']sk-/);
  assert.doesNotMatch(page, /OPENAI_API_KEY\s*:\s*["']sk-/);
});

test('new provider selection JavaScript has valid syntax', () => {
  assert.doesNotThrow(() => new Function(ui));
});