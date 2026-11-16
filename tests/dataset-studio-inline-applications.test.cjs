const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('audio-dataset-studio.html','utf8');
const main = fs.readFileSync('audio-dataset-studio.js','utf8');
const inline = fs.readFileSync('audio-dataset-applications-inline.js','utf8');
const edge = fs.readFileSync('supabase/functions/dataset-applicant-import/index.ts','utf8');

test('application audio can be reviewed inside the existing Studio page',()=>{
 assert.match(html,/data-tab="applications"/);
 assert.match(html,/id="view-applications"/);
 assert.match(html,/audio-dataset-applications-inline\.js/);
 assert.match(html,/id="dsAppDetail"/);
 assert.doesNotMatch(html,/<a class="ds-tab" href="\/admin\/audio-dataset-applications"/);
});
test('the source collector and original clip editor remain available',()=>{
 for (const route of ['sources','editor','library','overview','applications']) {
  assert.match(html,new RegExp('data-tab="'+route+'"'));
 }
 assert.match(main,/async openImportedSource\(id\)/);
 assert.match(main,/await selectSource\(source\.id\)/);
 assert.match(main,/switchTab\('editor'\)/);
});
test('applicant audio is fetched through existing protected application review RPCs',()=>{
 assert.match(inline,/admin_application_queue_v2/);
 assert.match(inline,/admin_application_detail/);
 assert.match(inline,/createSignedUrl\(app\.recording_path/);
 assert.match(inline,/get_my_admin_access/);
 assert.match(inline,/is_super_admin/);
});
test('pulling audio requires separate explicit consent and a selected decision',()=>{
 assert.match(inline,/payload\.decision!=='selected'/);
 assert.match(inline,/payload\.explicit_consent_confirmed/);
 assert.match(inline,/payload\.consent_evidence\.length<12/);
 assert.match(edge,/review\.decision!==["']selected["']/);
 assert.match(edge,/review\.explicit_consent_confirmed!==true/);
 assert.match(edge,/consent_evidence/);
});
test('pulling a recording opens the existing clip workflow without touching hiring',()=>{
 assert.match(inline,/dataset-applicant-import/);
 assert.match(inline,/await openImported\(sourceId\)/);
 assert.match(inline,/openImportedSource\(id\)/);
 assert.doesNotMatch(inline,/admin_application_decide|update\(\{status:\s*["']approved/);
 assert.doesNotMatch(edge,/\.from\(["']contributor_applications["']\)\.update/);
});
test('dedicated scripts parse as JavaScript',()=>{
 assert.doesNotThrow(()=>new Function(main));
 assert.doesNotThrow(()=>new Function(inline));
});
