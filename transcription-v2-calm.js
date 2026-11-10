(()=>{
'use strict';
// Compact transcription presentation only. These nodes remain in the DOM so
// data loading, autosave, permissions and submission logic remain unchanged.
const root=document.body;
if(!root?.classList.contains('tx-v2-editor')||root.dataset.calmUiMounted)return;
root.dataset.calmUiMounted='2';
root.classList.add('txr-polished','txr-focused-workspace');

// The project and save status already live in the global header. Avoid
// duplicating them in a second WORKSPACE / TRANSCRIPTION hero and QA banner.
const intro=document.querySelector('.v2-editor-intro');
if(intro)intro.setAttribute('aria-hidden','true');

// Instructions remain available through the real project Guidelines button.
const duplicatedInstructions=document.getElementById('v2cbTaskInstructions');
if(duplicatedInstructions){
 duplicatedInstructions.open=false;
 duplicatedInstructions.setAttribute('aria-hidden','true');
}

// Preserve the AI reference button, whose own handler loads the actual AI
// original, in the editor's existing More tools popup. Hide only the
// redundant always-visible AI status panel.
const extras=document.querySelector('.editor-tools .v2-extra-menu');
const originalButton=document.getElementById('aiOriginal');
if(extras&&originalButton&&!extras.contains(originalButton)){
 extras.appendChild(originalButton);
}
const aiBar=document.querySelector('.v2-ai-bar');
if(aiBar)aiBar.setAttribute('aria-hidden','true');

// Bring meaningful actions into the audio header and remove the otherwise
// empty standalone "workspace tools" band.
const waveform=document.querySelector('.v2-wave-card');
const head=waveform?.querySelector('.v2-pane-head');
const actions=document.querySelector('#v2cbWorkbar .v2cb-workbar-actions');
if(head&&actions){
 actions.classList.add('txr-timeline-actions');
 // These shortcuts remain usable from More tools, not the primary toolbar.
 if(extras){
  ['v2cbReplay3','v2cbBookmark','v2cbCommandOpen'].forEach(id=>{
   const element=document.getElementById(id);
   if(element&&!extras.contains(element))extras.appendChild(element);
  });
 }
 actions.setAttribute('aria-label','Audio timeline actions');
 head.append(actions);
}
const workbar=document.getElementById('v2cbWorkbar');
if(workbar)workbar.setAttribute('aria-hidden','true');

if(waveform)waveform.setAttribute('data-layout','audio-timeline');
const transcript=document.querySelector('.v2-transcript-card');
if(transcript)transcript.setAttribute('data-layout','transcript-editor');
const diff=document.getElementById('v2ReviewDiffOpen');
if(diff){
 diff.title='Compare your transcript against the AI source, or L1 against L2 review.';
 diff.setAttribute('aria-haspopup','dialog');
}
})();