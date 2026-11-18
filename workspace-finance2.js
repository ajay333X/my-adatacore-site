(()=>{
'use strict';
if(window.__finance2ContributorEarnings)return;
window.__finance2ContributorEarnings=true;
if(!window.supabase?.createClient)return;
const db=window.supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',{auth:{persistSession:true,autoRefreshToken:true}});
const fmt=(n,c)=>{try{return new Intl.NumberFormat(undefined,{style:'currency',currency:c||'USD'}).format(Number(n||0))}catch(_){return String(c||'')+' '+Number(n||0).toFixed(2)}};
function mount(){
 const view=document.getElementById('view-earnings');
 if(!view||document.getElementById('finance2ContributorSection'))return false;
 const section=document.createElement('section');section.id='finance2ContributorSection';section.className='balance-ledger';
 section.innerHTML='<div class="section-title"><div><div class="eyebrow">Special compensation</div><h2>Payment exceptions</h2><div class="page-sub">Compensation authorized independently of task approval. These records are separate from your regular available balance.</div></div><button class="btn btn-secondary" id="finance2ContributorRefresh">Refresh</button></div><div class="card" style="padding:15px 18px"><div id="finance2ContributorList">Loading compensation exceptions…</div></div>';
 view.appendChild(section);
 section.querySelector('#finance2ContributorRefresh').addEventListener('click',load);
 return true;
}
async function load(){
 mount();
 const target=document.getElementById('finance2ContributorList');if(!target)return;
 target.textContent='Loading compensation exceptions…';
 try{
  const {data,error}=await db.rpc('finance2_my_exceptions');
  if(error)throw Error(error.message);
  const items=Array.isArray(data)?data:[];
  if(!items.length){target.textContent='No additional compensation exceptions have been authorized.';return}
  const wrapper=document.createElement('div');wrapper.style.cssText='display:grid;gap:9px';
  items.forEach(x=>{
   const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-bottom:1px solid var(--line);padding:12px 0;font-size:12px';
   const left=document.createElement('div');
   const name=document.createElement('strong');name.textContent=x.project||'Project';
   const details=document.createElement('div');details.style.cssText='color:var(--muted);margin-top:3px';
   details.textContent='Submission #'+Number(x.submission_id)+' · '+x.state;
   left.append(name,details);
   const right=document.createElement('div');right.style.textAlign='right';
   const value=document.createElement('strong');value.textContent=fmt(x.amount,x.currency);
   const status=document.createElement('div');status.style.cssText='color:var(--muted);margin-top:3px;font-size:10px';
   status.textContent=x.paid_at?'Manually paid · '+new Date(x.paid_at).toLocaleDateString():(x.state==='eligible'?'Eligible — awaiting external payout':'Not payable yet');
   right.append(value,status);row.append(left,right);wrapper.append(row);
  });target.replaceChildren(wrapper);
 }catch(e){target.textContent='Unable to retrieve payment exceptions: '+e.message}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{mount();load()});else{mount();load()}
})();