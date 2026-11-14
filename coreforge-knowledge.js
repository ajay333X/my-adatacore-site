/* CoreForge local-only retrieval prototype.
   No documents are uploaded, persisted, or shared with a server. Not a multi-tenant production RAG service. */
(function(global){
'use strict';
const STOP=new Set('the a an and or to of is are be what can you i we my for in on from at this that with about do does how please tell me your kya hai ki ka ke ko se aur mein main mujhe mujko mera mere हमारे अपना आप क्या कैसे कितना है हैं मुझे बताओ की का के में और से कृपया'.split(/\s+/));
function words(input){
 return (String(input||'').toLowerCase().match(/[\p{L}\p{N}₹]+/gu)||[]).filter(x=>x.length>1&&!STOP.has(x));
}
function chunks(text,label){
 const value=String(text||'').replace(/\s+/g,' ').trim().slice(0,120000);
 const out=[];let start=0;
 while(start<value.length&&out.length<180){
  const end=Math.min(value.length,start+850);
  out.push({id:label+'-'+(out.length+1),label,text:value.slice(start,end)});
  if(end===value.length)break;
  start=end-100;
 }
 return out;
}
function search(question,documents,limit=3){
 const terms=words(question);if(!terms.length)return [];
 const ranked=[];
 for(const doc of documents){
  for(const chunk of chunks(doc.text,doc.label)){
   const body=chunk.text.toLowerCase();
   let matches=0;for(const t of new Set(terms))if(body.includes(t))matches++;
   if(matches)ranked.push({...chunk,score:matches/Math.max(1,new Set(terms).size)});
  }
 }
 return ranked.sort((a,b)=>b.score-a.score).slice(0,limit);
}
function contextFor(question,documents){
 const hits=search(question,documents);
 return {hits,context:hits.map(h=>'['+h.id+'] '+h.text).join('\n\n')};
}
const api={words,chunks,search,contextFor};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
global.CoreForgeKnowledge=api;
})(typeof globalThis!=='undefined'?globalThis:this);
