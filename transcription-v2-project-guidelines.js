(()=>{
'use strict';
// Read-only CB access to current, versioned project guidelines.
// Project administration is the only place where guidelines can be changed.
const $=id=>document.getElementById(id),dialog=$('v2CBRulesDialog'),open=$('v2CBRulesOpen'),body=$('v2CBRulesBody');
if(!dialog||!open||!body||!window.supabase)return;
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
let loadedFor=null,loaded=null,inFlight=null,attempts=0;
const node=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x};
const itemProject=()=>Number(window.txV2Snapshot?.()?.project_id)||null;
const fields={language:'Language',mode:'Transcript mode',punct_pause_ms:'Pause after punctuation',plain_pause_ms:'Pause without punctuation',pro:'Number / PRO rules',fl:'FL / loanwords',instructions:'Project instructions'};
const section=(heading,content)=>{const div=node('section','v2-cb-rule-section');div.append(node('h3','',heading));div.append(node('div','v2-cb-rule-value',content));body.append(div)};
const tagSection=(heading,tags)=>{
 const div=node('section','v2-cb-rule-section');div.append(node('h3','',heading));
 if(!tags.length){div.append(node('p','v2-cb-rule-empty','No approved tag list has been published for this project. Confirm with the project lead.'))}
 else{
  const list=node('div','v2-cb-rule-tags');
  for(const tag of tags.slice(0,180))list.append(node('code','',tag));
  div.append(list);
 }
 body.append(div);
};
function paint(result){
 const version=Number(result?.version)||0,r=result?.rules&&typeof result.rules==='object'?result.rules:{};
 body.replaceChildren();
 $('v2CBRulesSubtitle').textContent=version?'Current version '+version+' · Check with the recording before applying any tags.':'No project-specific guidelines published yet.';
 if(!version){
  body.append(node('p','v2-cb-rule-empty','The project has not published its transcription instructions here. Continue following the project’s existing Style Guide and Tag Taxonomy.'));return;
 }
 const grid=node('div','v2-cb-rule-grid');
 for(const k of ['language','mode','punct_pause_ms','plain_pause_ms']){
  const row=node('div','v2-cb-rule-summary');row.append(node('small','',fields[k]));
  let value=r[k]??'—';if(k.endsWith('_ms')&&value!=='—')value=Number(value)/1000+' seconds';
  row.append(node('strong','',value));grid.append(row);
 }
 body.append(grid);
 for(const k of ['pro','fl','instructions'])if(String(r[k]||'').trim())section(fields[k],String(r[k]));
 tagSection('Approved non-speech tags',Array.isArray(r.nst)?r.nst:[]);
 tagSection('Approved style tags',Array.isArray(r.style)?r.style:[]);
 body.append(node('p','v2-cb-rule-footer','Guidelines are configured by project administrators. Tags must match audible performance; tags cannot be inferred from script meaning alone.'));
}
async function fetchRules(force=false){
 const projectId=itemProject();if(!projectId)return;
 if(!force&&loadedFor===projectId&&loaded)return loaded;
 if(inFlight)return inFlight;
 inFlight=(async()=>{
  try{
   const {data,error}=await db.rpc('tx_v2_get_project_guidelines',{p_project_id:projectId});
   if(error)throw Error(error.message);
   if(projectId!==itemProject())return;
   loadedFor=projectId;loaded=data;
   const rules=data?.rules&&typeof data.rules==='object'?data.rules:{};
   window.txV2ProjectRules={...rules};
   paint(data);
   return data;
  }catch(e){
   $('v2CBRulesSubtitle').textContent='Guidelines could not be loaded.';
   body.replaceChildren(node('p','v2-cb-rule-empty','Unable to load published guidelines: '+e.message));
  }finally{inFlight=null}
 })();
 return inFlight;
}
open.addEventListener('click',()=>{
 if(!dialog.open)dialog.showModal();
 if(!loaded)body.replaceChildren(node('p','v2-cb-rule-empty','Loading current project guidelines…'));
 fetchRules(true);
});
for(const id of ['v2CBRulesClose','v2CBRulesCloseFoot'])$(id).addEventListener('click',()=>dialog.close());
// Load once after the existing transcription editor has successfully opened its item.
const timer=setInterval(()=>{
 attempts++;
 if(itemProject()){clearInterval(timer);fetchRules()}
 else if(attempts>100)clearInterval(timer);
},400);
})();
