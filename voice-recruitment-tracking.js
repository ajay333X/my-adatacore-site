(()=>{'use strict';
const U='https://llmhyezgcnbognmmsnzq.supabase.co/rest/v1/rpc/public_log_voice_recruitment_event';
const K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const storageKey='adatacore-public-session';
let sid='';
try{sid=localStorage.getItem(storageKey)||crypto.randomUUID();localStorage.setItem(storageKey,sid)}catch(_){sid=String(Date.now())+Math.random()}
function ref(){try{return document.referrer?new URL(document.referrer).host:''}catch(_){return''}}
async function digest(v){try{const b=new TextEncoder().encode(v),d=await crypto.subtle.digest('SHA-256',b);return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}catch(_){return v.slice(0,128)}}
async function send(name,path=location.pathname){try{const session=await digest(sid);await fetch(U,{method:'POST',headers:{'content-type':'application/json','apikey':K,'authorization':'Bearer '+K},keepalive:true,body:JSON.stringify({p_event_name:name,p_page_path:path,p_referrer_host:ref()||null,p_session_hash:session})})}catch(_){}}
window.adatacoreRecruitmentTrack=send;
window.addEventListener('DOMContentLoaded',()=>{
 const path=location.pathname;
 if(path==='/invite/voice-actors')send('voice_invite_view',path);
 if(path==='/invite/voice-actors/assessment')send('voice_assessment_view',path);
 document.querySelectorAll('a[href="/invite/voice-actors/assessment"]').forEach(a=>a.addEventListener('click',()=>send('voice_invite_start','/invite/voice-actors')));
 const record=document.getElementById('recordBtn');if(record)record.addEventListener('click',()=>send('voice_assessment_record_start','/invite/voice-actors/assessment'),{once:true});
 const status=document.getElementById('statusView');if(status){let sent=false;const check=()=>{if(!sent&&!status.classList.contains('hidden')){sent=true;send('voice_assessment_submit','/invite/voice-actors/assessment')}};new MutationObserver(check).observe(status,{attributes:true,attributeFilter:['class']});check()}
});
})();