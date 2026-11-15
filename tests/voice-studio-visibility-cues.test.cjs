const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const cue=require('../voice-studio-duo-cue.js');
const html=fs.readFileSync('voice-studio.html','utf8');
const platform=fs.readFileSync('voice-studio-platform.js','utf8');
const css=fs.readFileSync('voice-studio-visibility-cues.css','utf8');
const visibility=fs.readFileSync('voice-studio-solo-visibility.js','utf8');
test('Solo lines remain scrollable above the measured recording controls',()=>{
 assert.match(css,/#solo .vs-script-body/);
 assert.match(css,/max-height:clamp/);
 assert.match(css,/padding-bottom:calc\(var\(--vs-solo-dock-height/);
 assert.match(visibility,/ResizeObserver/);
 assert.match(visibility,/dock.getBoundingClientRect\(\).height/);
 assert.ok(html.indexOf('voice-studio-visibility-cues.css')>html.indexOf('voice-studio-duo.css'));
});
test('Duo cue module loads after script parser but before studio',()=>{
 assert.ok(html.indexOf('voice-studio-duo-script.js')<html.indexOf('voice-studio-duo-cue.js'));
 assert.ok(html.indexOf('voice-studio-duo-cue.js')<html.indexOf('voice-studio-platform.js'));
 assert.match(platform,/window.VoiceDuoCue\?\.mount/);
 assert.match(platform,/window.VoiceDuoCue\?\.dispose/);
});
test('speech cues are conservative: never advance on short or unrelated recognition',()=>{
 assert.equal(cue.matches('हेलो','नमस्ते, मुझे आपकी मदद चाहिए।'),false);
 assert.equal(cue.matches('mera naam ram hai','what is the current account balance'),false);
 assert.equal(cue.matches('आपका ऑर्डर नंबर क्या है','आपका ऑर्डर नंबर क्या है?'),true);
 assert.equal(cue.matches('Please tell me your order number','Please tell me your order number.'),true);
});
test('speech recognition is opt-in and manual controls remain available',()=>{
 const source=fs.readFileSync('voice-studio-duo-cue.js','utf8');
 assert.match(source,/enable.textContent='Enable voice cues'/);
 assert.match(source,/previous.onclick/);
 assert.match(source,/next.onclick/);
 assert.match(source,/if\(!recognitionType\)/);
 assert.match(source,/may use your browser’s online speech service/);
});
