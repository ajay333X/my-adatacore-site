const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ui=require('../voice-studio-duo-script.js');
const platform=fs.readFileSync('voice-studio-platform.js','utf8');
const entry=fs.readFileSync('voice-studio.html','utf8');
test('Agent and Customer are assigned to stable actor A and actor B',()=>{
 const session={actor_a:'a',actor_b:'b'};
 assert.equal(ui.roleFor(session,'a'),'agent');
 assert.equal(ui.roleFor(session,'b'),'customer');
 assert.equal(ui.roleFor(session,'stranger'),null);
});
test('whole dialogue keeps speaker order and continuation lines',()=>{
 const input='Agent: Hello!\nCustomer: I need help.\nAdditional details from the customer.\nएजेंट: ज़रूर।\nग्राहक: धन्यवाद।';
 const parsed=ui.scriptLines(input).filter(x=>!x.blank);
 assert.deepEqual(parsed.map(x=>x.role),['agent','customer','customer','agent','customer']);
 assert.equal(parsed[2].continuation,true);
 assert.equal(parsed[3].text,'ज़रूर।');
});
test('unrecognized narration is preserved instead of guessing a speaker',()=>{
 const parsed=ui.scriptLines('Scene introduction\nAgent: Hi\n\nCustomer: Hello');
 assert.equal(parsed[0].role,null);
 assert.equal(parsed[0].text,'Scene introduction');
 assert.equal(parsed.filter(x=>!x.blank).length,3);
});
test('role banner and dialogue cues share the real Duo studio DOM',()=>{
 assert.ok(entry.indexOf('voice-studio-duo-script.js')<entry.indexOf('voice-studio-platform.js'));
 assert.match(platform,/Voice Actor A — Agent/);
 assert.match(platform,/Voice Actor B — Customer/);
 assert.match(platform,/VoiceDuoScript\.render\(dialogue,script\.body,assignedRole\)/);
 assert.match(platform,/vs-duo-dialogue/);
 assert.match(platform,/COMPLETE SCRIPT/);
});
