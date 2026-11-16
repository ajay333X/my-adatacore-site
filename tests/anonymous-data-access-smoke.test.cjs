// Anonymous-only read checks. Never authenticate, create users, or mutate tasks.
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('workspace-entry.html','utf8');
const key=html.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];
assert.ok(key,'Expected public client key in workspace entry');
const origin='https://llmhyezgcnbognmmsnzq.supabase.co';
async function request(route,{method='GET',body}={}){
  const result=await fetch(origin+route,{
    method,
    headers:{apikey:key,...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.timeout(12000)
  });
  // No response bodies are ever printed; guard against accidental PII in CI.
  return {status:result.status,content:await result.text()};
}
test('anonymous callers cannot enumerate contributor, task, project or submission rows',async()=>{
  for(const table of ['users','tasks','project_lab','submissions','project_access_controls']){
    const column=table==='project_access_controls'?'user_id':'id';
    const r=await request('/rest/v1/'+table+'?select='+column+'&limit=1');
    assert.ok([200,401,403,404].includes(r.status),table+' returned unexpected HTTP '+r.status);
    if(r.status===200) {
      let parsed;
      try {parsed=JSON.parse(r.content)}catch {throw new Error(table+' response is not JSON')}
      assert.ok(Array.isArray(parsed)&&parsed.length===0,table+' exposed rows to an anonymous caller');
    }
  }
},{timeout:90000});
test('anonymous RPC access to privileged audio reviewer check is denied',async()=>{
  const r=await request('/rest/v1/rpc/can_review_application_audio',{method:'POST',body:{}});
  assert.ok([401,403,404].includes(r.status),
    'Audio reviewer RPC should not be anonymously callable, got HTTP '+r.status);
},{timeout:20000});
