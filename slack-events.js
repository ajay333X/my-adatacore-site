(()=>{
  'use strict';
  if(window.__adatacoreSlackEvents)return;
  window.__adatacoreSlackEvents=true;
  if(!window.supabase?.createClient)return;
  if(new URLSearchParams(location.search).has('impersonation'))return;

  const U='https://llmhyezgcnbognmmsnzq.supabase.co';
  const K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
  const db=window.supabase.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
  let busy=false;

  async function notify(type,payload={}){
    try{
      const {error}=await db.functions.invoke('slack-notify',{body:{type,...payload}});
      if(error)console.warn('Slack event skipped:',error.message||error);
    }catch(error){console.warn('Slack event skipped:',error)}
  }

  async function scan(){
    if(busy||document.hidden)return;
    busy=true;
    try{
      const {data:{session}}=await db.auth.getSession();
      if(!session)return;

      // Safe to call on each eligible page: the backend applies freshness checks
      // and a unique event key so existing contributors never create duplicates.
      await notify('contributor_joined');

      if(location.pathname==='/apply'||location.pathname==='/apply/'){
        const {data,error}=await db.rpc('get_my_application_onboarding');
        if(!error){
          for(const app of Array.isArray(data?.applications)?data.applications:[]){
            if(['pending','under_review','approved'].includes(String(app.status||''))){
              await notify('application_submitted',{application_id:app.id});
            }
          }
        }
      }

      if(location.pathname==='/workspace'||location.pathname==='/workspace/'){
        const {data,error}=await db.rpc('get_my_support_tickets');
        if(!error){
          for(const ticket of Array.isArray(data)?data:[]){
            await notify('support_ticket_created',{ticket_id:ticket.id});
          }
        }
      }
    }finally{busy=false}
  }

  scan();
  const timer=setInterval(scan,8000);
  window.addEventListener('focus',scan);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scan()});
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
