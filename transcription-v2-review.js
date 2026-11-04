(()=>{
'use strict';
// Reviewer presentation only. The original waveform, transcript editor,
// autosave, validation and submission controls stay authoritative.
const $=id=>document.getElementById(id),itemId=new URLSearchParams(location.search).get('item');
if(!document.body.classList.contains('tx-v2-editor')||!$('v2ReviewDetailDialog')||!itemId)return;
const db=window.supabase?.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
const modal=$('v2ReviewDetailDialog'),rows=$('v2ReviewDiffRows'),select=$('v2ReviewSelect'),basis=$('v2DiffBasis'),feedback=$('v2ReviewWrittenFeedback'),score=$('v2ReviewScoreSummary');
const keys=[['accuracy','Word accuracy'],['timing','Timing / alignment'],['tags','Tags / annotations'],['formatting','Formatting'],['overall','Overall']];
const create=(type,cls,text)=>{const el=document.createElement(type);if(cls)el.className=cls;if(text!==undefined)el.textContent=String(text);return el};
const snapshot=()=>window.txV2Snapshot?.()||null;
const reviewer=()=>{const s=snapshot();return Boolean(s&&(s.mode==='reviewer'||s.mode==='admin'&&['submitted','in_review'].includes(s.status)))};
const request=async(name,args)=>{
 if(!db)throw Error('Secure review service is not available');
 const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data;
};
let detail=null,opening=false,lastReviewId=null,autoRequested=false;
window.txV2ReviewRatings=()=>{
 const controls=[...$('v2ReviewRatings').querySelectorAll('[data-review-rating]')],ratings={};
 if(controls.length!==5)throw Error('Quality ratings are not loaded. Please refresh.');
 for(const el of controls){
  const n=Number(el.value);
  if(!Number.isInteger(n)||n<1||n>5){
   el.focus();
   throw Error('Please select all five quality ratings before submitting the review.');
  }
  ratings[el.dataset.reviewRating]=n;
 }
 return ratings;
};
function updateMode(){
 const s=snapshot();if(!s?.project_id)return;
 const isReviewer=reviewer(),rated=$('v2ReviewRatings');
 rated.hidden=!isReviewer;
 const open=$('v2ReviewFeedbackOpen');
 const allow=Boolean(isReviewer&&s.editable);
 open.hidden=!allow&&!detail?.reviews?.length;
 open.textContent=allow?'✎ Feedback':'✉ View feedback';
 $('v2ReviewDiffOpen').hidden=false;
 $('v2ReviewDiffOpen').textContent=isReviewer?'⇄ Diff view · L1 vs L2':'⇄ Diff view';
 const note=$('reviewDescription');
 if(isReviewer&&note)note.textContent='Verify the original L1 work, compare your edits, rate each category and submit your decision.';
}
function tokenize(s){return String(s||'').trim().split(/\s+/u).filter(Boolean)}
function markedWords(el,other,sameSide,asRemove){
 const own=tokenize(sameSide),opp=tokenize(other);
 if(sameSide===other){el.textContent=sameSide||'—';return}
 if(!own.length){el.append(create('em','v2review-empty','Not present in this version'));return}
 if(own.length>180||opp.length>180){
  const mark=create('mark',asRemove?'v2review-removed':'v2review-added',sameSide);
  el.append(mark);return;
 }
 const m=own.length,n=opp.length,dp=Array.from({length:m+1},()=>new Uint16Array(n+1));
 for(let i=m-1;i>=0;i--)for(let j=n-1;j>=0;j--){
  dp[i][j]=own[i]===opp[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
 }
 const keep=new Set();let i=0,j=0;
 while(i<m&&j<n){
  if(own[i]===opp[j]){keep.add(i);i++;j++}
  else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;
 }
 own.forEach((token,k)=>{
  if(k)el.append(document.createTextNode(' '));
  if(keep.has(k))el.append(document.createTextNode(token));
  else el.append(create('mark',asRemove?'v2review-removed':'v2review-added',token));
 });
}
function segmentsDiff(before,after){
 const original=Array.isArray(before)?before:[],revised=Array.isArray(after)?after:[];
 const a=new Map(original.map((s,i)=>[String(s.id||'old-'+i),s]));
 const b=new Map(revised.map((s,i)=>[String(s.id||'new-'+i),s]));
 const ids=[...new Set([...a.keys(),...b.keys()])];
 const result=ids.map(id=>{
  const old=a.get(id)||null,now=b.get(id)||null;
  const changed=!old||!now||String(old.transcript||'')!==String(now.transcript||'')||
   Number(old.start_ms)!==Number(now.start_ms)||Number(old.end_ms)!==Number(now.end_ms)||
   String(old.speaker_id)!==String(now.speaker_id);
  return {id,old,now,changed,start:Math.min(Number(old?.start_ms??Infinity),Number(now?.start_ms??Infinity))};
 });
 result.sort((x,y)=>x.start-y.start||x.id.localeCompare(y.id));
 return result;
}
function time(ms){const x=Math.max(0,Number(ms)||0);return String(Math.floor(x/60000)).padStart(2,'0')+':'+String(Math.floor(x%60000/1000)).padStart(2,'0')}
function segmentMeta(s){return s?time(s.start_ms)+'–'+time(s.end_ms)+' · '+(s.speaker_label||s.speaker_id||'Speaker'):'—'}
function buildSide(s,other,label,remove){
 const side=create('div','v2review-side');
 side.append(create('div','v2review-side-label',label));
 const meta=create('small','v2review-time',segmentMeta(s));side.append(meta);
 const text=create('p','v2review-side-text');
 markedWords(text,other?.transcript||'',s?.transcript||'',remove);
 side.append(text);return side;
}
function selectedReview(){
 const id=Number(select.value);return (detail?.reviews||[]).find(x=>Number(x.history_id)===id)||null;
}
function scoreFeedback(r){
 score.replaceChildren();feedback.replaceChildren();
 if(!r){
  score.append(create('span','v2review-note','Current draft comparison · No review decision selected.'));
  return;
 }
 const state=r.decision==='approve'?'Approved':'Changes requested';
 const head=create('div','v2review-score-head');
 head.append(create('strong','',state),create('span','',new Date(r.reviewed_at).toLocaleString()));
 score.append(head);
 if(r.ratings&&Object.keys(r.ratings).length){
  const grid=create('div','v2review-score-grid');
  for(const [key,label] of keys)if(Number.isFinite(Number(r.ratings[key]))){
   const pill=create('div','v2review-score-pill');
   pill.append(create('small','',label),create('strong','',Number(r.ratings[key])+' / 5'));
   grid.append(pill);
  }
  score.append(grid);
 }else score.append(create('small','v2review-note','This review predates category ratings.'));
 const explanation=create('div','v2review-feedback-note');
 explanation.append(create('strong','','Reviewer feedback'));
 explanation.append(create('p','',r.feedback?.trim()||'No written feedback was provided.'));
 feedback.append(explanation);
 const s=snapshot();
 if(s?.mode==='contributor'&&!r.seen){
  void request('tx_mark_review_seen',{p_history_id:Number(r.history_id)}).then(()=>{
   r.seen=true;window.dispatchEvent(new Event('txv2:feedback-read'));
  }).catch(()=>{});
 }
}
function draw(){
 if(!detail)return;
 const r=selectedReview(),s=snapshot(),current=s?.segments||[];
 const useRecorded=basis.value==='review'&&Boolean(r);
 const original=useRecorded?(r.before_segments||detail.original_segments):detail.original_segments;
 const after=useRecorded?r.after_segments:current;
 const diff=segmentsDiff(original,after);
 const changed=diff.filter(x=>x.changed);
 $('v2ReviewDetailSub').textContent=
  (useRecorded?'L1 submission → recorded L2 review':'L1 submission → current editor')+
  ' · '+changed.length+' changed segment'+(changed.length===1?'':'s')+' of '+diff.length;
 scoreFeedback(r);
 rows.replaceChildren();
 const summary=create('div','v2review-diff-summary');
 summary.append(create('span','',changed.length+' changed'),create('span','',diff.length-changed.length+' unchanged'));
 rows.append(summary);
 if(!diff.length){rows.append(create('p','v2review-no-diff','There are no transcript segments to compare.'));return}
 let shown=0;
 for(const row of diff){
  if(!row.changed)continue;
  const section=create('section','v2review-diff-row');
  const header=create('div','v2review-diff-row-head');
  header.append(create('span','',!row.old?'Added segment':!row.now?'Removed segment':'Changed segment'),
    create('span','',time(row.start)));
  section.append(header);
  const cols=create('div','v2review-columns');
  cols.append(buildSide(row.old,row.now,'L1 submitted',true),
    buildSide(row.now,row.old,useRecorded?'L2 reviewed':'Current transcript',false));
  section.append(cols);rows.append(section);shown++;
 }
 if(!shown)rows.append(create('div','v2review-no-diff','No differences were found between these versions.'));
 const unchanged=diff.filter(x=>!x.changed);
 if(unchanged.length){
  const details=create('details','v2review-unchanged');
  details.append(create('summary','',unchanged.length+' unchanged segment'+(unchanged.length===1?'':'s')+' · Show'));
  for(const row of unchanged){
   const item=create('div','v2review-unchanged-item');
   item.append(create('small','',segmentMeta(row.old)),create('p','',row.old?.transcript||''));
   details.append(item);
  }
  rows.append(details);
 }
}
async function openDiff(preferred){
 if(opening)return;opening=true;
 $('v2ReviewDetailSub').textContent='Loading authenticated review history…';
 try{
  detail=await request('tx_review_detail',{p_item:itemId});
  select.replaceChildren();
  const reviews=Array.isArray(detail?.reviews)?detail.reviews:[];
  if(!reviews.length)select.append(create('option','','No reviews submitted yet'));
  for(const r of reviews){
   const option=create('option','',new Date(r.reviewed_at).toLocaleDateString()+' · '+
    (r.decision==='approve'?'Approved':'Corrections')+' · revision '+r.revision);
   option.value=String(r.history_id);select.append(option);
  }
  const requestId=Number(preferred)||Number(new URLSearchParams(location.search).get('review'));
  const pick=reviews.find(r=>Number(r.history_id)===requestId)||reviews[0]||null;
  if(pick)select.value=String(pick.history_id);
  basis.value=pick&&!reviewer()?'review':preferred?'review':'current';
  $('v2DiffBasis').querySelector('option[value="review"]').disabled=!pick;
  draw();
  if(!modal.open)modal.showModal();
  updateMode();
 }catch(e){
  $('v2ReviewDetailSub').textContent='Unable to load review history: '+e.message;
  if(!modal.open)modal.showModal();
 }finally{opening=false}
}
$('v2ReviewDiffOpen').addEventListener('click',()=>void openDiff());
$('v2ReviewFeedbackOpen').addEventListener('click',()=>{
 const s=snapshot();
 if(reviewer()&&s?.editable)$('submit')?.click();
 else void openDiff();
});
$('v2ReviewSelect').addEventListener('change',()=>{
 basis.querySelector('option[value="review"]').disabled=!selectedReview();
 draw();
});
$('v2DiffBasis').addEventListener('change',draw);
$('v2ReviewDetailClose').addEventListener('click',()=>modal.close());
$('v2ReviewDetailDone').addEventListener('click',()=>modal.close());
window.addEventListener('txv2:review-submitted',()=>{
 detail=null;
 updateMode();
});
let lastKey='';
const monitor=setInterval(()=>{
 const s=snapshot();
 if(!s?.project_id)return;
 const key=s.mode+':'+s.status+':'+String(s.editable);
 if(key!==lastKey){lastKey=key;updateMode()}
 if(!autoRequested&&new URLSearchParams(location.search).has('review')){
  autoRequested=true;void openDiff();
 }
},600);
window.addEventListener('pagehide',()=>clearInterval(monitor),{once:true});
updateMode();
})();
