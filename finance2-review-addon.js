(()=>{
'use strict';
if(window.__adatacoreFinanceReviewAddon)return;
window.__adatacoreFinanceReviewAddon=true;
if(!window.supabase?.createClient)return;
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',{auth:{persistSession:true,autoRefreshToken:true}});
function mount(){
 const detail=document.getElementById('detail'), title=document.getElementById('detailTitle');
 const card=detail?.querySelector('.decision-card');
 if(!detail||!title||!card||document.getElementById('finance2ReviewPanel'))return;
 const root=document.createElement('section');root.id='finance2ReviewPanel';
 root.style.cssText='margin-top:14px;padding-top:13px;border-top:1px solid #dfe4eb';
 const heading=document.createElement('h3');heading.textContent='Compensation recommendation';heading.style.cssText='font-size:12px;margin:0 0 7px';
 const info=document.createElement('p');info.textContent='Payment eligibility is independent of task approval. Your recommendation does not transfer money.';
 const select=document.createElement('select');select.className='input2';select.style.cssText='width:100%;margin:6px 0';
 for(const [value,label] of [['eligible','Pay despite rejection'],['hold','Hold for finance review'],['exclude','Not eligible for payment']]){const opt=document.createElement('option');opt.value=value;opt.textContent=label;select.append(opt)}
 const reason=document.createElement('textarea');reason.className='input2';reason.rows=3;reason.style.cssText='width:100%;height:80px;padding:10px;margin:4px 0';
 reason.placeholder='Reason required (minimum 5 characters)';
 const button=document.createElement('button');button.type='button';button.className='btn2';button.style.cssText='width:100%;background:#181d32;color:white';
 button.textContent='Save payment recommendation';
 const message=document.createElement('p');message.style.cssText='font-size:10px;min-height:14px;color:#465979';
 const link=document.createElement('a');link.textContent='Open finance authorization';link.style.cssText='font-size:10px;color:#5540ac;display:block;margin-top:8px';
 function update(){
  const found=title.textContent.match(/Submission\s*#(\d+)/i);
  if(found)link.href='/admin/finance-2?submission='+encodeURIComponent(found[1]);
  else link.removeAttribute('href');
  button.disabled=!found;root.style.display=detail.classList.contains('active')?'block':'none';
 }
 button.addEventListener('click',async()=>{
  const found=title.textContent.match(/Submission\s*#(\d+)/i);
  const text=reason.value.trim();
  if(!found){message.textContent='No submission selected.';return}
  if(text.length<5){message.textContent='Please provide a meaningful reason.';return}
  button.disabled=true;
  try{
   const {error}=await db.rpc('finance2_recommend',{p_submission_id:Number(found[1]),p_decision:select.value,p_reason:text});
   if(error)throw Error(error.message);
   message.textContent='Recommendation recorded. Finance authorization remains separate.';
  }catch(e){message.textContent='Not saved: '+e.message}finally{button.disabled=false}
 });
 root.append(heading,info,select,reason,button,message,link);card.append(root);
 new MutationObserver(update).observe(title,{childList:true,subtree:true});
 new MutationObserver(update).observe(detail,{attributes:true,attributeFilter:['class']});
 update();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
