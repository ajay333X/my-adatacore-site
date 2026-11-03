(()=>{'use strict';
const $=id=>document.getElementById(id);
const table=$('audioRows'),dialog=$('v2CaptionsDialog');if(!table||!dialog)return;
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
let requestId=0,index=new Map(),active=null,detail=null;
const mtime=ms=>{const n=Math.max(0,Number(ms)||0),seconds=Math.floor(n/1000);return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')};
const status=s=>['approved','reviewed'].includes(s)?'Approved':['submitted','in_review','changes_requested'].includes(s)?'Submitted for review':'Saved draft · Not submitted';
const rpc=async(name,args)=>{const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data};
const summary=$('v2CaptionQueueCount'),headline=$('v2CaptionOverviewCount'),description=$('v2CaptionOverviewText');
function label(node,s){if(node)node.textContent=s}
function decorate(){
  table.querySelectorAll('tr').forEach(row=>{
    const id=row.querySelector('input[data-item]')?.dataset.item,info=index.get(String(id||''));
    if(!id||!info||row.children.length<3)return;
    const cell=row.children[1],last=row.lastElementChild;
    let box=cell.querySelector('.v2-caption-inline');
    if(!box){box=document.createElement('div');box.className='v2-caption-inline';cell.append(box)}
    const count=Number(info.caption_count)||0,total=Number(info.segment_count)||0;
    const sig=[count,total,info.caption_preview,info.submitted_count].join('|');
    if(box.dataset.sig!==sig){
      box.replaceChildren();
      const pill=document.createElement('span');
      pill.className='v2-caption-pill '+(count?'ready':'missing');
      pill.textContent=count?count+' caption '+(count===1?'line':'lines')+(Number(info.submitted_count)?' · Submitted':' · Saved draft'):total?'Segments exist · Text missing':'No saved captions';
      box.append(pill);
      if(count&&info.caption_preview){const excerpt=document.createElement('span');excerpt.className='v2-caption-excerpt';excerpt.textContent=info.caption_preview;box.append(excerpt)}
      box.dataset.sig=sig;
    }
    let button=last.querySelector('[data-caption-item]');
    if(!button){button=document.createElement('button');button.type='button';button.className='v2-view-captions';button.dataset.captionItem=id;last.append(button)}
    button.textContent=count?'View captions':'No captions';button.disabled=!count;
    button.title=count?'View saved transcript lines':'No transcribed captions were saved for this audio';
  });
}
let queued=false;
new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;decorate()})}).observe(table,{childList:true,subtree:false});
async function load(pid){
  const token=++requestId;index.clear();label(summary,'Checking saved captions…');label(headline,'Loading saved captions…');
  try{
    const rows=await rpc('tx_v2_caption_index',{p_project_id:pid});if(token!==requestId)return;
    index=new Map((Array.isArray(rows)?rows:[]).map(r=>[String(r.id),r]));
    const all=[...index.values()],clips=all.filter(x=>Number(x.caption_count)>0).length,lines=all.reduce((a,x)=>a+Number(x.caption_count||0),0);
    label(summary,clips+' recordings with captions · '+lines+' lines');
    label(headline,clips+' recordings with saved captions · '+lines+' lines');
    label(description,clips?'Saved drafts remain visible even when the queue status is Unassigned. Captions count toward completed work only after submission.':'No transcript text saved in this project yet. Importing audio alone does not automatically transcribe it.');
    decorate();
  }catch(e){if(token!==requestId)return;label(summary,'Captions unavailable');label(headline,'Could not load captions');label(description,String(e?.message||e))}
}
document.addEventListener('txv2:data',e=>{const pid=Number(e.detail?.projectId||0);if(pid)load(pid)});
table.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-caption-item]');if(!btn||btn.disabled)return;
  const id=String(btn.dataset.captionItem||'');if(!/^[0-9a-f-]{36}$/i.test(id))return;
  active=id;detail=null;
  label($('v2CaptionsTitle'),'Saved captions');label($('v2CaptionsSubheading'),'Loading transcript…');
  label($('v2CaptionsRows'),'Loading caption lines…');
  $('v2CaptionExport').disabled=true;
  $('v2CaptionOpenEditor').href='/transcription-v2?item='+encodeURIComponent(id);
  if(!dialog.open)dialog.showModal();
  try{
    const result=await rpc('tx_v2_caption_detail',{p_item_id:id});if(active!==id||!dialog.open)return;
    detail=result;
    const lines=(Array.isArray(result.segments)?result.segments:[]).filter(x=>String(x.text||'').trim());
    label($('v2CaptionsSubheading'),lines.length+' saved lines · '+status(result.status));
    const target=$('v2CaptionsRows');target.replaceChildren();
    if(!lines.length){label(target,'No captions have been saved for this recording. Open the editor to start transcribing.');return}
    const fragment=document.createDocumentFragment();
    lines.forEach((s,i)=>{
      const line=document.createElement('div');line.className='v2-caption-line';
      const time=document.createElement('span');time.className='v2-caption-time';time.textContent=String(i+1).padStart(2,'0')+' · '+mtime(s.start_ms)+' – '+mtime(s.end_ms);
      const caption=document.createElement('p');caption.className='v2-caption-text';caption.textContent=String(s.text||'');
      const jump=document.createElement('a');jump.className='v2-caption-jump';jump.textContent='Open at time ↗';jump.href='/transcription-v2?item='+encodeURIComponent(id)+'&t='+Math.round(Number(s.start_ms)||0);
      line.append(time,caption,jump);fragment.append(line);
    });
    target.append(fragment);$('v2CaptionExport').disabled=false;
  }catch(e){if(active===id){label($('v2CaptionsSubheading'),'Unable to load');label($('v2CaptionsRows'),String(e?.message||e))}}
});
$('v2CaptionExport').addEventListener('click',()=>{
  if(!detail)return;
  const text=(detail.segments||[]).filter(s=>String(s.text||'').trim()).map(s=>'['+mtime(s.start_ms)+' – '+mtime(s.end_ms)+'] '+s.text).join('\n')+'\n';
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download='captions-'+String(active).slice(0,8)+'.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
});
dialog.addEventListener('close',()=>{active=null;detail=null});
})();