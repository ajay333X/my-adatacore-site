(()=>{
'use strict';
// Visual comparison only: transcript, autosave, audio and review models are untouched.
if(!document.body.classList.contains('tx-v2-editor')||document.getElementById('txrMakeChangesButton'))return;
const $=id=>document.getElementById(id),root=document.body;
const itemId=new URLSearchParams(location.search).get('item');
const actions=root.querySelector('.txr-timeline-actions')||root.querySelector('#v2cbWorkbar .v2cb-workbar-actions');
const card=root.querySelector('.v2-transcript-card'),wave=root.querySelector('.v2-wave-card');
if(!itemId||!actions||!card||!wave)return;
const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=String(text);return el};
const snapshot=()=>window.txV2Snapshot?.()||null;
const state={on:false,busy:false,ready:false,l0:null,l1:null,err0:'',err1:'',base:'',rendered:'',raf:0,timer:0,load:null};
const markType=t=>/^(?:<[^>]+>|\{[^}]+\}|\[[^\]]+\]|\*[^*]+\*)$/u.test(t)?'tag':/^[\p{L}\p{M}\p{N}]/u.test(t)?'word':'punct';
function tokenize(value){
 const result=[];let space='';
 const pattern=/\s+|<[^>\n]{1,180}>|\{[^}\n]{1,180}\}|\[[^\]\n]{1,160}\]|\*[^*\n]{1,120}\*|[\p{L}\p{M}\p{N}]+(?:[-’'][\p{L}\p{M}\p{N}]+)*|[^\s]/gu;
 for(const match of String(value||'').matchAll(pattern)){
  const t=match[0];if(/^\s+$/u.test(t)){space+=t;continue}
  result.push({text:t,space,type:markType(t)});space='';
 }
 return result;
}
function diff(before,after){
 const left=tokenize(before),right=tokenize(after),n=left.length,m=right.length;
 const matches=[];let i=0,j=0;
 if(n*m>220000){
  while(i<Math.min(n,m)&&left[i].text===right[i].text){matches.push([i,i]);i++}
  let a=n-1,b=m-1;const tail=[];
  while(a>=i&&b>=i&&left[a].text===right[b].text){tail.push([a,b]);a--;b--}
  matches.push(...tail.reverse());
 }else{
  const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let a=n-1;a>=0;a--)for(let b=m-1;b>=0;b--)
   dp[a][b]=left[a].text===right[b].text?dp[a+1][b+1]+1:Math.max(dp[a+1][b],dp[a][b+1]);
  while(i<n&&j<m){
   if(left[i].text===right[j].text){matches.push([i,j]);i++;j++}
   else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;
  }
 }
 const ops=[];i=0;j=0;
 for(const [a,b] of [...matches,[n,m]]){
  const removed=left.slice(i,a),added=right.slice(j,b);
  if(removed.length||added.length)ops.push({kind:removed.length&&added.length?'sub':removed.length?'remove':'add',old:removed,now:added});
  if(a<n&&b<m)ops.push({kind:'equal',old:[],now:[right[b]]});
  i=a+1;j=b+1;
 }
 const stats={word:{S:0,A:0,R:0},tag:{S:0,A:0,R:0},punct:{S:0,A:0,R:0}};
 for(const op of ops){
  if(op.kind==='equal')continue;
  for(const type of ['word','tag','punct']){
   const o=op.old.filter(t=>t.type===type).length,a=op.now.filter(t=>t.type===type).length,s=Math.min(o,a);
   stats[type].S+=s;stats[type].A+=a-s;stats[type].R+=o-s;
  }
 }
 return {ops,stats,originalWords:left.filter(t=>t.type==='word').length};
}
function pair(before,after){
 const old=Array.isArray(before)?before:[],now=Array.isArray(after)?after:[];
 const free=new Set(now.map((_,i)=>i)),ids=new Map();
 now.forEach((s,i)=>{if(s?.id!=null)ids.set(String(s.id),i)});
 const rows=[];
 for(const previous of old){
  let pick=previous?.id!=null?ids.get(String(previous.id)):undefined;
  if(!free.has(pick))pick=undefined;
  if(pick===undefined){
   let top=-Infinity;
   for(const i of free){
    const next=now[i],a=Number(previous.start_ms),b=Number(previous.end_ms),c=Number(next.start_ms),d=Number(next.end_ms);
    if(![a,b,c,d].every(Number.isFinite))continue;
    const overlap=Math.max(0,Math.min(b,d)-Math.max(a,c)),span=Math.max(1,Math.max(b,d)-Math.min(a,c)),distance=Math.abs(a-c);
    if(overlap/span<.25&&distance>650)continue;
    const score=overlap/span-distance/100000;
    if(score>top){pick=i;top=score}
   }
  }
  rows.push({old:previous,now:pick===undefined?null:now[pick]});if(pick!==undefined)free.delete(pick);
 }
 for(const i of free)rows.push({old:null,now:now[i]});
 rows.sort((a,b)=>Number(a.now?.start_ms??a.old?.start_ms??0)-Number(b.now?.start_ms??b.old?.start_ms??0));
 return rows;
}
const toggle=node('button','txr-change-toggle','Make Changes?');
toggle.type='button';toggle.id='txrMakeChangesButton';toggle.setAttribute('aria-pressed','false');
toggle.title='Highlight substitutions, additions and removals against L0 or L1';
actions.prepend(toggle);
const detailed=$('v2ReviewDiffOpen'),extras=document.querySelector('.editor-tools .v2-extra-menu');
if(detailed&&extras){detailed.textContent='Detailed comparison ↗';extras.append(detailed)}
const bar=node('div','txr-change-bar');bar.id='txrChangeBar';bar.hidden=true;
bar.innerHTML='<div class="txr-change-top"><label class="txr-change-select">Compare with <select id="txrChangeBaseline" aria-label="Choose original version"></select></label><div id="txrChangeMetrics" class="txr-change-metrics" aria-live="polite"></div><div class="txr-change-legend"><span><i class="txr-dot txr-dot-sub"></i>Substituted</span><span><i class="txr-dot txr-dot-add"></i>Added</span><span><i class="txr-dot txr-dot-remove"></i>Removed</span></div></div>';
const tools=wave.querySelector('.editor-tools');if(tools)tools.after(bar);else wave.querySelector('.v2-pane-head')?.after(bar);
const select=$('txrChangeBaseline'),metrics=$('txrChangeMetrics');
const preview=node('section','txr-change-preview');preview.id='txrChangePreview';preview.hidden=true;
preview.setAttribute('aria-label','Inline transcript changes');
preview.innerHTML='<div class="txr-change-preview-head"><div><strong>Transcript changes</strong><span id="txrChangePreviewNote">Read-only comparison</span></div><div class="txr-change-preview-buttons"><button type="button" id="txrChangeDetailed">Detailed comparison ↗</button><button type="button" id="txrChangeEdit">Return to editing</button></div></div><div id="txrChangeLines" class="txr-change-lines"></div>';
const panel=$('v2CaptionPanel');if(panel)panel.before(preview);else card.querySelector('.v2-table-wrap')?.before(preview);
const lines=$('txrChangeLines'),note=$('txrChangePreviewNote');
const current=()=>{const s=snapshot();return Array.isArray(s?.segments)?s.segments:null};
const time=ms=>{const t=Math.max(0,Number(ms)||0);return String(Math.floor(t/60000)).padStart(2,'0')+':'+String(Math.floor(t%60000/1000)).padStart(2,'0')};
function message(s){lines.replaceChildren(node('p','txr-change-state',s));metrics.textContent=''}
function options(){
 const prev=state.base,s=snapshot();
 const reviewer=s&&(s.mode==='reviewer'||s.mode==='admin'&&['submitted','in_review'].includes(s.status));
 const list=[];
 if(Array.isArray(state.l0))list.push(['l0','L0 · Original AI']);
 if(Array.isArray(state.l1)&&state.l1.length)list.push(['l1','L1 · Submitted']);
 select.replaceChildren();
 if(!list.length){const o=node('option','','No reference available');o.value='';select.append(o);select.disabled=true;state.base='';return}
 for(const [value,text] of list){const o=node('option','',text);o.value=value;select.append(o)}
 select.disabled=false;state.base=list.some(x=>x[0]===prev)?prev:reviewer&&state.l1?.length?'l1':list[0][0];
 select.value=state.base;
}
function appendTokens(target,tokens,type){
 for(const token of tokens){
  if(token.space)target.append(document.createTextNode(token.space));
  const part=node('span',type?'txr-mark txr-mark-'+type:'',token.text);
  if(type)part.title=type==='sub'?'Substituted':type==='remove'?'Removed':'Added';
  target.append(part);
 }
}
function render(){
 if(!state.on)return;
 const changed=current();if(!changed){message('Opening transcript. Comparison will appear when it loads.');return}
 const baseline=state.base==='l1'?state.l1:state.l0;
 if(!Array.isArray(baseline)){message(state.err0||state.err1||'No original transcript is available for this task.');return}
 const matched=pair(baseline,changed),stats={word:{S:0,A:0,R:0},tag:{S:0,A:0,R:0},punct:{S:0,A:0,R:0}};
 let originals=0,changedLines=0,shift=0,shiftCount=0;
 const fragment=document.createDocumentFragment();
 for(const [index,entry] of matched.entries()){
  const d=diff(entry.old?.transcript||'',entry.now?.transcript||'');
  originals+=d.originalWords;
  for(const type of ['word','tag','punct'])for(const k of ['S','A','R'])stats[type][k]+=d.stats[type][k];
  const runs=d.ops.filter(x=>x.kind!=='equal').length;
  const edited=runs>0||!entry.old||!entry.now||entry.old&&entry.now&&Math.abs(Number(entry.old.start_ms)-Number(entry.now.start_ms))>75;
  if(edited)changedLines++;
  if(entry.old&&entry.now){shift+=Math.abs(Number(entry.old.start_ms||0)-Number(entry.now.start_ms||0));shiftCount++}
  const row=node('article','txr-change-line'+(edited?' is-changed':''));
  const info=node('div','txr-change-line-meta');
  info.append(node('span','txr-change-line-id','Line '+(index+1)+' · '+time(entry.now?.start_ms??entry.old?.start_ms)));
  if(edited)info.append(node('span','txr-change-count',runs+' change'+(runs===1?'':'s')));
  row.append(info);
  const text=node('p','txr-change-text');
  if(!d.ops.length)text.textContent='This line has no text yet.';
  for(const op of d.ops){
   if(op.kind==='equal')appendTokens(text,op.now,'');
   else if(op.kind==='add')appendTokens(text,op.now,'add');
   else if(op.kind==='remove')appendTokens(text,op.old,'remove');
   else{appendTokens(text,op.old,'remove');appendTokens(text,op.now,'sub')}
  }
  row.append(text);fragment.append(row);
 }
 if(!matched.length)fragment.append(node('p','txr-change-state','No transcript segments to compare.'));
 lines.replaceChildren(fragment);
 const total=stats.word.S+stats.word.A+stats.word.R,pct=Math.min(999,Math.round(total/Math.max(1,originals)*1000)/10);
 const addMetric=(label,value)=>{const e=node('span','txr-change-metric');e.append(node('span','',label+' '),node('strong','',value));return e};
 const addCounts=(label,amounts)=>{
  const e=node('span','txr-change-metric txr-change-colored');e.append(node('span','',label+' '));
  for(const key of ['S','A','R']){
   const short=node('span','txr-count-'+key.toLowerCase(),key+' '+amounts[key]);e.append(short);
  }
  return e;
 };
 metrics.replaceChildren(
  addMetric('Avg shift',Math.round(shift/Math.max(1,shiftCount))+'ms'),
  addMetric('Word diff',pct.toFixed(1)+'%'),
  addCounts('Words',stats.word),
  addCounts('Tags',stats.tag),
  addCounts('Punctuation',stats.punct)
 );
 note.textContent=changedLines+' of '+matched.length+' lines changed · Current transcript compared with '+(select.selectedOptions[0]?.textContent||'original');
 state.rendered=JSON.stringify(changed.map(s=>[s.id,s.start_ms,s.end_ms,s.transcript]))+'|'+state.base;
}
function schedule(){
 if(!state.on||state.busy||state.raf)return;
 state.raf=requestAnimationFrame(()=>{state.raf=0;clearTimeout(state.timer);state.timer=setTimeout(()=>{
  const s=current(),key=s?JSON.stringify(s.map(x=>[x.id,x.start_ms,x.end_ms,x.transcript]))+'|'+state.base:'';
  if(key!==state.rendered)render();
 },120)});
}
async function load(){
 if(state.ready)return;
 if(state.load)return state.load;
 state.busy=true;message('Loading the original and submitted transcript versions…');
 state.load=(async()=>{
  const client=window.supabase?.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
  if(!client){state.err0='Reference service is unavailable.';return}
  const [ai,review]=await Promise.allSettled([client.rpc('tx_ai_item',{p_item:itemId}),client.rpc('tx_review_detail',{p_item:itemId})]);
  const a=ai.status==='fulfilled'?ai.value:null,r=review.status==='fulfilled'?review.value:null;
  if(a&&!a.error&&Array.isArray(a.data?.draft?.segments))state.l0=a.data.draft.segments;
  else state.err0=a?.error?.message||'AI-original transcript is not available.';
  if(r&&!r.error&&Array.isArray(r.data?.original_segments))state.l1=r.data.original_segments;
  else state.err1=r?.error?.message||'L1 submission is not available yet.';
  state.ready=true;
 })().finally(()=>{state.busy=false;state.load=null});
 await state.load;
}
async function enable(on){
 state.on=Boolean(on);
 root.classList.toggle('txr-change-mode',state.on);
 toggle.setAttribute('aria-pressed',String(state.on));
 bar.hidden=!state.on;preview.hidden=!state.on;
 if(!state.on)return;
 options();
 if(!state.ready){try{await load()}catch(e){message('Unable to load changes: '+e.message)}
  if(!state.on)return;options()}
 state.rendered='';render();
}
toggle.addEventListener('click',()=>void enable(!state.on));
select.addEventListener('change',()=>{state.base=select.value;state.rendered='';render()});
$('txrChangeEdit').addEventListener('click',()=>void enable(false));
$('txrChangeDetailed').addEventListener('click',()=>detailed?.click());
const table=$('segmentRows');
table?.addEventListener('input',schedule);table?.addEventListener('change',schedule);
if(table)new MutationObserver(schedule).observe(table,{childList:true});
window.addEventListener('txv2:review-submitted',()=>{state.ready=false;state.l1=null;state.rendered='';if(state.on)void enable(true)});
window.addEventListener('pagehide',()=>{clearTimeout(state.timer);if(state.raf)cancelAnimationFrame(state.raf)},{once:true});
})();