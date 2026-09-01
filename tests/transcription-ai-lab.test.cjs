const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),pause=()=>new Promise(r=>setTimeout(r,20));
(async()=>{
 const calls=[],errors=[],v=new VirtualConsole();v.on('jsdomError',e=>errors.push(e.message));
 const items=[{id:'audio-id',display_name:'audio.wav',source_project_title:'Recorded project',source_folder:'folder',duration_seconds:10,status:'unassigned'}];
 let ai={jobs:[],auto_draft:false,language:'',connection:{status:'ready',finished_at:new Date().toISOString()}};
 const dom=new JSDOM(fs.readFileSync(path.join(root,'transcription-lab.html'),'utf8'),{url:'https://www.adatacore.com/admin/transcription',runScripts:'outside-only',virtualConsole:v});
 const w=dom.window,$=id=>w.document.getElementById(id);
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};
 w.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'admin'}}})},rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='tx_get_lab')return{data:{projects:[{id:99,name:'Transcription',description:'Test',status:'active',count:items.length}],items,people:[]}};
  if(name==='tx_ai_lab')return{data:structuredClone(ai)};
  if(name==='tx_ai_settings'){ai.auto_draft=args.p_enabled;ai.language=args.p_language;return{data:null}}
  if(name==='tx_ai_enqueue'){ai.jobs=[{audio_item_id:'audio-id',status:'queued'}];return{data:{added:1,skipped:0}}}
  if(name==='tx_ai_cancel'){ai.jobs=[{audio_item_id:'audio-id',status:'cancelled'}];return{data:1}}
  throw Error('Unexpected RPC '+name);
 }})};
 w.eval(fs.readFileSync(path.join(root,'transcription-lab.js'),'utf8'));await pause();
 assert.equal($('projectName').textContent,'Transcription');assert.equal($('aiAuto').checked,false);assert.equal($('aiGenerate').disabled,true);
 $('aiAuto').checked=true;$('aiLanguage').value='hi';$('aiSaveSettings').click();await pause();
 assert.equal(ai.auto_draft,true);assert.equal(ai.language,'hi');assert.equal(calls.filter(c=>c.name==='tx_ai_enqueue').length,0,'Enabling auto must not queue existing files');
 const box=w.document.querySelector('[data-item]');box.checked=true;box.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal($('aiGenerate').disabled,false);
 $('aiGenerate').click();assert.ok($('aiGenerateDialog').open);assert.equal($('aiRegenerate').checked,false);$('aiGenerateConfirm').click();await pause();
 assert.deepEqual(Array.from(calls.find(c=>c.name==='tx_ai_enqueue').args.p_items),['audio-id']);assert.match($('audioRows').textContent,/queued/);
 $('aiCancel').click();await pause();assert.match($('audioRows').textContent,/cancelled/);
 assert.deepEqual(errors,[]);dom.window.close();console.log('AI Lab: saved settings, opt-in generation, status and cancellation passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
