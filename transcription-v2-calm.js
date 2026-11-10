(()=>{
'use strict';
// Presentation only. Existing IDs, event handlers, audio transport and task
// submission remain in their original modules.
const root=document.body;
if(!root?.classList.contains('tx-v2-editor')||root.dataset.calmUiMounted)return;
root.dataset.calmUiMounted='1';root.classList.add('txr-polished');
const ai=document.querySelector('.v2-ai-bar');
if(ai&&!ai.closest('.txr-source')){
 const details=document.createElement('details');
 details.className='txr-source';
 details.id='txrOriginalSource';
 const summary=document.createElement('summary');
 summary.textContent='Original AI script';
 summary.title='View the read-only AI source used as the starting point for transcription';
 const note=document.createElement('span');
 note.style.cssText='font-size:10px;font-weight:500;color:#94a2af;margin-left:2px';
 note.textContent='Read-only source';
 summary.append(note);
 ai.before(details);
 details.append(summary,ai);
}
const instructions=document.querySelector('#v2cbTaskInstructions>summary');
if(instructions){
 // Keep the original instructions content and click behavior.
 for(const node of instructions.childNodes){
  if(node.nodeType===Node.TEXT_NODE&&node.textContent.includes('Task instructions')){
   node.textContent=node.textContent.replace('Task instructions','Script context & instructions');
   break;
  }
 }
}
const diff=document.getElementById('v2ReviewDiffOpen');
if(diff){
 diff.title='See exactly what changed in the transcription. L1: AI source vs your edits; L2: submitted L1 vs reviewer edits.';
 diff.setAttribute('aria-haspopup','dialog');
}
const card=document.querySelector('.v2-wave-card');
if(card)card.setAttribute('data-layout','audio-timeline');
const transcript=document.querySelector('.v2-transcript-card');
if(transcript)transcript.setAttribute('data-layout','transcript-editor');
})();