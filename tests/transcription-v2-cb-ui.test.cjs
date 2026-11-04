// Contributor-side Transcription V2 regression checks.
// Run: node --test tests/transcription-v2-cb-ui.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const src=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=src('transcription-v2.html');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const known=new Set(ids);
test('Keeps old editor controls and includes new contributor controls',()=>{
 assert.equal(ids.length,known.size,'Duplicate IDs in CB editor');
 const core=['audio','play','back5','forward5','zoom','speed','monitor','speakerSettings','loop','undo','redo',
  'save','submit','issues','addSegment','segmentRows','speakerFilter','textSearch','diffToggle','export','importTranscript',
  'v2CaptionPanel','v2CaptionFlow','v2SlideView','v2SlideReplay','v2InlineToolbar','v2InlineNST','v2CheckQuality',
  'v2ReportAudio','v2PreflightDialog','recoveryDialog','v2CBRulesDialog','hotkeyDialog'];
 const added=['v2cbWorkbar','v2cbReplay3','v2cbBookmark','v2cbFindOpen','v2cbAssistOpen','v2cbWordCount',
  'v2cbTextSmaller','v2cbTextBigger','v2cbScrollMode','v2cbTranscriptHeight','v2cbDimInactive',
  'v2cbFindbar','v2cbFindText','v2cbFindNext','v2cbReplaceCurrent','v2cbDockPlay','v2cbDockSubmit',
  'v2cbDockSeek','v2cbAssist','v2cbAssistBody','v2cbAssistClose','v2cbAssistCheck'];
 for(const id of [...core,...added])assert.ok(known.has(id),'Missing control: '+id);
});
test('Existing editor scripts and new assets remain linked',()=>{
 for(const name of ['transcription-editor.js','transcription-v2-follow.js','transcription-v2-clean.js',
  'transcription-v2-pro.js','transcription-v2-project-guidelines.js','transcription-v2-cb-ux.js',
  'transcription-v2-cb-ux.css'])assert.ok(html.includes('/'+name),name+' missing from CB entry');
});
test('New scripts parse, styles are balanced and element selectors exist',()=>{
 const js=src('transcription-v2-cb-ux.js'),follow=src('transcription-v2-follow.js'),css=src('transcription-v2-cb-ux.css');
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.doesNotThrow(()=>new vm.Script(follow));
 assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
 const dynamic=new Set(['v2cbFeedback']);
 for(const match of js.matchAll(/\$\('([^']+)'\)/g)){
  assert.ok(known.has(match[1])||dynamic.has(match[1]),'Missing UI ID: '+match[1]);
 }
});
test('Existing save, segment, review and recovery pathways remain present',()=>{
 const core=src('transcription-editor.js');
 for(const term of ['tx_save','tx_open','tx_submit','function rowAction','function addSegment',
  'function save()','function checkpoint()','recoveryDialog','beforeunload','window.txV2Snapshot','window.txV2SeekTo'])
  assert.ok(core.includes(term),'Missing core behavior: '+term);
 assert.ok(core.includes("classList.contains('v2cb-assist-open')"),'Native shortcuts must not intercept tools dialog');
});
test('CB additions reuse the existing editing and submission handlers',()=>{
 const js=src('transcription-v2-cb-ux.js');
 for(const value of ["trigger('play')","trigger('submit')","trigger('v2CheckQuality')",
  "function doRowAction","textarea.dispatchEvent(new Event('input'","window.txV2Snapshot"])
  assert.ok(js.includes(value),'Missing original-handler delegation: '+value);
 assert.ok(!js.includes('db.rpc('),'UI layer must not introduce parallel transcript write requests');
 assert.ok(src('transcription-v2-follow.js').includes('window.txV2CBScrollBehavior'));
 assert.ok(src('transcription-v2-cb-ux.css').includes('v2-slide-show-all .v2-caption-flow'));
});


test('Listening progress uses actual played media ranges and server-confirmed completion',()=>{
 const js=src('transcription-v2-listening.js');
 const css=src('transcription-v2-listening.css');
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
 assert.ok(js.includes('audio.played'),'A seek-only progress bar is not acceptable');
 assert.ok(js.includes("tx_listening_state")&&js.includes("tx_listening_record"),'Progress must be stored on server');
 assert.ok(js.includes('window.txV2ListeningReady'),'Completion must be server-confirmed');
 assert.ok(js.includes('s.mode')&&js.includes("contributor"),'Only contributor submissions should be gated');
 assert.ok(html.includes('id="v2cbListenMeter"'),'Thin listening meter missing');
 assert.ok(html.includes('/transcription-v2-listening.js?v=1'),'Listening script not loaded');
 assert.ok(html.includes('/transcription-v2-listening.css?v=1'),'Listening styles not loaded');
});
test('Original submission flow checks listening coverage but preserves reviewers',()=>{
 const core=src('transcription-editor.js');
 assert.ok(core.includes("data?.mode==='contributor'"),'Reviewers/admins must be exempt');
 assert.ok(core.includes('window.txV2RefreshSubmitButtons=buttons'),'Submit buttons should refresh when coverage verified');
 assert.ok(core.includes('window.txV2ListeningReady!==true'),'Must be gated until verified completion');
 assert.ok(core.includes("const r=await rpc('tx_submit'"),'Existing submission RPC should not be replaced');
});
