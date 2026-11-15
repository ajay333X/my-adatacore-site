/* Shared Duo script presentation. Text is never parsed as HTML. */
(function(root){
'use strict';
const speakers={
 agent:/^\s*(?:agent|support(?:\s+agent)?|representative|एजेंट|एजेंट्|प्रतिनिधि|सहायक)\s*[:：\-–]\s*/iu,
 customer:/^\s*(?:customer|client|caller|ग्राहक|कस्टमर|उपभोक्ता)\s*[:：\-–]\s*/iu
};
function scriptLines(text){
 const raw=String(text||'').split(/\r?\n/),result=[];
 let current=null;
 for(const line of raw){
  if(!line.trim()){if(result.length)result.push({role:null,text:'',blank:true});continue}
  const found=Object.entries(speakers).find(([,rx])=>rx.test(line));
  if(found){current=found[0];result.push({role:current,text:line.replace(found[1],'').trim(),blank:false})}
  else result.push({role:current,text:line.trim(),blank:false,continuation:current!==null});
 }
 return result;
}
function roleFor(session,userId){
 if(!session||!userId)return null;
 if(session.actor_a===userId)return 'agent';
 if(session.actor_b===userId)return 'customer';
 return null;
}
function render(container,script,role){
 if(!container)return;
 container.replaceChildren();
 for(const line of scriptLines(script)){
  if(line.blank){const gap=document.createElement('div');gap.className='vs-dialog-gap';container.append(gap);continue}
  const item=document.createElement('div');item.className='vs-dialog-line';
  if(line.role===role)item.classList.add('vs-dialog-mine');
  else if(line.role)item.classList.add('vs-dialog-partner');
  else item.classList.add('vs-dialog-unassigned');
  const marker=document.createElement('span');marker.className='vs-dialog-bullet';
  marker.textContent=line.role===role?'●':line.role?'○':'·';
  marker.setAttribute('aria-hidden','true');
  const content=document.createElement('div');content.className='vs-dialog-content';
  if(!line.continuation&&line.role){
   const who=document.createElement('strong');who.className='vs-dialog-speaker';
   who.textContent=line.role==='agent'?'Agent':'Customer';
   content.append(who);
  }
  const words=document.createElement('span');words.textContent=line.text;
  content.append(words);
  item.append(marker,content);
  container.append(item);
 }
}
const api={scriptLines,roleFor,render};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.VoiceDuoScript=api;
})(typeof window!=='undefined'?window:globalThis);
