// Regression guard for Transcription Lab V2 admin and CB editor enhancements.
// Run with: node --test tests/transcription-v2-regression.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const ids=html=>[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const criticalAdmin=[
 'projectList','projectName','settingsLink','audioRows','statusFilter','search',
 'newProject','assign','sourceDialog','uploadDialog','aiGenerate','aiSaveSettings',
 'queueRefresh','queueArchiveSelected','queueDeleteSelected','v2CaptionsDialog',
 'v2opsDrawer','v2opsDrawerEditor','v2opsQaList','v2opsPeopleList','v2opsReportsList',
 'v2opsRulesSave','v2opsAdvancedFilters','v2opsCards'
];
const criticalCB=[
 'audio','segmentRows','v2CaptionFlow','v2SlideView','v2SlideEditor','saveState',
 'addSegment','play','undo','redo','submit','v2InlineToolbar',
 'v2CBRulesOpen','v2CBRulesDialog','v2CBRulesBody'
];
test('All critical controls stay present and IDs are unique',()=>{
 for(const [filename,required] of [['transcription-lab-v2.html',criticalAdmin],['transcription-v2.html',criticalCB]]){
  const html=read(filename),all=ids(html),set=new Set(all);
  assert.equal(all.length,set.size,filename+' has duplicate HTML IDs');
  for(const id of required)assert.ok(set.has(id),filename+' missing '+id);
 }
});
test('V2 project page keeps its existing controllers and adds independent operations',()=>{
 const html=read('transcription-lab-v2.html');
 for(const script of ['transcription-lab-v2-core.js','transcription-queue-priority.js','transcription-admin-flow.js','transcription-lab-dashboard.js','transcription-lab-v2-experience.js','transcription-lab-v2-captions.js','transcription-lab-v2-operations.js','transcription-lab-v2-center.js'])assert.ok(html.includes('/'+script),script);
 for(const tab of ['overview','queue','qa','people','reports','intake','rules'])assert.ok(html.includes('data-tx-tab="'+tab+'"'));
 const backend=read('transcription-lab-v2-core.js');
 for(const operation of ['tx_get_lab','tx_assign','tx_v2_import_sources','tx_register_upload','tx_ai_enqueue'])assert.ok(backend.includes(operation),operation);
});
test('Contributor editor remains available with current audio and save controls',()=>{
 const html=read('transcription-v2.html');
 for(const script of ['transcription-editor.js','transcription-v2-follow.js','transcription-v2-pro.js','transcription-v2-project-guidelines.js'])assert.ok(html.includes('/'+script),script);
 const core=read('transcription-editor.js');
 for(const term of ['tx_open','txV2Snapshot','txV2SeekTo','createSignedUrl','renderAll()'])assert.ok(core.includes(term),term);
});
test('New client scripts parse and references are connected to markup',()=>{
 const pairs=[
  ['transcription-lab-v2-center.js','transcription-lab-v2.html'],
  ['transcription-v2-project-guidelines.js','transcription-v2.html']
 ];
 for(const [file,htmlFile] of pairs){
  const js=read(file),html=read(htmlFile),known=new Set(ids(html));
  assert.doesNotThrow(()=>new vm.Script(js,{filename:file}));
  // The overview metric chooser is created on demand in JavaScript.
  const dynamicIds=new Set(['v2opsMetricChooser']);
  for(const m of js.matchAll(/\$\('([^']+)'\)/g)){
   assert.ok(known.has(m[1])||dynamicIds.has(m[1]),file+' references missing '+m[1]);
  }
 }
});
test('New layout styles are balanced and loaded after previous styles',()=>{
 for(const [filename,htmlFilename] of [
  ['transcription-lab-v2-center.css','transcription-lab-v2.html'],
  ['transcription-v2-project-guidelines.css','transcription-v2.html']
 ]){
  const css=read(filename);
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,filename+' has unbalanced braces');
  assert.ok(read(htmlFilename).includes('/'+filename));
 }
});
