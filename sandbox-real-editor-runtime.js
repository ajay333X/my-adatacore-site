(()=>{'use strict';
const params=new URLSearchParams(location.search),sessionId=params.get('test_session')||'',claimId=params.get('item')||'';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if(!uuid.test(sessionId)||!uuid.test(claimId)){document.body.textContent='Invalid sandbox claim';return}
const banner=document.createElement('div');banner.id='sandboxRealBanner';
banner.innerHTML='<span><strong>TEST MODE</strong> · Real source audio · Isolated edits · Production task remains untouched</span><div><button type="button" id="sandboxRelease">Release / Undo claim</button><a href="/workspace?test_session='+encodeURIComponent(sessionId)+'">Back to test dashboard</a></div>';
document.body.prepend(banner);
document.body.classList.add('sandbox-real-editor');
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml',{auth:{persistSession:true,autoRefreshToken:true}});
async function call(name,args){const r=await db.rpc(name,args);if(r.error)throw Error(r.error.message);return r.data}
const goBack=()=>location.assign('/workspace?test_session='+encodeURIComponent(sessionId)+'#assignments');
document.getElementById('sandboxRelease').onclick=async()=>{
 if(!confirm('Release this test claim and discard its sandbox edits? The real task and its live queue will not change.'))return;
 const btn=document.getElementById('sandboxRelease');btn.disabled=true;btn.textContent='Releasing…';
 try{await call('admin_sandbox_real_release',{p_session_id:sessionId,p_claim_id:claimId});goBack()}
 catch(e){btn.disabled=false;btn.textContent='Release / Undo claim';alert(e.message)}
};
document.addEventListener('click',event=>{
 const link=event.target.closest?.('#backLink,.v2-brand');
 if(link){event.preventDefault();event.stopImmediatePropagation();goBack()}
},true);
async function boot(){
 await call('admin_sandbox_real_open',{p_session_id:sessionId,p_claim_id:claimId});
 const response=await fetch('/transcription-editor.js?v=9',{cache:'no-store'});
 if(!response.ok)throw Error('Production transcription editor unavailable');
 let source=await response.text();
 const original="async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data}";
 if(!source.includes(original))throw Error('Editor compatibility check failed; production editor changed.');
 const adapter=[
  "async function rpc(name,args){",
  " const common={p_session_id:"+JSON.stringify(sessionId)+",p_claim_id:itemId};",
  " if(name==='tx_open')return await sandboxCall('admin_sandbox_real_open',common);",
  " if(name==='tx_save')return await sandboxCall('admin_sandbox_real_save',{...common,p_revision:args.p_revision,p_segments:args.p_segments,p_speakers:args.p_speakers,p_duration_ms:args.p_duration_ms});",
  " if(name==='tx_submit'||name==='tx_review_submit')return await sandboxCall('admin_sandbox_real_submit',{...common,p_revision:args.p_revision,p_action:args.p_action,p_feedback:args.p_feedback,p_ratings:args.p_ratings||{}});",
  " if(name==='tx_ai_item')return {latest:null,draft:null};",
  " throw Error('Sandbox operation blocked: '+name);",
  "}",
  "async function sandboxCall(name,args){const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data}"
 ].join('\n');
 source=source.replace(original,adapter);
 const s=document.createElement('script');s.textContent=source;document.body.appendChild(s);
}
boot().catch(error=>{
 const el=document.getElementById('saveState');if(el)el.textContent='Sandbox error';
 const n=document.createElement('div');n.className='sandbox-real-error';n.textContent='Unable to initialize protected editor: '+error.message;document.body.prepend(n);
});
})();