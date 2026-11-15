const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const entry=fs.readFileSync('workspace.html','utf8');
const v2=fs.readFileSync('workspace-v2.js','utf8');
const css=fs.readFileSync('workspace-v2.css','utf8');
const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
test('classic workspace stays the default and opt-in v2 is a separate route',()=>{
 assert.match(v2,/location\.pathname\.replace\(\/\\\/\$\/,''\)==='\/workspace-v2'/);
 assert.match(v2,/\(v2\?'\/workspace-v2':'\/workspace'\)/);
 assert.ok(config.rewrites.some(x=>x.source==='/workspace-v2'&&x.destination==='/workspace'));
 assert.ok(config.headers.some(h=>h.source==='/workspace-v2'&&h.headers.some(v=>v.key==='Cache-Control'&&v.value.includes('no-store'))));
});
test('new interface reuses protected workspace core, task actions and review functions',()=>{
 assert.match(entry,/fetch\('\/workspace-core'/);
 assert.match(entry,/get_contributor_workspace/);
 assert.match(entry,/workspace-v2\.js/);
 assert.match(entry,/workspace-v2\.css/);
 assert.match(v2,/\.task-open/);
 assert.match(v2,/task\.click\(\)/);
 assert.doesNotMatch(v2,/db\.from\(|supabase\.createClient|db\.rpc\(/);
});
test('sandbox and current project parameters are retained when toggling',()=>{
 assert.match(v2,/\['test_session','impersonation','project'\]/);
 assert.match(entry,/validSandbox\?sandboxAddon\+hubAddon/);
 assert.match(entry,/validImpersonation\?'':'/);
});
test('v2 styling requires an opt-in root class and keeps classic fallback',()=>{
 assert.match(v2,/classList\.add\('ac-workspace-v2'\)/);
 assert.match(css,/html\.ac-workspace-v2/);
 assert.match(v2,/Classic workspace/);
 assert.match(v2,/Try Workspace 2\.0/);
 assert.match(v2,/No new task is claimed by the dashboard/);
});
