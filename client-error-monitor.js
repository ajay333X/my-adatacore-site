(()=>{
  'use strict';
  if(window.__adatacoreClientErrorMonitor)return;
  window.__adatacoreClientErrorMonitor=true;
  if(!window.supabase?.createClient)return;

  const U='https://llmhyezgcnbognmmsnzq.supabase.co';
  const K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
  const endpoint=U+'/functions/v1/client-error-report';
  const client=window.supabase.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  const seen=new Map();
  const release=document.documentElement.dataset.release||document.querySelector('meta[name="adatacore-release"]')?.content||'';

  function fingerprint(payload){return [payload.message,payload.source,payload.line,payload.column,location.pathname].join('|')}
  async function send(payload){
    try{
      const key=fingerprint(payload),now=Date.now(),last=seen.get(key)||0;
      if(now-last<30000)return;
      seen.set(key,now);
      const {data:{session}}=await client.auth.getSession();
      if(!session?.access_token)return;
      await fetch(endpoint,{
        method:'POST',
        keepalive:true,
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':K},
        body:JSON.stringify({
          route:location.pathname+location.search+location.hash,
          message:String(payload.message||'Unknown client error').slice(0,4000),
          stack:String(payload.stack||'').slice(0,12000),
          source:String(payload.source||'').slice(0,1500),
          line:Number(payload.line)||null,
          column:Number(payload.column)||null,
          userAgent:navigator.userAgent,
          release,
          metadata:{title:document.title,visibility:document.visibilityState}
        })
      });
    }catch(_){ }
  }

  window.addEventListener('error',event=>send({
    message:event.message||event.error?.message,
    stack:event.error?.stack,
    source:event.filename,
    line:event.lineno,
    column:event.colno
  }));

  window.addEventListener('unhandledrejection',event=>{
    const reason=event.reason;
    send({message:reason?.message||String(reason||'Unhandled promise rejection'),stack:reason?.stack,source:'unhandledrejection'});
  });
})();
