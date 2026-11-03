(()=>{
'use strict';
// Production extension for the CB transcript workspace. All transcript changes go through
// the existing editor's input handlers, preserving autosave, undo, and submission behavior.
const $=id=>document.getElementById(id),root=document.body,rows=$('segmentRows'),flow=$('v2CaptionFlow'),audio=$('audio'),toolbar=$('v2InlineToolbar');
if(!rows||!flow||!audio||!toolbar||!window.TranscriptionModel)return;
const M=window.TranscriptionModel,params=new URLSearchParams(location.search),itemId=params.get('item');
const fmt=ms=>M.time(Math.max(0,Number(ms)||0));
const parse=s=>M.parseTime(s);
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const announce=(message,bad=false)=>{
 const status=$('v2InlineMessage');status.textContent=message;status.dataset.error=bad?'true':'false';
};
let inline=null,selectionRange=null,optionMode='',previousState=null;
const optionBox=$('v2InlineOptions');
function lineRecords(){
 return [...rows.querySelectorAll('tr[data-segment]')].map((row,i)=>{
  const field=row.querySelector('[data-field="transcript"]');
  return {id:row.dataset.segment,row,field,index:i,
   start:parse(row.querySelector('[data-field="start_ms"]')?.value),
   end:parse(row.querySelector('[data-field="end_ms"]')?.value),
   speaker:row.querySelector('[data-field="speaker_id"]')?.value||'',
   text:field?.value||''};
 }).filter(x=>x.field);
}
function rowOf(id){return lineRecords().find(x=>x.id===id)}
function refreshRows(){rows.dispatchEvent(new Event('input',{bubbles:true}))}
function syncInline(){
 if(!inline)return;
 const text=inline.node.innerText.replace(/\r/g,'');
 if(text===inline.field.value)return;
 inline.field.value=text;
 inline.field.dispatchEvent(new Event('input',{bubbles:true}));
 requestProgress();
}
function finishInline(){
 if(!inline)return;
 const previous=inline;
 syncInline();
 inline=null;selectionRange=null;
 toolbar.hidden=true;optionBox.hidden=true;optionBox.replaceChildren();
 previous.node.contentEditable='false';
 // The stable transcript renderer restores syntax highlighting after edit.
 refreshRows();
}
function startInline(id,source=null){
 const line=rowOf(id);
 if(!line)return false;
 if(line.field.readOnly||line.field.disabled){
  window.dispatchEvent(new CustomEvent('v2:goto-caption',{detail:{id}}));return false;
 }
 if(inline?.id===id){inline.node.focus();return true}
 finishInline();
 let node=source||flow.querySelector('[data-edit-segment="'+CSS.escape(id)+'"]');
 if(!node){
  window.dispatchEvent(new CustomEvent('v2:goto-caption',{detail:{id}}));
  // Rebuilding a currently blank transcript is a valid fallback, not a lost edit.
  node=flow.querySelector('[data-edit-segment="'+CSS.escape(id)+'"]');
  if(!node)return false;
 }
 const editor=document.createElement('span');
 editor.className='v2-inline-editor v2-caption-piece v2-caption-active';
 editor.contentEditable='plaintext-only';
 editor.setAttribute('role','textbox');editor.setAttribute('aria-multiline','true');
 editor.setAttribute('aria-label','Edit transcription line '+(line.index+1));
 editor.setAttribute('spellcheck','true');
 editor.dataset.editSegment=id;
 editor.textContent=line.text;
 node.replaceWith(editor);
 inline={id,field:line.field,node:editor};
 toolbar.hidden=false;announce('Select a word, then choose a tag. Verify all tags against the audio.');
 editor.addEventListener('input',syncInline);
 editor.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();finishInline()}
  if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();finishInline()}
 });
 editor.focus({preventScroll:true});
 const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);
 const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);selectionRange=range.cloneRange();
 window.dispatchEvent(new CustomEvent('v2:goto-caption',{detail:{id}}));
 return true;
}
flow.addEventListener('click',event=>{
 const button=event.target.closest('[data-edit-segment]');
 if(!button)return;
 if(button.classList.contains('v2-inline-editor'))return;
 event.preventDefault();event.stopImmediatePropagation();
 startInline(button.dataset.editSegment,button);
},true);
flow.addEventListener('keydown',event=>{
 if((event.key==='Enter'||event.key===' ')&&event.target.matches('button[data-edit-segment]')){
  event.preventDefault();event.stopImmediatePropagation();
  startInline(event.target.dataset.editSegment,event.target);
 }
},true);
document.addEventListener('selectionchange',()=>{
 if(!inline)return;
 const sel=window.getSelection();if(!sel?.rangeCount)return;
 const range=sel.getRangeAt(0);
 if(inline.node.contains(range.commonAncestorContainer))selectionRange=range.cloneRange();
});
document.addEventListener('pointerdown',e=>{
 if(!inline)return;
 if(inline.node.contains(e.target)||toolbar.contains(e.target))return;
 finishInline();
},true);
document.addEventListener('focusin',e=>{
 if(inline&&!inline.node.contains(e.target)&&!toolbar.contains(e.target))finishInline();
});
$('v2InlineDone').addEventListener('click',finishInline);
toolbar.addEventListener('pointerdown',e=>{
 if(e.target.closest('button'))e.preventDefault();
});
function storedSelection(){
 if(!inline)return null;
 const sel=window.getSelection();
 if(sel?.rangeCount){
  const r=sel.getRangeAt(0);
  if(inline.node.contains(r.commonAncestorContainer))return r.cloneRange();
 }
 if(selectionRange&&inline.node.contains(selectionRange.commonAncestorContainer))return selectionRange.cloneRange();
 const range=document.createRange();range.selectNodeContents(inline.node);range.collapse(false);
 return range;
}
function replaceSelection(text,{requireSelection=false}={}){
 if(!inline)return announce('Click a word in the paragraph to edit it first.',true);
 const range=storedSelection();
 if(!range||requireSelection&&range.collapsed)return announce('Select the relevant text first.',true);
 range.deleteContents();
 const node=document.createTextNode(text);
 range.insertNode(node);
 range.setStartAfter(node);range.collapse(true);
 const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);selectionRange=range.cloneRange();
 syncInline();
 inline.node.focus({preventScroll:true});
 announce('Tag added. Check that it matches the recording and project rules.');
 closeOptions();
}
function selectedText(){return storedSelection()?.toString()||''}
function closeOptions(){optionMode='';optionBox.hidden=true;optionBox.replaceChildren()}
function optionButton(label,cb){
 const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',cb);
 optionBox.append(b);
}
function showOptions(mode){
 if(!inline)return announce('Click a transcription line first.',true);
 if(optionMode===mode&&!optionBox.hidden){closeOptions();return}
 closeOptions();optionMode=mode;optionBox.hidden=false;
 if(mode==='nst'){
  const hint=document.createElement('small');hint.textContent='Insert only when clearly audible; check the approved project tag list.';optionBox.append(hint);
  ['[हँसी]','[हल्की-हँसी]','[दीर्घश्वास]'].forEach(tag=>optionButton(tag,()=>replaceSelection(tag+' ')));
 }else{
  const hint=document.createElement('small');
  hint.textContent=mode==='style'?'Enter an approved style tag (without brackets).': 'Write the exact Hindi pronunciation for the selected number.';
  const input=document.createElement('input');input.type='text';input.maxLength=120;
  input.placeholder=mode==='style'?'e.g. धीमी-गति':'e.g. चौदह';
  input.setAttribute('aria-label',hint.textContent);
  const save=document.createElement('button');save.type='button';save.textContent='Insert';
  const apply=()=>{
   const word=input.value.trim();
   if(!word)return announce('Enter a value before inserting.',true);
   if(mode==='style'){
    const tag=word.replace(/^<|>$/g,'');
    if(!/^[\p{L}\p{N}_ -]{1,80}$/u.test(tag))return announce('Enter a valid approved tag name.',true);
    replaceSelection('<'+tag+'> ');
   }else{
    const numeral=selectedText().trim();
    if(!/^\{?\d+(?:[.,-]\d+)*\}?$/.test(numeral))return announce('Select the numeral in the paragraph before adding PRO.',true);
    const bare=numeral.replace(/^\{|\}$/g,'');
    replaceSelection('{'+bare+'} {PRO: '+word+'}',{requireSelection:true});
   }
  };
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();apply()}});
  save.addEventListener('click',apply);
  optionBox.append(hint,input,save);
  // Preserve paragraph selection even while the option input has focus.
  const r=storedSelection();if(r)selectionRange=r.cloneRange();
  input.focus();
 }
}
$('v2InlineNST').addEventListener('click',()=>showOptions('nst'));
$('v2InlineStyle').addEventListener('click',()=>showOptions('style'));
$('v2InlinePRO').addEventListener('click',()=>showOptions('pro'));
$('v2InlineFL').addEventListener('click',()=>{
 const t=selectedText();
 if(!t.trim())return announce('Select the English word or phrase first.',true);
 replaceSelection('<विदेशी-भाषण="EN"> '+t+' </विदेशी-भाषण>',{requireSelection:true});
});
$('v2InlineEmphasis').addEventListener('click',()=>{
 const t=selectedText();const words=t.trim().split(/\s+/).filter(Boolean);
 if(words.length<1||words.length>2)return announce('Select one or two words for emphasis.',true);
 replaceSelection('*'+t+'*',{requireSelection:true});
});

// Audio tools: range looping and optional short rewind on manual resume.
// Original Play, waveform, seeking, speed, selection looping and keyboard shortcuts remain intact.
const audioTools=document.querySelector('.v2-extra-menu')||document.querySelector('.editor-tools');
const advanced=document.createElement('section');advanced.className='v2-pro-audio-tools';
const advancedTitle=document.createElement('strong');advancedTitle.textContent='Audio assistance';
const abLabel=document.createElement('div');abLabel.className='v2-range-label';abLabel.textContent='A/B loop: off';
const actionRow=document.createElement('div');actionRow.className='v2-ab-actions';
const setA=document.createElement('button'),setB=document.createElement('button'),clear=document.createElement('button');
setA.type=setB.type=clear.type='button';setA.textContent='Set A';setB.textContent='Set B';clear.textContent='Clear';
actionRow.append(setA,setB,clear);
const rewindLabel=document.createElement('label');rewindLabel.textContent='Rewind on resume';
const rewindSelect=document.createElement('select');rewindSelect.setAttribute('aria-label','Rewind on resume');
for(const [v,t] of [['0','Off'],['1','1 second'],['2','2 seconds']]){
 const opt=document.createElement('option');opt.value=v;opt.textContent=t;rewindSelect.append(opt);
}
try{rewindSelect.value=localStorage.getItem('adatacore:txv2-rewind')||'1'}catch(_){rewindSelect.value='1'}
rewindLabel.append(rewindSelect);advanced.append(advancedTitle,rewindLabel,abLabel,actionRow);
audioTools?.append(advanced);
let rangeA=null,rangeB=null,lastPause=null,lastSeek=0;
const duration=()=>Number.isFinite(audio.duration)?audio.duration:0;
function updateRange(){
 const valid=rangeA!==null&&rangeB!==null&&rangeB-rangeA>=.15;
 abLabel.textContent=valid?'Loop '+M.time(rangeA*1000,false)+' – '+M.time(rangeB*1000,false):
  rangeA!==null?'A at '+M.time(rangeA*1000,false)+' · Set B (after A)':'A/B loop: off';
 advanced.classList.toggle('v2-loop-active',valid);
}
setA.addEventListener('click',()=>{rangeA=audio.currentTime;rangeB=null;updateRange()});
setB.addEventListener('click',()=>{
 if(rangeA===null)return updateRange();
 const t=audio.currentTime;
 if(t<=rangeA+.15){abLabel.textContent='B must be after A · move the playhead';return}
 rangeB=t;updateRange();
});
clear.addEventListener('click',()=>{rangeA=null;rangeB=null;updateRange()});
rewindSelect.addEventListener('change',()=>{try{localStorage.setItem('adatacore:txv2-rewind',rewindSelect.value)}catch(_){}});
audio.addEventListener('pause',()=>{lastPause=audio.currentTime});
audio.addEventListener('seeked',()=>{lastSeek=performance.now()});
$('play')?.addEventListener('click',()=>{
 const rewind=Number(rewindSelect.value)||0;
 if(!audio.paused||!rewind||lastPause===null||audio.currentTime<rewind+.1)return;
 if(Math.abs(audio.currentTime-lastPause)>.4||performance.now()-lastSeek<550)return;
 audio.currentTime=Math.max(0,audio.currentTime-rewind);
 lastPause=null;
},true);
audio.addEventListener('timeupdate',()=>{
 if(rangeA!==null&&rangeB!==null&&!audio.paused&&rangeB>rangeA+.15&&audio.currentTime>=rangeB){
  // Preserve the native selection playback logic by controlling only this A/B region.
  if(typeof window.txV2SeekTo==='function')window.txV2SeekTo(rangeA*1000);
  else audio.currentTime=rangeA;
 }
});

// Progress is factual: captioned segments and time ranges are separate from quality,
// and listening counts only actual playback observed during this browser session.
let recordedSecond=-1,coverageSeconds=new Set(),progressPending=false;
function requestProgress(){if(progressPending)return;progressPending=true;requestAnimationFrame(()=>{progressPending=false;updateProgress()})}
function rangesLength(intervals){
 intervals=intervals.sort((a,b)=>a[0]-b[0]);let total=0,s=null,e=null;
 for(const [start,end] of intervals){
  if(s===null){s=start;e=end;continue}
  if(start<=e)e=Math.max(e,end);
  else{total+=e-s;s=start;e=end}
 }
 if(s!==null)total+=e-s;
 return total;
}
function updateProgress(){
 const lines=lineRecords(),filled=lines.filter(x=>x.text.trim()).length,whole=lines.length;
 $('v2TextProgress').querySelector('strong').textContent=filled+'/'+whole+' lines';
 const seconds=duration(),cover=seconds>0?rangesLength(lines.filter(x=>x.text.trim()&&Number.isFinite(x.start)&&Number.isFinite(x.end)).map(x=>[clamp(x.start/1000,0,seconds),clamp(x.end/1000,0,seconds)])):0;
 $('v2CoverageProgress').querySelector('strong').textContent=seconds>0?Math.round(100*cover/seconds)+'%':'—';
 $('v2ListeningProgress').querySelector('strong').textContent=seconds>0?'≈'+Math.min(100,Math.round(100*coverageSeconds.size/Math.max(1,Math.ceil(seconds))))+'%':'—';
}
audio.addEventListener('timeupdate',()=>{
 const seconds=duration();
 if(!audio.paused&&seconds>0){
  const t=Math.floor(audio.currentTime);
  if(t>=0&&t<seconds)coverageSeconds.add(t);
  if(recordedSecond>=0&&t>recordedSecond&&t-recordedSecond<=2){
   for(let i=recordedSecond;i<=t;i++)if(i>=0&&i<seconds)coverageSeconds.add(i);
  }
  recordedSecond=t;
 }else recordedSecond=-1;
 requestProgress();
});
audio.addEventListener('seeking',()=>{recordedSecond=-1});
audio.addEventListener('pause',requestProgress);
audio.addEventListener('loadedmetadata',requestProgress);
rows.addEventListener('input',requestProgress);
rows.addEventListener('change',requestProgress);
new MutationObserver(requestProgress).observe(rows,{childList:true});
requestProgress();

// Lightweight format warnings. We never change text or claim these checks replace audio QA.
function formatWarnings(text){
 const out=[];
 if(/\s\.\.\./.test(text))out.push('Remove the space before an ellipsis (...)');
 if(/\.{4,}/.test(text))out.push('Check ellipsis length (three dots)');
 if(text.includes('…'))out.push('Check the ellipsis character against the project style guide');
 if(/\{\s*PRO\s*:/i.test(text)&&!/\{PRO:\s*[^}]+\}/.test(text))out.push('Complete the pronunciation tag');
 if(/\{\d+(?:[.,]\d+)*\}(?!\s*\{PRO:)/.test(text))out.push('Check whether this numeral needs a PRO tag');
 if((text.match(/<विदेशी-भाषण="EN">/g)||[]).length!==(text.match(/<\/विदेशी-भाषण>/g)||[]).length)out.push('Check unmatched FL tags');
 return out;
}
function audit(){
 const lines=lineRecords(),errors=[],warnings=[],durationMs=duration()*1000;
 if(!lines.length)errors.push({label:'No transcript segments yet',id:null});
 for(const line of lines){
  if(!line.text.trim())errors.push({label:'Line '+(line.index+1)+' has no transcript text',id:line.id});
  if(!Number.isFinite(line.start)||!Number.isFinite(line.end)||line.end<=line.start||line.start<0||durationMs&&line.end>durationMs+2)
   errors.push({label:'Line '+(line.index+1)+' has an invalid timestamp',id:line.id});
  for(const warning of formatWarnings(line.text))warnings.push({label:'Line '+(line.index+1)+': '+warning,id:line.id});
 }
 for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
  const a=lines[i],b=lines[j];
  if(a.speaker&&a.speaker===b.speaker&&Number.isFinite(a.start)&&Number.isFinite(b.start)&&a.start<b.end&&b.start<a.end)
   errors.push({label:'Lines '+(a.index+1)+' and '+(b.index+1)+' overlap for the same speaker',id:a.id});
 }
 const totalTime=durationMs;
 if(totalTime>0){
  const filled=lines.filter(s=>s.text.trim()&&Number.isFinite(s.start)&&Number.isFinite(s.end));
  const coverage=rangesLength(filled.map(s=>[clamp(s.start,0,totalTime),clamp(s.end,0,totalTime)]))/totalTime;
  if(coverage<.95)warnings.push({label:'Timestamp coverage is '+Math.round(coverage*100)+'%. Check untranscribed portions.',id:null});
 }
 return{errors,warnings};
}
function jump(id){
 $('v2PreflightDialog')?.close();
 if(!id){window.scrollTo({top:0,behavior:'smooth'});return}
 finishInline();
 window.dispatchEvent(new CustomEvent('v2:goto-caption',{detail:{id}}));
 const element=flow.querySelector('[data-edit-segment="'+CSS.escape(id)+'"]');
 if(element)startInline(id,element);
 else{
  $('v2EditMode')?.click();
  rows.querySelector('tr[data-segment="'+CSS.escape(id)+'"] textarea')?.focus();
 }
}
const preflight=$('v2PreflightDialog'),submit=$('submit'),check=$('v2CheckQuality'),list=$('v2PreflightList'),confirm=$('v2PreflightContinue');
let isSubmitting=false;
function showPreflight(){
 finishInline();
 const result=audit();list.replaceChildren();
 const header=document.createElement('div');header.className='v2-check-summary';
 header.textContent=result.errors.length?result.errors.length+' required fixes · '+result.warnings.length+' suggestions':
  result.warnings.length?'No blocking problems · '+result.warnings.length+' suggestions':'No structural issues detected';
 list.append(header);
 const block=(title,rows,kind)=>{
  if(!rows.length)return;
  const section=document.createElement('section');section.className='v2-check-group '+kind;
  const heading=document.createElement('h3');heading.textContent=title;section.append(heading);
  rows.slice(0,75).forEach(item=>{
   const line=document.createElement('div');line.className='v2-check-line';
   const desc=document.createElement('span');desc.textContent=item.label;line.append(desc);
   if(item.id){
    const link=document.createElement('button');link.type='button';link.textContent='Go to line ↗';
    link.addEventListener('click',()=>jump(item.id));line.append(link);
   }
   section.append(line);
  });list.append(section);
 };
 block('Please fix before submitting',result.errors,'v2-check-errors');
 block('Review against the audio and project guidelines',result.warnings,'v2-check-warnings');
 if(!result.errors.length&&!result.warnings.length){
  const clean=document.createElement('p');clean.textContent='All segments have text and valid timing. Please make your final audio accuracy check before submission.';list.append(clean);
 }
 confirm.disabled=result.errors.length>0||!submit||submit.disabled;
 confirm.textContent=result.errors.length?'Fix errors to continue':'Continue to submit →';
 if(!preflight.open)preflight.showModal();
}
check.addEventListener('click',showPreflight);
submit?.addEventListener('click',event=>{
 if(isSubmitting)return;
 event.preventDefault();event.stopImmediatePropagation();
 showPreflight();
},true);
confirm.addEventListener('click',()=>{
 const current=audit();if(current.errors.length){showPreflight();return}
 preflight.close();
 isSubmitting=true;
 try{if(typeof submit.onclick==='function')submit.onclick.call(submit,new MouseEvent('click',{bubbles:false}));else submit.click()}
 finally{isSubmitting=false}
});

// Persistent timestamped audio reports, authorized by tx_mode in the database.
// Only the assigned CB, reviewer or an authorized admin can access an audio's reports.
const issueDialog=$('v2AudioIssueDialog'),issueList=$('v2AudioIssueList'),issueFeedback=$('v2AudioIssueFeedback');
const saveIssue=$('v2AudioIssueSave');
const db=window.supabase?.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
const names={unclear_speech:'Unclear speech',background_noise:'Background noise',missing_audio:'Missing audio',wrong_audio:'Wrong recording',other:'Other'};
const rpc=async(name,args)=>{
 if(!db)throw Error('Audio reporting is temporarily unavailable');
 const {data,error}=await db.rpc(name,args);
 if(error)throw Error(error.message);
 return data;
};
function reportTime(){
 const el=$('v2AudioIssueTime');el.value=fmt(audio.currentTime*1000);
}
async function listReports(){
 if(!itemId||!/^[a-f\d-]{36}$/i.test(itemId))return;
 try{
  const items=await rpc('tx_v2_audio_flags',{p_item:itemId});
  issueList.replaceChildren();
  if(!Array.isArray(items)||!items.length){
   const blank=document.createElement('p');blank.className='small muted';blank.textContent='No issues reported for this recording yet.';issueList.append(blank);return;
  }
  const heading=document.createElement('strong');heading.textContent='Reports for this recording';issueList.append(heading);
  for(const issue of items.slice(0,100)){
   const row=document.createElement('div');row.className='v2-reported-row';
   const time=document.createElement('button');time.type='button';time.textContent=fmt(issue.at_ms);
   time.addEventListener('click',()=>{issueDialog.close();if(typeof window.txV2SeekTo==='function')window.txV2SeekTo(Number(issue.at_ms)||0)});
   const content=document.createElement('span');content.textContent=(names[issue.category]||'Audio issue')+(issue.note?' · '+issue.note:'');
   row.append(time,content);issueList.append(row);
  }
 }catch(e){issueList.textContent='Could not load past reports: '+String(e.message||e)}
}
$('v2ReportAudio').addEventListener('click',()=>{
 reportTime();issueFeedback.textContent='';$('v2AudioIssueNote').value='';
 if(!issueDialog.open)issueDialog.showModal();
 listReports();
});
saveIssue.addEventListener('click',async()=>{
 const category=$('v2AudioIssueType').value,atMs=parse($('v2AudioIssueTime').value);
 if(!Number.isFinite(atMs)||atMs<0||duration()&&atMs>duration()*1000+2000){issueFeedback.textContent='Enter a valid timestamp within the audio.';return}
 saveIssue.disabled=true;issueFeedback.textContent='Saving report…';
 try{
  await rpc('tx_v2_flag_audio',{p_item:itemId,p_category:category,p_at_ms:Math.round(atMs),p_note:$('v2AudioIssueNote').value.trim()});
  issueFeedback.textContent='Report saved with its timestamp.';
  $('v2AudioIssueNote').value='';
  await listReports();
 }catch(e){issueFeedback.textContent='Could not save: '+String(e.message||e)}
 finally{saveIssue.disabled=false}
});
// Keep this module self-contained so future UI changes do not affect the V1 editor.
})();
