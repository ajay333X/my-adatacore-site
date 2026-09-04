(()=>{
  'use strict';
  if(window.__adatacoreSlackEvents)return;
  window.__adatacoreSlackEvents=true;
  if(!window.supabase?.createClient)return;
  if(new URLSearchParams(location.search).has('impersonation'))return;

  const U='https://llmhyezgcnbognmmsnzq.supabase.co';
  const K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
  const db=window.supabase.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
  const FRESH_MS=30*60*1000;
  const seenApps=new Set(),seenTickets=new Set();
  let busy=false,joinChecked=false;

  const fresh=v=>{if(!v)return false;const t=new Date(v).getTime(),d=Date.now()-t;return Number.isFinite(t)&&d>=0&&d<=FRESH_MS};
  async function notify(type,payload={}){
    try{
      const {data,error}=await db.functions.invoke('slack-notify',{body:{type,...payload}});
      if(error){console.warn('Slack event skipped:',error.message||error);return false}
      return data?.ok!==false;
    }catch(error){console.warn('Slack event skipped:',error);return false}
  }

  async function scan(){
    if(busy||document.hidden)return;
    busy=true;
    try{
      const {data:{session}}=await db.auth.getSession();
      if(!session)return;

      if(!joinChecked){joinChecked=true;await notify('contributor_joined')}

      if(location.pathname==='/apply'||location.pathname==='/apply/'){
        const {data,error}=await db.rpc('get_my_application_onboarding');
        if(!error){
          for(const app of Array.isArray(data?.applications)?data.applications:[]){
            const id=String(app.id||'');
            if(!id||seenApps.has(id)||!['pending','under_review','approved'].includes(String(app.status||''))||!fresh(app.submitted_at||app.updated_at))continue;
            if(await notify('application_submitted',{application_id:app.id}))seenApps.add(id);
          }
        }
      }

      if(location.pathname==='/workspace'||location.pathname==='/workspace/'){
        const {data,error}=await db.rpc('get_my_support_tickets');
        if(!error){
          for(const ticket of Array.isArray(data)?data:[]){
            const id=String(ticket.id||'');
            if(!id||seenTickets.has(id)||!fresh(ticket.created_at))continue;
            if(await notify('support_ticket_created',{ticket_id:ticket.id}))seenTickets.add(id);
          }
        }
      }
    }finally{busy=false}
  }

  scan();
  const timer=setInterval(scan,10000);
  window.addEventListener('focus',scan);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scan()});
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
