const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const platform=fs.readFileSync('voice-studio-platform.js','utf8');
const html=fs.readFileSync('voice-studio.html','utf8');
const css=fs.readFileSync('voice-studio-visibility-cues.css','utf8');
test('only one recording desk is shared by Solo and Duo',()=>{
 assert.equal((html.match(/id="recordDock"/g)||[]).length,1);
 assert.match(html,/id="vsSoloDockHome"/);
 assert.match(platform,/id=\\\\"vsDuoDockHome\\\\"|id="vsDuoDockHome"/);
 assert.match(platform,/target\.appendChild\(dock\)/);
 assert.match(platform,/recordingDesk\('solo'\);\s*const host/);
 assert.match(platform,/recordingDesk\('duo'\)/);
});
test('Duo uses Solo waveform, timer, mic meter and audio playback lifecycle',()=>{
 assert.match(platform,/window\.VoiceStudioExtras\?\.start\(stream,script\.duration_seconds\)/);
 assert.match(platform,/window\.VoiceStudioExtras\?\.stop\(secs\)/);
 assert.match(platform,/\$\('recordTime'\)\.textContent=fmt\(secs\)/);
 assert.match(platform,/\$\('playback'\)\.src=previewUrl/);
 assert.match(platform,/\$\('saveRecord'\)\.onclick=/);
 assert.match(platform,/\$\('resetRecord'\)\.onclick=/);
});
test('Duo request must respect consent and shared controls keep backend mode isolation',()=>{
 assert.match(platform,/session\?\.actor_a===me\.id\)void begin/);
 assert.match(platform,/left>0\|\|!connected/);
 assert.match(platform,/if\(mode==='duo'&&!uploading&&blob\)/);
 assert.match(platform,/if\(session\.state==='submitted'\)/);
 assert.match(css,/#duo #recordDock/);
});
test('Solo remains selectable and captions are labeled accurately by mode',()=>{
 assert.match(platform,/which==='duo'\?'● Request recording':'● Start recording'/);
 assert.match(platform,/which==='duo'\s*\?\s*'Live captions are approximate/);
 assert.match(platform,/captionNote\.dataset\.soloCopy/);
 assert.match(css,/#duo .vs-duo-dialogue/);
});
