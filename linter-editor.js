(()=>{
'use strict';
if(window.__acInlineLinter)return;window.__acInlineLinter=true;
const task=new URLSearchParams(location.search).get('item');
const rows=document.getElementById('segmentRows');
if(!task||!rows)return;
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const markPattern=/<[^>]+>|\{[^}]*\}|\[[^\]]+\]/gu;
let runtime=null,items=[],snapshot=null,badge=null,panel=null,opened=false,pending=false,loadError='',t=null,painting=false;
const style=document.createElement('style');
style.textContent=[
'#acLintCount{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;padding:8px 11px;min-height:35px;font:700 12px Inter,system-ui,sans-serif;border-radius:8px;border:1px solid #dfe3ea;background:#f5f7fa;color:#566277}',
'#acLintCount.ac-lint-bad{background:#fff1f2;color:#ad3042;border-color:#f5c0c9}#acLintCount.ac-lint-warn{background:#fffaed;color:#8d681b;border-color:#ecdaab}#acLintCount.ac-lint-good{background:#eefbf5;color:#17744e;border-color:#c9ebd9}',
'#acLintCount .ac-dot{display:inline-block;height:7px;width:7px;flex:none;border-radius:50%;background:currentColor}',
'#acLintPanel{background:#fff;border:1px solid #e2e6ee;border-radius:11px;margin:9px 14px 13px;overflow:hidden;color:#263145;box-shadow:0 6px 19px #1d2a4608}#acLintPanel[hidden]{display:none!important}',
'.ac-lint-top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #edf0f4}.ac-lint-top strong{display:block;font-size:13px}.ac-lint-top small{display:block;font-size:11px;color:#7b8695;margin-top:4px}',
'.ac-lint-top button,.ac-lint-actions button{font-size:11px;border:1px solid #dfe4eb;border-radius:7px;background:#fff;color:#344054;padding:7px 10px;cursor:pointer}',
'.ac-lint-scroll{max-height:290px;overflow:auto;padding:0 16px}.ac-lint-issue{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:11px 0;border-bottom:1px solid #edf0f5}.ac-lint-issue:last-child{border-bottom:0}',
'.ac-lint-issue span{font-size:10px;color:#9c2b40;font-weight:800}.ac-lint-issue span.warn{color:#9a7424}.ac-lint-issue p{font-size:12px;line-height:1.5;margin:5px 0;color:#3b4659}.ac-lint-issue small{font-size:11px;color:#808a99}.ac-lint-actions{display:flex;gap:7px;flex-shrink:0;flex-wrap:wrap}',
'.ac-lint-actions button[data-ac-act=fix]{background:#313c55;color:#fff;border-color:#313c55}.ac-lint-empty{padding:16px;font-size:12px;line-height:1.7;color:#657186}.ac-lint-empty a{color:#3e62af;text-decoration:underline}',
'.ac-lint-row-error{background:rgba(220,58,74,.025)}.ac-lint-row-warning{background:rgba(216,164,66,.025)}.ac-lint-row-note{font-size:11px;color:#bc374d;margin-top:5px;line-height:1.5}.ac-lint-row-note.warn{color:#a2782b}',
'.v2-caption-piece.ac-lint-has-error{outline:1px solid rgba(221,70,83,.27)}.v2-caption-piece.ac-lint-has-warning{outline:1px solid rgba(212,155,39,.26)}',
'::highlight(ac-lint-error){text-decoration:underline wavy #d7354b;text-decoration-thickness:1.5px;background-color:rgba(221,53,75,.12)}::highlight(ac-lint-warning){text-decoration:underline dotted #d9a02d;background-color:rgba(230,174,57,.12)}',
'@media(max-width:740px){#acLintPanel{margin:8px}.ac-lint-issue{flex-direction:column}.ac-lint-actions{width:100%}#acLintCount{font-size:11px}}'
].join('\n');
document.head.append(style);
function mask(s){return s.replace(markPattern,m=>'¤'.repeat(m.length))}
function plain(s){let out='',offset=[];for(let i=0;i<s.length;){markPattern.lastIndex=i;const m=markPattern.exec(s);if(m&&m.index===i){i+=m[0].length;continue}out+=s[i];offset.push(i);i++}return{out,offset}}
function effectiveRules(){
 const map=new Map();for(const r of runtime?.rules||[]){if(!r.enabled)continue;const k=r.id||r.code;if(!map.has(k)||(r.severity==='block'&&map.get(k).severity!=='block'))map.set(k,r)}
 return [...map.values()];
}
function message(r,term){
 switch(r.code){
 case 'DOUBLE_SPACE':return 'Double spaces are not allowed in text.';
 case 'SPACE_BEFORE_PUNCT':return 'Remove the space before punctuation.';
 case 'NO_SPACE_AFTER_DANDA':return 'A space is required after sentence punctuation.';
 case 'NO_SPACE_AFTER_COMMA':return 'A space is required after the comma.';
 case 'TRIM_EDGES':return 'Remove leading or trailing whitespace.';
 case 'REPEATED_PUNCT':return 'Review repeated punctuation against the audio.';
 case 'INVISIBLE_CHAR':return 'Remove an invisible character.';
 case 'SPACE_INSIDE_BRACKETS':return 'Check unnecessary spaces inside parentheses.';
 case 'FORBIDDEN_TEXT':case 'FORBIDDEN_TERMS':return 'Disallowed text: '+term;
 case 'SPELLING_REPLACEMENT':return 'Review spelling: '+term+' → '+(r.replacement||'')+'. Verify against the audio.';
 case 'REQUIRED_TEXT':return 'Required text is missing: '+term;
 case 'MAX_LENGTH':return 'Segment exceeds '+r.limit+' characters.';
 default:return r.label||r.code;
 }
}
function scan(s,index,r){
 const text=String(s.transcript||''),m=mask(text),p=plain(text),result=[];
 const add=(a,b,fix=null,msg=null)=>{
  if(result.length>=50)return;
  result.push({segment:index+1,id:s.id,code:r.code,label:r.label||r.code,severity:r.severity==='block'?'block':'warn',
   start:a,end:b,expected:a>=0?text.slice(a,b):'',fix,message:msg||message(r,String(r.term||''))});
 };
 const matches=(re,change)=>{
  for(const hit of m.matchAll(re)){const a=hit.index,b=a+hit[0].length;add(a,b,change?change(text.slice(a,b)):null)}
 };
 if(r.code==='DOUBLE_SPACE')matches(/ {2,}/g,()=> ' ');
 else if(r.code==='SPACE_BEFORE_PUNCT')matches(/[ \t]+[।॥,!?;:.]/gu,x=>x.slice(-1));
 else if(r.code==='NO_SPACE_AFTER_DANDA')matches(/[।॥](?=[\p{L}\p{N}])|[!?;](?=\p{L})|\.(?=[\u0900-\u097f])/gu,x=>x+' ');
 else if(r.code==='NO_SPACE_AFTER_COMMA')matches(/,(?=\p{L})/gu,x=>x+' ');
 else if(r.code==='TRIM_EDGES'){
  const first=m.match(/^\s+/u),last=m.match(/\s+$/u);if(first)add(0,first[0].length,'');
  if(last&&last.index!==first?.index)add(last.index,last.index+last[0].length,'');
 }else if(r.code==='REPEATED_PUNCT')matches(/([,!?।॥])\1/gu);
 else if(r.code==='INVISIBLE_CHAR')matches(/[\u200b\ufeff]/gu,()=> '');
 else if(r.code==='SPACE_INSIDE_BRACKETS')matches(/\([ \t]+|[ \t]+\)/gu,x=>x.trim());
 else if(r.code==='MAX_LENGTH'){
  const limit=Number(r.limit)||20000;
  if([...p.out].length>limit){const at=p.offset[Math.min(limit,p.offset.length-1)]||0;add(at,Math.min(text.length,at+25))}
 }else if(r.code==='REQUIRED_TEXT'){
  const term=String(r.term||'');if(term&&!p.out.toLocaleLowerCase().includes(term.toLocaleLowerCase()))add(-1,-1,null,message(r,term));
 }else if(['FORBIDDEN_TEXT','FORBIDDEN_TERMS','SPELLING_REPLACEMENT'].includes(r.code)){
  const terms=r.code==='FORBIDDEN_TERMS'?(Array.isArray(r.terms)?r.terms:[]):[r.term];
  for(const term of terms){if(!term)continue;const target=r.case_sensitive?p.out:p.out.toLocaleLowerCase(),needle=r.case_sensitive?String(term):String(term).toLocaleLowerCase();let pos=0;
   for(let hit;(hit=target.indexOf(needle,pos))>=0&&result.length<50;){
    const a=p.offset[hit]??0,b=(p.offset[hit+needle.length-1]??a)+1,contiguous=b-a===needle.length;
    add(contiguous?a:-1,contiguous?b:-1,r.code==='SPELLING_REPLACEMENT'&&contiguous?String(r.replacement||''):null,message(r,String(term)));
    pos=hit+Math.max(1,needle.length);
   }
  }
 }
 return result;
}
function calculate(){
 const current=window.txLinterCurrent?.();
 if(!current?.projectId)return;
 snapshot=current;
 if(!runtime||Number(runtime.project_id)!==current.projectId){if(!pending)load();return}
 items=[];
 if(runtime.enabled){const rules=effectiveRules();for(let i=0;i<current.segments.length;i++)for(const rule of rules)items.push(...scan(current.segments[i],i,rule))}
 items.sort((a,b)=>a.segment-b.segment||a.start-b.start);
 paintBadge();
 if(opened)paintPanel();
 schedulePaint();
}
function schedule(){clearTimeout(t);t=setTimeout(calculate,120)}
async function load(){
 if(pending)return;
 const current=window.txLinterCurrent?.();if(!current?.projectId)return;
 pending=true;loadError='';
 try{
  const {data,error}=await db.rpc('linter_project_runtime',{p_item:task});
  if(error)throw Error(error.message);
  if(Number(data.project_id)!==current.projectId)throw Error('Task project changed. Reload this page.');
  runtime=data;
 }catch(e){loadError=e.message;runtime=null}
 finally{pending=false;paintBadge();if(opened)paintPanel();if(runtime)calculate()}
}
function paintBadge(){
 if(!badge)return;
 const errors=items.filter(i=>i.severity==='block').length,warnings=items.length-errors;
 badge.className=errors?'ac-lint-bad':warnings?'ac-lint-warn':runtime?.enabled?'ac-lint-good':'';
 badge.querySelector('.ac-label').textContent=loadError?'Linter unavailable':pending&&!runtime?'Loading linter…':!runtime?.enabled?'Project linter off':errors?errors+' error'+(errors===1?'':'s')+(warnings?' · '+warnings+' warnings':''):warnings?warnings+' warning'+(warnings===1?'':'s'):'No issues';
 badge.title=loadError||(!runtime?.enabled?'No linter attached to this project':'Show project linter results');
 badge.setAttribute('aria-expanded',String(opened));
}
function paintPanel(){
 if(!panel)return;panel.hidden=!opened;if(!opened)return;
 const title=runtime?.enabled?'Project Linter · '+items.length+' issues':'Project Linter is not configured';
 let html='<div class="ac-lint-top"><div><strong>'+esc(title)+'</strong><small>'+esc((runtime?.profiles||[]).map(p=>p.name).join(' · ')||'Project-level validation')+'</small></div><button data-ac-act="close" type="button">Close ✕</button></div>';
 if(loadError)html+='<div class="ac-lint-empty" role="alert">'+esc(loadError)+'</div>';
 else if(!runtime?.enabled)html+='<div class="ac-lint-empty">No linter is attached to this project. Activate a profile under <a href="/admin/project-lab?project='+Number(snapshot?.projectId||runtime?.project_id||0)+'#ac-linters">Project Lab → Linters</a> to start live text checks. Existing structural validation remains active.</div>';
 else if(!items.length)html+='<div class="ac-lint-empty">✓ All '+effectiveRules().length+' active project rules pass. Continue reviewing the audio and word accuracy.</div>';
 else {
  html+='<div class="ac-lint-scroll">';
  html+=items.slice(0,80).map((x,i)=>'<div class="ac-lint-issue"><div><span class="'+(x.severity==='warn'?'warn':'')+'">'+(x.severity==='block'?'ERROR':'WARNING')+' · Line '+x.segment+'</span><p>'+esc(x.message)+'</p>'+(x.expected?'<small>Found: '+esc(x.expected.slice(0,80))+'</small>':'')+'</div><div class="ac-lint-actions"><button data-ac-act="jump" data-index="'+i+'" type="button">Go to line</button>'+(x.fix!==null&&x.start>=0?'<button data-ac-act="fix" data-index="'+i+'" type="button">'+(x.code==='DOUBLE_SPACE'?'Use single spaces':x.code==='SPELLING_REPLACEMENT'?'Apply suggestion':'Fix')+'</button>':'')+'</div></div>').join('');
  if(items.length>80)html+='<div class="ac-lint-empty">Showing first 80 of '+items.length+' issues.</div>';
  html+='</div>';
 }
 panel.innerHTML=html;
}
function jump(x){
 if(!x.id)return;
 const selector='tr[data-segment="'+CSS.escape(x.id)+'"]';
 let row=rows.querySelector(selector);
 if(!row){for(const id of ['speakerFilter','textSearch']){const input=$(id);if(input&&input.value){input.value='';input.dispatchEvent(new Event(id==='textSearch'?'input':'change',{bubbles:true}))}}row=rows.querySelector(selector)}
 const flow=$('v2CaptionFlow'),piece=flow?.querySelector('[data-edit-segment="'+CSS.escape(x.id)+'"]');
 if(piece&&!piece.isContentEditable)piece.click();
 const field=row?.querySelector('textarea[data-field="transcript"]');
 (piece||field)?.scrollIntoView({block:'center',behavior:'smooth'});
 if(!piece&&field){field.focus({preventScroll:true});if(x.start>=0)field.setSelectionRange(x.start,x.end)}
}
function onPanelClick(e){
 const btn=e.target.closest('[data-ac-act]');if(!btn)return;
 if(btn.dataset.acAct==='close'){opened=false;paintPanel();paintBadge();return}
 const x=items[Number(btn.dataset.index)];if(!x)return;
 if(btn.dataset.acAct==='jump')jump(x);
 else if(btn.dataset.acAct==='fix'&&x.fix!==null){
  if(x.code==='SPELLING_REPLACEMENT'&&!confirm('Apply this suggested spelling? Verify the word against audio first.'))return;
  if(window.txLinterApplyFix?.({segmentId:x.id,start:x.start,end:x.end,expected:x.expected,replacement:x.fix})){calculate();paintPanel()}
 }
}
function rangeFor(node,start,end){
 if(start<0||end<=start)return null;
 const nodes=[],walk=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let cursor=0,n;
 while((n=walk.nextNode())){nodes.push({node:n,from:cursor,to:cursor+n.textContent.length});cursor+=n.textContent.length}
 if(end>cursor)return null;
 const a=nodes.find(x=>x.from<=start&&x.to>start),b=nodes.find(x=>x.from<end&&x.to>=end);
 if(!a||!b)return null;
 const r=document.createRange();r.setStart(a.node,start-a.from);r.setEnd(b.node,end-b.from);return r;
}
function schedulePaint(){if(painting)return;painting=true;requestAnimationFrame(()=>{painting=false;paintMarks()})}
function paintMarks(){
 for(const row of rows.querySelectorAll('tr[data-segment]')){
  const own=items.filter(x=>x.id===row.dataset.segment),bad=own.some(x=>x.severity==='block'),field=row.querySelector('textarea[data-field="transcript"]');
  row.classList.toggle('ac-lint-row-error',bad);row.classList.toggle('ac-lint-row-warning',!bad&&own.length>0);
  let note=field?.parentElement.querySelector('.ac-lint-row-note');
  if(!own.length){note?.remove();continue}
  if(!note){note=document.createElement('div');note.className='ac-lint-row-note';field.parentElement.append(note)}
  note.classList.toggle('warn',!bad);note.textContent=own.length+' issue'+(own.length===1?'':'s')+': '+own[0].message;
 }
 const flow=$('v2CaptionFlow'),errors=[],warnings=[];
 for(const piece of flow?.querySelectorAll('[data-edit-segment]')||[]){
  const own=items.filter(x=>x.id===piece.dataset.editSegment),bad=own.some(x=>x.severity==='block');
  piece.classList.toggle('ac-lint-has-error',bad);piece.classList.toggle('ac-lint-has-warning',!bad&&own.length>0);
  if(own.length)piece.title=own[0].message;else piece.removeAttribute('title');
  for(const issue of own.slice(0,20)){const range=rangeFor(piece,issue.start,issue.end);if(range)(issue.severity==='block'?errors:warnings).push(range)}
 }
 if(globalThis.CSS?.highlights&&globalThis.Highlight){
  CSS.highlights.delete('ac-lint-error');CSS.highlights.delete('ac-lint-warning');
  if(errors.length)CSS.highlights.set('ac-lint-error',new Highlight(...errors.slice(0,180)));
  if(warnings.length)CSS.highlights.set('ac-lint-warning',new Highlight(...warnings.slice(0,180)));
 }
}
function appendPreflight(){
 const dlg=$('v2PreflightDialog'),list=$('v2PreflightList');
 if(!runtime?.enabled||!dlg?.open||!list||list.querySelector('[data-ac-lint-preflight]'))return;
 const section=document.createElement('section');section.dataset.acLintPreflight='1';section.className='v2-check-group';
 const h=document.createElement('h3');const blocking=items.filter(x=>x.severity==='block').length;
 h.textContent='Project Linter · '+blocking+' blocking errors';section.append(h);
 for(const x of items.slice(0,20)){const p=document.createElement('p');p.textContent='Line '+x.segment+': '+x.message;section.append(p)}
 if(!items.length){const p=document.createElement('p');p.textContent='No text issues found.';section.append(p)}
 list.append(section);
 const foot=dlg.querySelector('.v2-preflight-footnote');if(foot)foot.textContent='Blocking project linter errors must be corrected before submission or approval.';
 if(blocking&&!snapshot?.reviewer){$('v2PreflightContinue').disabled=true;$('v2PreflightContinue').textContent='Fix linter errors first'}
}
function show(authoritative){
 calculate();
 for(const issue of authoritative||[]){
  if(!items.some(x=>x.segment===Number(issue.segment)&&x.code===issue.code))
   items.push({segment:Number(issue.segment)||1,id:snapshot?.segments[Number(issue.segment)-1]?.id||'',code:issue.code,severity:issue.severity,label:issue.code,message:issue.message,start:-1,end:-1,expected:'',fix:null});
 }
 opened=true;paintBadge();paintPanel();schedulePaint();panel?.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function mount(){
 if(badge)return;
 const bar=document.querySelector('.segment-card .player-bar'),save=$('save');if(!bar||!save)return;
 badge=document.createElement('button');badge.type='button';badge.id='acLintCount';badge.setAttribute('aria-controls','acLintPanel');
 badge.innerHTML='<span class="ac-dot"></span><span class="ac-label">Loading linter…</span>';save.before(badge);
 panel=document.createElement('section');panel.id='acLintPanel';panel.setAttribute('role','region');panel.setAttribute('aria-label','Project linter issues');panel.hidden=true;bar.after(panel);
 badge.addEventListener('click',()=>{opened=!opened;paintPanel();paintBadge();if(opened)panel.scrollIntoView({block:'nearest',behavior:'smooth'})});
 panel.addEventListener('click',onPanelClick);rows.addEventListener('input',schedule);
 new MutationObserver(()=>{schedulePaint();if(!runtime)schedule()}).observe(rows,{childList:true});
 if($('v2CaptionFlow'))new MutationObserver(schedulePaint).observe($('v2CaptionFlow'),{childList:true,subtree:true,characterData:true});
 window.addEventListener('tx:linter-change',schedule);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&snapshot?.projectId)load()});
 document.addEventListener('click',e=>{if(e.target.closest?.('#v2CheckQuality,#submit'))setTimeout(appendPreflight,0)},true);
 paintBadge();
 let attempts=0;const interval=setInterval(()=>{const current=window.txLinterCurrent?.();if(current?.projectId){clearInterval(interval);load()}else if(++attempts>=120){clearInterval(interval);loadError='Task data not loaded';paintBadge()}},100);
}
window.AdatacoreLint={show,mount,refresh:load,issues:()=>items.slice()};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();