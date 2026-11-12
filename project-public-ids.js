(()=>{
'use strict';
if(window.__adatacorePublicProjectIds)return;
window.__adatacorePublicProjectIds=true;
const URL='https://llmhyezgcnbognmmsnzq.supabase.co';
const KEY='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const ids=new Map();
const codeFormat=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const codeMatch=/\bProject\s*(?:#\s*|(?:ID|No\.?)\s*:?\s*|(?=\d))(\d{1,6})(?!\d)/gi;
const skip='script,style,noscript,textarea,input,select,option,pre,code,[contenteditable="true"],[data-project-id-raw]';
let observer=null,scheduled=false,loadAttempts=0;
const queued=new Set();
function getCode(id){return ids.get(Number(id))||''}
function replace(s){
 if(!/\bproject\b/i.test(s))return s;
 return s.replace(codeMatch,(full,id)=>{
  const code=getCode(id);
  return code?'Project · '+code:full;
 });
}
function rewriteNode(node){
 if(!node?.isConnected)return;
 if(node.nodeType===Node.TEXT_NODE){
  const parent=node.parentElement;
  if(!parent||parent.closest(skip))return;
  const before=node.nodeValue||'',after=replace(before);
  if(after!==before)node.nodeValue=after;
  return;
 }
 if(node.nodeType!==Node.ELEMENT_NODE)return;
 if(node.matches(skip)||node.closest(skip))return;
 const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
 let current;
 while((current=walker.nextNode())){
  if(current.parentElement?.closest(skip))continue;
  const before=current.nodeValue||'',after=replace(before);
  if(before!==after)current.nodeValue=after;
 }
}
function queue(node){
 if(!node)return;
 queued.add(node);
 if(!scheduled){scheduled=true;requestAnimationFrame(flush)}
}
function flush(){
 scheduled=false;
 const work=[...queued];queued.clear();
 for(const node of work)rewriteNode(node);
}
const style=document.createElement('style');
style.id='ac-project-code-design';
style.textContent='.ac-project-code-tag{display:inline-block;max-width:100%;font:700 10px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.005em;overflow-wrap:anywhere;color:#366c72;background:#eaf5f3;text-transform:none!important;border:1px solid #d4e8e5;border-radius:8px;padding:5px 9px;user-select:all}' +
'.project-stock-meta,.lab-sub,#topSub{overflow-wrap:anywhere}' +
'#acProjectPublicCode{font-variant-numeric:tabular-nums}' +
'.ac-ui-code{overflow-wrap:anywhere;letter-spacing:.015em}';
document.head.append(style);
async function load(){
 if(!window.supabase?.createClient){if(++loadAttempts<30)setTimeout(load,300);return}
 const db=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
 const {data:{user},error:userError}=await db.auth.getUser();
 if(userError||!user)return;
 const {data,error}=await db.from('project_lab').select('id,project_code');
 if(error||!Array.isArray(data)){console.warn('Could not load public project codes');return}
 for(const row of data)if(codeFormat.test(row.project_code||''))ids.set(Number(row.id),row.project_code);
 if(!ids.size)return;
 window.AdProjectCodes={get:getCode,all:()=>new Map(ids),format:replace};
 rewriteNode(document.body);
 observer=new MutationObserver(records=>{
  for(const record of records){
   if(record.type==='characterData'){queue(record.target);continue}
   for(const node of record.addedNodes){if(node.nodeType===Node.TEXT_NODE||node.nodeType===Node.ELEMENT_NODE)queue(node)}
  }
 });
 observer.observe(document.body,{childList:true,characterData:true,subtree:true});
 document.dispatchEvent(new CustomEvent('adatacore:project-codes-ready',{detail:{count:ids.size}}));
}
load().catch(e=>console.warn('Public project code display is unavailable',e?.message||e));
})();