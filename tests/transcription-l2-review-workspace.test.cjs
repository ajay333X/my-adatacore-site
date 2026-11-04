const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const source=read('workspace-project-groups.js');
const html=read('workspace.html');
const entry=read('workspace-entry.html');

test('L2-only transcription membership always creates a dashboard review group',()=>{
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.ok(source.includes("p.can_review_l2===true||p.active_review_item_id"));
 assert.ok(source.includes("kind:'transcription-review'"));
 assert.ok(source.includes("reviews.filter(g=>g.hasAccess||g.activeReview)"));
 assert.ok(source.includes("Waiting for eligible reviews"));
 assert.ok(source.includes("L2 access active · No eligible transcripts yet"));
});

test('L2 self-claim is only available for eligible queue or resumed reviews',()=>{
 assert.ok(source.includes("data-tx-review-project="));
 assert.ok(source.includes("!active&&!available?'disabled':''"));
 assert.ok(source.includes("tx_claim_review_next"));
 assert.ok(source.includes("if(!data?.item_id)throw Error"));
 assert.ok(source.includes("id===93?'/transcription-v2':'/transcription'"));
});

test('Transcription V2 L1 and L2 task routes remain distinct without duplicate task cards',()=>{
 assert.ok(source.includes("t.layer==='L1'||(t.layer==='L2'"));
 assert.ok(source.includes("txProjects.some(p=>Number(p.project_id)"));
 assert.ok(source.includes("Number(b.dataset.txProject)===93?'/transcription-v2'"));
 assert.ok(source.includes("Number(b.dataset.transcriptionProject)===93?'/transcription-v2'"));
});

test('New dashboard script is loaded from both contributor entry points',()=>{
 assert.ok(html.includes('/workspace-project-groups.js?v=7'));
 assert.ok(entry.includes('/workspace-project-groups.js?v=7'));
});
