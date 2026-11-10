(()=>{'use strict';if(window.AdatacoreLint)return;
const item=new URLSearchParams(location.search).get('item');if(!item)return;
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',{auth:{persistSession:true,autoRefreshToken:true}});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let panel=null;
function mount(){
 if(panel)return;const card=document.querySelector('.segment-card'),bar=card?.querySelector('.player-bar');if(!card||!bar)return;
 const btn=document.createElement('button');btn.type='button';btn.id='runProjectLinter';btn.textContent='Project linter';btn.title='Check your latest saved transcript against the rules attached to this project';bar.insertBefore(btn,document.getElementById('save'));
 panel=document.createElement('section');panel.id='projectLintResults';panel.hidden=true;panel.setAttribute('role','status');panel.setAttribute('aria-live','polite');panel.style.cssText='margin:12px 14px;border:1px solid #e6d3a6;border-radius:10px;padding:14px;background:#fffbf0;color:#372d20;font-size:12px;line-height:1.5';
 bar.after(panel);
 btn.addEventListener('click',async()=>{
 btn.disabled=true;btn.textContent='Checking…';
 try{
  const current=window.txLinterCurrent?.(),issues=[];
  if(current?.projectId&&Array.isArray(current.segments)){
   const batches=[];let chunk=[],bytes=0,start=0;
   for(let i=0;i<current.segments.length;i++){
    const segment=current.segments[i],n=String(segment.transcript||'').length;
    if(chunk.length&&(chunk.length>=60||bytes+n>115000)){batches.push({start,segments:chunk});start=i;chunk=[];bytes=0;}
    chunk.push(segment);bytes+=n;
   }
   if(chunk.length)batches.push({start,segments:chunk});
   for(const batch of batches){
    const r=await db.rpc('linter_validate_texts',{p_project:current.projectId,p_segments:batch.segments});
    if(r.error)throw Error(r.error.message);
    for(const x of r.data||[])issues.push({...x,segment:Number(x.segment||0)+batch.start});
   }
  }else{
   const r=await db.rpc('linter_check_item',{p_item:item});
   if(r.error)throw Error(r.error.message);
   issues.push(...r.data||[]);
  }
  show(issues);
 }catch(e){show([{severity:'warn',code:'CHECK_FAILED',segment:'—',message:e.message}])}
 finally{btn.disabled=false;btn.textContent='Project linter'}
});
}
function show(issues){
 if(!panel)mount();if(!panel)return;
 const blocked=issues.filter(x=>x.severity==='block').length;
 panel.hidden=false;panel.style.background=blocked?'#fff0f2':'#fffbf0';panel.style.borderColor=blocked?'#efc4cc':'#e6d3a6';
 panel.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><strong>'+(blocked?blocked+' blocking issue(s)':'Project linter')+'</strong><button type="button" id="closeProjectLint" style="border:0;background:transparent;cursor:pointer;color:inherit">Close ✕</button></div>'+
 (!issues.length?'<p style="margin:9px 0 0">✓ No issues found in the saved draft under the currently attached rules.</p>':
 '<div style="margin-top:9px;max-height:220px;overflow:auto">'+issues.slice(0,100).map(x=>'<div style="padding:6px 0;border-top:1px solid #00000010"><b>'+(x.severity==='block'?'Block':'Warn')+' · Segment '+esc(x.segment)+'</b> — '+esc(x.message)+'</div>').join('')+(issues.length>100?'<p>More issues omitted from display.</p>':'')+'</div>');
 panel.querySelector('#closeProjectLint').onclick=()=>panel.hidden=true;
 panel.scrollIntoView({block:'nearest',behavior:'smooth'});
}
window.AdatacoreLint={show,mount};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();