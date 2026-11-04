const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=src('transcription-v2.html');
const editor=src('transcription-editor.js');
const diff=src('transcription-v2-review.js');
const inbox=src('workspace-review-inbox.js');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const known=new Set(ids);

test('Existing transcription editor controls remain and new Feedback/Diff options are unique',()=>{
 assert.equal(ids.length,known.size,'No duplicate editor element IDs');
 for(const id of ['audio','play','save','submit','confirmSubmit','feedback','reviewDialog','decision',
  'segmentRows','v2CaptionFlow','v2cbListenGate','v2cbJumpGap','v2CBRulesOpen',
  'v2ReviewFeedbackOpen','v2ReviewDiffOpen','v2ReviewRatings','v2ReviewDetailDialog',
  'v2ReviewSelect','v2DiffBasis','v2ReviewScoreSummary','v2ReviewWrittenFeedback',
  'v2ReviewDiffRows','v2ReviewDetailClose','v2ReviewDetailDone']){
   assert.ok(known.has(id),'Missing '+id);
 }
 assert.ok(html.includes('/transcription-v2-review.js?v=1'));
 assert.ok(html.includes('/transcription-v2-review.css?v=1'));
 assert.ok(html.includes('/transcription-editor.js?v=9'));
});
test('Review form has category ratings and optional text, without losing original review decisions',()=>{
 for(const kind of ['accuracy','timing','tags','formatting','overall']){
  assert.ok(html.includes('data-review-rating="'+kind+'"'),'Missing rating '+kind);
 }
 assert.ok(html.includes('value="request_changes"'));
 assert.ok(html.includes('value="approve"'));
 assert.ok(html.includes('id="reviewMessage"'));
 assert.ok(diff.includes('window.txV2ReviewRatings'));
 assert.ok(diff.includes('Please select all five quality ratings'));
});
test('Existing L1 submission still uses original verified backend submission function',()=>{
 assert.ok(editor.includes("rpc('tx_submit',{p_item:itemId"));
 assert.ok(editor.includes("rpc('tx_review_submit',{p_item:itemId"));
 assert.ok(editor.includes('window.txV2ListeningReady!==true'));
 assert.ok(editor.includes('LISTEN_REQUIRED')||editor.includes('Listen to the full recording'));
 assert.ok(editor.includes('window.dispatchEvent(new CustomEvent(\'txv2:review-submitted\''));
});
test('Diff always shows immutable L1 version beside current or recorded L2 changes',()=>{
 assert.doesNotThrow(()=>new vm.Script(diff));
 for(const k of ['tx_review_detail','detail.original_segments','r.before_segments',
  'r.after_segments','window.txV2Snapshot','v2review-added','v2review-removed',
  "basis.value==='review'","time(row.start)"]){
   assert.ok(diff.includes(k),'Missing diff feature '+k);
 }
 assert.ok(diff.includes('textContent=String(text)')||diff.includes('el.textContent=String(text)'));
 assert.ok(!diff.includes('.innerHTML'),'Review content must use safe text nodes');
 assert.ok(diff.includes("tx_mark_review_seen"));
 assert.ok(diff.includes('is_original_contributor'),'Only contributor should mark review read');
});
test('L1 dashboard receives reviewer feedback and offers direct review/diff link',()=>{
 assert.doesNotThrow(()=>new vm.Script(inbox));
 for(const feature of ['tx_my_review_feedback','View feedback & diff','New feedback',
 'txfbOverview','txfbAssignments','reviewed_at','history_id','30']){
  assert.ok(inbox.includes(feature),'Missing dashboard feedback '+feature);
 }
 assert.ok(src('workspace.html').includes('/workspace-review-inbox.js?v=1'));
 assert.ok(src('workspace-entry.html').includes('/workspace-review-inbox.js?v=1'));
 assert.ok(src('workspace.html').includes('/workspace-review-inbox.css?v=1'));
 assert.ok(!inbox.includes('.innerHTML'),'Never render submitted feedback as unescaped HTML');
});
test('All levels retain waveform and inline diff, and reviewer gets a direct form',()=>{
 assert.ok(html.includes('id="diffToggle"'));
 assert.ok(html.includes('id="historyBtn"'));
 assert.ok(html.includes('id="v2ReviewDiffOpen"'));
 assert.ok(diff.includes("submit.onclick.call(submit)"));
 assert.ok(diff.includes("L2 quality review"));
 assert.ok(editor.includes("m==='reviewer'")||editor.includes("data.mode==='reviewer'"));
});
test('Review presentation is responsive and respects reduced motion',()=>{
 for(const file of ['transcription-v2-review.css','workspace-review-inbox.css']){
  const css=src(file);
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'Balanced CSS '+file);
  assert.ok(css.includes('prefers-reduced-motion'),file);
 }
 const css=src('transcription-v2-review.css');
 assert.ok(css.includes('grid-template-columns:1fr'));
 for(const name of ['v2ReviewFeedbackOpen','v2ReviewDiffOpen','v2ReviewRatings',
   'v2ReviewDetailDialog','v2ReviewScoreSummary','v2ReviewDiffRows']){
   assert.ok(css.includes(name),'Missing style for '+name);
 }
 for(const id of diff.split("$('").slice(1).map(x=>x.split("'")[0])){
  assert.ok(known.has(id),'Review script references missing element '+id);
 }
});
