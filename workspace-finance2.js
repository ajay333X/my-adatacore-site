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
 section.innerHTML='<div class="section-title"><div><div class="eyebrow">Automatic compensation</div><h2>Task earnings & eligibility</h2><div class="page-sub">See your earnings as soon as a valid submission qualifies under its project policy. Eligible earnings are not automatically transferred to your bank. Approved-task amounts also appear in the regular wallet.</div></div><button class="btn btn-secondary" id="finance2ContributorRefresh">Refresh</button></div><div class="card" style="padding:15px 18px"><div id="finance2Totals" style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:14px"></div><div id="finance2ContributorList">Loading task earnings…</div><div id="finance2ManualExceptions" style="margin-top:12px"></div></div>';
 view.appendChild(section);
 section.querySelector('#finance2ContributorRefresh').addEventListener('click',load);
 return true;
}
function row(item,description,status){
 const r=document.createElement('div');r.style.cssText='display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);font-size:12px';
 const left=document.createElement('div'),name=document.createElement('strong'),meta=document.createElement('div');
 name.textContent=item.project||'Project';meta.textContent=description;
 meta.style.cssText='color:var(--muted);margin-top:4px;font-size:10px';
 left.append(name,meta);
 const right=document.createElement('div');right.style.cssText='text-align:right';
 const amount=document.createElement('strong');amount.textContent=fmt(item.amount,item.currency);
 const note=document.createElement('div');note.textContent=status;note.style.cssText='color:var(--muted);margin-top:4px;font-size:10px';
 right.append(amount,note);r.append(left,right);return r;
}
async function load(){
 mount();
 const root=document.getElementById('finance2ContributorList');
 if(!root)return;
 root.textContent='Loading task earnings…';
 try{
  const [auto,exceptions,reviews]=await Promise.all([
   db.rpc('finance2_my_task_earnings',{p_limit:200}),
   db.rpc('finance2_my_exceptions'),
   db.rpc('finance2_my_review_earnings',{p_limit:200})
  ]);
  if(auto.error)throw Error(auto.error.message);
  if(exceptions.error)throw Error(exceptions.error.message);
  if(reviews.error)throw Error(reviews.error.message);
  const items=Array.isArray(auto.data)?auto.data:[],manual=Array.isArray(exceptions.data)?exceptions.data:[];
  const known=new Set(items.map(x=>x.submission_id));
  const totals={eligible:0,pending:0,legacy:0,paid:0};
  const holder=document.createElement('div');
  if(!items.length)holder.textContent='No automatic task earnings have been recorded yet. New submissions appear after a project compensation policy is activated.';
  for(const x of items){
   const quality=String(x.quality_status||'').toLowerCase();
   const amount=Number(x.amount||0);
   const state=x.eligibility||'pending';
   let status='';
   if(x.manual_paid_at){status='External manual payment recorded';totals.paid+=amount;}
   else if(quality==='approved'){status='Approved — included in existing wallet flow';totals.legacy+=amount;}
   else if(state==='eligible'){status='Earned · eligible for payout';totals.eligible+=amount;}
   else if(state==='pending'){status='Calculated · awaiting '+(x.trigger||'project policy');totals.pending+=amount;}
   else status='Payment '+state;
   const description='Task #'+x.task_id+' · '+x.role+' · '+Number(x.units||0).toFixed(3)+' units · rate version '+x.version;
   holder.append(row(x,description,status));
  }
  const l2=Array.isArray(reviews.data)?reviews.data:[];
  if(l2.length){
   const heading=document.createElement('h3');heading.textContent='L2 review earnings';heading.style.fontSize='12px';heading.style.margin='16px 0 7px';
   holder.append(heading);
   for(const x of l2){
    const amount=Number(x.amount||0);
    let status=x.eligibility==='eligible'?'Review completed · eligible for payout':'Calculated · awaiting finance policy';
    if(x.eligibility==='eligible')totals.eligible+=amount;
    else if(x.eligibility==='pending')totals.pending+=amount;
    holder.append(row(x,'L2 review · '+x.source+' · '+Number(x.units||0).toFixed(3)+' units · rate v'+x.rule_version,status));
   }
  }
  root.replaceChildren(holder);
  const boxes=document.getElementById('finance2Totals');boxes.replaceChildren();
  for(const [label,value] of [['Earned · eligible',totals.eligible],['Calculated · pending',totals.pending],['Approved in standard wallet',totals.legacy],['Paid externally',totals.paid]]){
   const card=document.createElement('div');card.style.cssText='flex:1 1 135px;background:var(--panel2);padding:12px;border-radius:10px';
   const small=document.createElement('div');small.style.cssText='font-size:9px;color:var(--muted)';small.textContent=label;
   const num=document.createElement('strong');num.style.cssText='display:block;font-size:17px;margin-top:4px';num.textContent=fmt(value,'USD');
   card.append(small,num);boxes.append(card);
  }
  const other=document.getElementById('finance2ManualExceptions');other.replaceChildren();
  const standalone=manual.filter(x=>!known.has(x.submission_id));
  if(standalone.length){
   const heading=document.createElement('h3');heading.textContent='Additional review payment exceptions';heading.style.fontSize='12px';other.append(heading);
   for(const e of standalone){other.append(row(e,'Submission #'+e.submission_id,
      e.paid_at?'Externally paid':e.state==='eligible'?'Eligible for payout':'Payment '+e.state));}
  }
 }catch(e){root.textContent='Unable to retrieve earnings: '+e.message}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{mount();load()});else{mount();load()}
})();