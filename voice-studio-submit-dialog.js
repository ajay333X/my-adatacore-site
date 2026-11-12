(()=>{
'use strict';
const $=id=>document.getElementById(id),modal=$('vsActionDialog');
if(!modal)return;
const title=$('vsDialogTitle'),body=$('vsDialogText'),tag=$('vsDialogLabel'),
 meta=$('vsDialogMeta'),warningBox=$('vsDialogWarnings'),status=$('vsDialogStatus'),
 primary=$('vsDialogPrimary'),cancel=$('vsDialogCancel'),symbol=$('vsDialogEmblem');
const projectUrl='/workspace?project=94';
let state='closed',activeCallback=null,redirectTimer=0;
const format=s=>String(Math.floor((Number(s)||0)/60)).padStart(2,'0')+':'+String(Math.floor((Number(s)||0)%60)).padStart(2,'0');
function goProject(){
 clearTimeout(redirectTimer);
 window.location.assign(projectUrl);
}
function reset(phase,eyebrow,heading,description){
 state=phase;modal.dataset.phase=phase;
 tag.textContent=eyebrow;title.textContent=heading;body.textContent=description;
 meta.textContent='';warningBox.replaceChildren();warningBox.hidden=true;
 status.textContent='';primary.disabled=false;cancel.disabled=false;cancel.hidden=false;
 primary.className='btn primary';symbol.textContent=phase==='success'?'✓':phase==='error'?'!':'↗';
 clearTimeout(redirectTimer);
 if(!modal.open)modal.showModal();
}
function hide(){
 if(state==='uploading')return;
 if(state==='success'){goProject();return}
 clearTimeout(redirectTimer);state='closed';activeCallback=null;
 if(modal.open)modal.close();
}
cancel.addEventListener('click',hide);
modal.addEventListener('cancel',event=>{
 if(state==='uploading'||state==='success'){
  event.preventDefault();
  if(state==='success')goProject();
 }else{state='closed';activeCallback=null;clearTimeout(redirectTimer)}
});
function success(){
 reset('success','ADATACORE · SUBMISSION COMPLETE','Your audio has been submitted!',
   'Your recording was successfully submitted. Returning you to the Voice Studio project dashboard.');
 meta.textContent='✓ Audio submission complete · Project #94';
 cancel.hidden=true;primary.textContent='Go to project dashboard';
 primary.onclick=goProject;
 status.textContent='Redirecting to the project dashboard…';
 redirectTimer=setTimeout(goProject,2600);
}
function errorScreen(error){
 reset('error','ADATACORE · UPLOAD ISSUE','Audio was not submitted',
   'The submission could not be completed. Your recording is still available here; retry without re-recording.');
 meta.textContent='Error: '+String(error?.message||error||'Unexpected upload error');
 cancel.textContent='Back to recording';
 primary.textContent='Retry submission';
 primary.onclick=submitConfirmed;
}
async function submitConfirmed(){
 if(!['confirm','error'].includes(state)||!activeCallback)return;
 const submit=activeCallback;
 state='uploading';modal.dataset.phase='uploading';
 tag.textContent='ADATACORE · SECURE SUBMISSION';
 title.textContent='Submitting your audio…';
 body.textContent='Uploading your recording securely. Keep this tab open until the upload finishes.';
 warningBox.hidden=true;status.textContent='Uploading to your Voice Studio assignment…';
 cancel.hidden=true;primary.disabled=true;primary.textContent='Submitting…';
 try{
  await submit();
  activeCallback=null;success();
 }catch(error){
  activeCallback=submit;errorScreen(error);
 }
}
function showSubmit({seconds=0,transcriptIncluded=false,warnings=[],onSubmit}={}){
 if(state==='uploading'||typeof onSubmit!=='function')return;
 activeCallback=onSubmit;
 reset('confirm','ADATACORE · VOICE STUDIO','Submit your audio?',
  'You are about to submit this recording. Review your audio before continuing. Once submitted, this take cannot be replaced.');
 meta.textContent='Recording: '+format(seconds)+' · Hindi · '+(transcriptIncluded?'Automatic transcript draft included':'Audio only');
 if(Array.isArray(warnings)&&warnings.length){
  warningBox.hidden=false;
  const heading=document.createElement('strong');heading.textContent='Quality reminders';
  const list=document.createElement('ul');
  for(const message of warnings){
   const li=document.createElement('li');li.textContent=String(message);list.append(li);
  }
  warningBox.append(heading,list);
 }
 cancel.textContent='Back to recording';
 primary.textContent='Submit audio';
 primary.onclick=submitConfirmed;
}
function showDiscard({seconds=0,onDiscard}={}){
 if(state==='uploading'||typeof onDiscard!=='function')return;
 activeCallback=null;
 reset('discard','ADATACORE · UNSUBMITTED TAKE','Discard this recording?',
  'Your recording has not been submitted yet. Leaving will permanently discard this unsent take.');
 meta.textContent='Unsubmitted audio · '+format(seconds);
 cancel.textContent='Keep recording';
 primary.textContent='Discard and leave';
 primary.className='btn danger';
 primary.onclick=()=>{
  if(state!=='discard')return;
  state='closed';
  if(modal.open)modal.close();
  void Promise.resolve(onDiscard()).catch(e=>{status.textContent=String(e?.message||e)});
 };
}
window.VoiceStudioSubmitDialog={showSubmit,showDiscard,goProject};
})();