(()=>{
  'use strict';

  const U='https://llmhyezgcnbognmmsnzq.supabase.co';
  const K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
  const FUNCTION_URL=`${U}/functions/v1/slack-notify`;
  const $=id=>document.getElementById(id);
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function msg(text,kind=''){
    const el=$('message');
    if(!el)return;
    el.textContent=text;
    el.className='notice '+kind;
  }

  function setConnection(label,kind=''){
    const el=$('connection');
    if(!el)return;
    el.className='status '+kind;
    el.innerHTML=`<span class="dot"></span><span>${label}</span>`;
  }

  async function waitForSdk(){
    for(let i=0;i<50;i++){
      if(window.supabase?.createClient)return window.supabase;
      await sleep(100);
    }
    throw new Error('Supabase client did not load. Refresh the page or try another connection.');
  }

  async function withTimeout(promise,ms,label){
    let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out`)),ms)});
    try{return await Promise.race([promise,timeout])}finally{clearTimeout(timer)}
  }

  async function boot(){
    setConnection('Checking…');
    msg('Loading integration settings…');

    const sdk=await waitForSdk();
    const db=sdk.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});

    async function session(){
      const result=await withTimeout(db.auth.getSession(),8000,'Session check');
      if(result.error)throw result.error;
      if(!result.data?.session){location.replace('/auth');throw new Error('Authentication required');}
      return result.data.session;
    }

    async function guard(){
      await session();
      const result=await withTimeout(db.rpc('get_my_admin_access'),8000,'Admin access check');
      if(result.error)throw result.error;
      if(result.data?.is_super_admin!==true){location.replace('/admin');throw new Error('Super Admin access required');}
    }

    async function callSlack(type,payload={}){
      const s=await session();
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),10000);
      try{
        const response=await fetch(FUNCTION_URL,{
          method:'POST',
          headers:{
            'Authorization':`Bearer ${s.access_token}`,
            'apikey':K,
            'Content-Type':'application/json'
          },
          body:JSON.stringify({type,...payload}),
          signal:controller.signal
        });
        let data={};
        try{data=await response.json()}catch(_){data={}}
        if(!response.ok)throw new Error(data?.error||`Slack service returned ${response.status}`);
        return data;
      }catch(error){
        if(error?.name==='AbortError')throw new Error('Slack service timed out');
        throw error;
      }finally{clearTimeout(timer)}
    }

    function renderSettings(s={}){
      $('enabled').checked=!!s.enabled;
      $('newContributor').checked=!!s.notify_new_contributor;
      $('applicationSubmitted').checked=!!s.notify_application_submitted;
      $('applicationDecision').checked=!!s.notify_application_decision;
      $('supportTicket').checked=!!s.notify_support_ticket;
      $('delivered').textContent=Number(s.delivered_count||0).toLocaleString();
      $('failed').textContent=Number(s.failed_count||0).toLocaleString();
    }

    async function loadSettings(){
      const result=await withTimeout(db.rpc('admin_slack_get_settings'),8000,'Settings request');
      if(result.error)throw result.error;
      renderSettings(result.data||{});
      return result.data||{};
    }

    async function load(){
      msg('Refreshing Slack integration…');
      setConnection('Checking…');

      let settingsError=null;
      try{await loadSettings()}catch(error){
        settingsError=error;
        $('delivered').textContent='!';
        $('failed').textContent='!';
      }

      try{
        const status=await callSlack('status');
        if(status.connected===true){
          setConnection(status.enabled===false?'Connected · paused':'Connected','connected');
          msg(settingsError?`Slack is connected, but settings failed to load: ${settingsError.message||settingsError}`:'Slack connection is ready.','ok');
        }else{
          setConnection('Webhook not detected','error');
          msg('The Edge Function cannot see SLACK_OPERATIONS_WEBHOOK.','error');
        }
      }catch(error){
        setConnection('Connection error','error');
        msg(`Slack status check failed: ${String(error.message||error)}`,'error');
      }
    }

    $('save').onclick=async()=>{
      try{
        $('save').disabled=true;
        msg('Saving settings…');
        const result=await withTimeout(db.rpc('admin_slack_update_settings',{
          p_enabled:$('enabled').checked,
          p_notify_new_contributor:$('newContributor').checked,
          p_notify_application_submitted:$('applicationSubmitted').checked,
          p_notify_application_decision:$('applicationDecision').checked,
          p_notify_support_ticket:$('supportTicket').checked
        }),8000,'Save settings');
        if(result.error)throw result.error;
        msg('Slack settings saved.','ok');
        await load();
      }catch(error){msg(String(error.message||error),'error')}
      finally{$('save').disabled=false}
    };

    $('test').onclick=async()=>{
      try{
        $('test').disabled=true;
        msg('Sending test message…');
        const data=await callSlack('test');
        if(!data?.ok)throw new Error(data?.error||'Slack did not accept the test message.');
        msg('Test message delivered to Slack.','ok');
        await loadSettings();
        setConnection('Connected','connected');
      }catch(error){
        setConnection('Connection error','error');
        msg(String(error.message||error),'error');
      }finally{$('test').disabled=false}
    };

    $('refresh').onclick=()=>load();

    await guard();
    await load();
  }

  function start(){
    boot().catch(error=>{
      setConnection('Setup error','error');
      msg(String(error.message||error),'error');
      console.error('Slack integrations boot failed',error);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
