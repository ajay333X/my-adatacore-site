(()=>{
'use strict';
// The compact contributor studio reuses the original transcription controller and saved segments.
// It does not modify the existing save, review, export or audio logic.
const $=id=>document.getElementById(id),root=document.body,rows=$('segmentRows'),pane=$('v2CaptionPanel'),flow=$('v2CaptionFlow'),sum=$('v2CaptionSummary'),toggle=$('v2EditMode');
if(!rows||!pane||!flow||!toggle)return;
let editing=false,previousCount=0,hydrated=false,scheduled=false;
function setEditing(value){
 editing=Boolean(value);root.classList.toggle('v2-segment-editing',editing);
 toggle.textContent=editing?'Done editing':'Edit captions';
 toggle.setAttribute('aria-pressed',String(editing));
}
toggle.addEventListener('click',()=>{setEditing(!editing);if(editing)document.querySelector('.v2-table-wrap')?.scrollIntoView({behavior:'smooth',block:'nearest'});});
$('v2CaptionExpand')?.addEventListener('click',()=>{setEditing(true);document.querySelector('.v2-table-wrap')?.scrollIntoView({behavior:'smooth',block:'nearest'})});
$('addSegment')?.addEventListener('click',()=>{if(!root.classList.contains('v2-slideshow'))setEditing(true)},true);
$('v2QuickAdd')?.addEventListener('click',()=>{if(!root.classList.contains('v2-slideshow'))setEditing(true)},true);
const cls=token=>token.startsWith('[')?'v2-inline-nst':token.startsWith('{')?'v2-inline-pro':token.startsWith('*')?'v2-inline-emphasis':'v2-inline-tag';
const pattern=/(<\/?[^<>]{1,100}>|\[[^\]\n]{1,55}\]|\{(?:PRO:[^}\n]{1,140}|\d{1,12})\}|\*[^*\n]{1,80}\*)/g;
function rich(target,source){
 let pos=0;pattern.lastIndex=0;
 for(const match of String(source||'').matchAll(pattern)){
  const at=match.index;
  if(at>pos)target.append(document.createTextNode(source.slice(pos,at)));
  const tag=document.createElement('span');tag.className='v2-inline-token '+cls(match[0]);
  tag.textContent=match[0];target.append(tag);
  pos=at+match[0].length;
 }
 if(pos<String(source||'').length)target.append(document.createTextNode(source.slice(pos)));
}
function sync(){
 scheduled=false;
 const visible=[...rows.querySelectorAll('tr[data-segment]')];
 const saveState=$('saveState')?.textContent||'';
 const isLoaded=/^(All changes saved|Read only|Unsaved changes|Saving|Submitted)/.test(saveState);
 if(!hydrated){if(isLoaded)hydrated=true;}else if(visible.length>previousCount&&!root.classList.contains('v2-slideshow'))setEditing(true);
 previousCount=visible.length;
 const filled=visible.filter(row=>String(row.querySelector('textarea[data-field="transcript"]')?.value||'').trim());
 pane.hidden=visible.length===0;
 const counter=$('segmentCount')?.textContent||'';
 if(sum)sum.textContent=filled.length+' '+(filled.length===1?'caption line':'caption lines')+(counter?' · '+counter:'');
 flow.replaceChildren();
 const fragment=document.createDocumentFragment();
 filled.forEach((row,i)=>{
  const id=row.dataset.segment;
  const button=document.createElement('button');button.type='button';button.className='v2-caption-piece';
  button.dataset.editSegment=id;button.setAttribute('aria-label','Edit caption '+(i+1));
  rich(button,row.querySelector('textarea[data-field="transcript"]').value);
  fragment.append(button,document.createTextNode(' '));
 });
 flow.append(fragment);
 if(visible.length===0&&!filled.length){root.classList.add('v2-no-segments')}else{root.classList.remove('v2-no-segments')}
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(sync)}
new MutationObserver(schedule).observe(rows,{childList:true,subtree:false});
rows.addEventListener('input',schedule);
rows.addEventListener('change',schedule);
document.getElementById('segmentCount')&&new MutationObserver(schedule).observe($('segmentCount'),{childList:true,subtree:true,characterData:true});
flow.addEventListener('click',e=>{
 const piece=e.target.closest('[data-edit-segment]');if(!piece)return;
 const id=piece.dataset.editSegment;
 if(root.classList.contains('v2-slideshow')){window.dispatchEvent(new CustomEvent('v2:goto-caption',{detail:{id}}));return}
 setEditing(true);
 requestAnimationFrame(()=>{
  const row=[...rows.querySelectorAll('tr[data-segment]')].find(x=>x.dataset.segment===id);
  if(!row)return;
  row.scrollIntoView({behavior:'smooth',block:'center'});
  const field=row.querySelector('textarea[data-field="transcript"]');
  field?.focus({preventScroll:true});
 });
});
// Put advanced and administrative controls out of the contributor's main path without removing them.
const tools=document.querySelector('.editor-tools');
if(tools){
 const extra=document.createElement('details');extra.className='v2-extra-tools';
 const title=document.createElement('summary');title.textContent='More tools ▾';
 const menu=document.createElement('div');menu.className='v2-extra-menu';
 extra.append(title,menu);tools.append(extra);
 const move=element=>{if(element)menu.append(element)};
 move($('monitor')?.closest('label'));
 move($('speakerSettings'));
 move($('diffToggle')?.closest('label'));
 move($('historyBtn'));
 move($('aiOriginal'));
 move($('copyId'));
 move($('v2FocusMode'));
 move($('exportFormat'));
 move($('export'));
 move($('importTranscript'));
 // The original select remains the source of truth, with compact quick-speed buttons shown instead.
 const speed=$('speed');
 if(speed){
  const label=speed.closest('label');if(label)label.classList.add('v2-native-speed');
  const group=document.createElement('div');group.className='v2-speed-pills';group.setAttribute('role','group');group.setAttribute('aria-label','Playback speed');
  for(const value of ['0.5','1','1.5','2']){
   const button=document.createElement('button');button.type='button';button.dataset.speed=value;button.textContent=value+'×';
   button.addEventListener('click',()=>{speed.value=value;speed.dispatchEvent(new Event('change',{bubbles:true}));refreshSpeed()});
   group.append(button);
  }
  const refreshSpeed=()=>group.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('selected',b.dataset.speed===speed.value));
  speed.addEventListener('change',refreshSpeed);tools.insertBefore(group,extra);refreshSpeed();
 }
 const speakerFilter=$('speakerFilter');
 if(speakerFilter){
  const container=speakerFilter.closest('label');container?.classList.add('v2-filter-speaker');
  const syncSpeakers=()=>root.classList.toggle('v2-multi-speaker',speakerFilter.options.length>2);
  new MutationObserver(syncSpeakers).observe(speakerFilter,{childList:true});
  syncSpeakers();
 }
 // Keep the menu available for keyboard access and close it after choosing an action.
 menu.addEventListener('click',event=>{if(event.target.closest('button')&&!event.target.closest('select'))extra.open=false});
 document.addEventListener('pointerdown',event=>{if(extra.open&&!extra.contains(event.target))extra.open=false});
}
// Hide the internal project AI status and duplicated introduction but keep their IDs for existing scripts.
setEditing(false);sync();
})();
