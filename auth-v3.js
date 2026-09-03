(()=>{
  const $=id=>document.getElementById(id);
  const SUPABASE_URL='https://llmhyezgcnbognmmsnzq.supabase.co';
  const SUPABASE_KEY='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
  const EMAIL_COOLDOWN_KEY='adatacore-auth-email-cooldown-until';
  const SDK_SOURCES=[
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.js',
    'https://unpkg.com/@supabase/supabase-js@2.57.4/dist/umd/supabase.js'
  ];

  const views={signin:$('signinForm'),signup:$('signupForm'),reset:$('resetForm')};
  const tabs={signin:$('tabSignin'),signup:$('tabSignup')};
  const notice=$('notice');
  const social=$('socialArea');
  const authTabs=$('authTabs');
  const recoveryRequested=new URLSearchParams(location.search).get('recovery')==='1'||location.hash.includes('type=recovery');
  let recoveryMode=recoveryRequested;
  let redirecting=false;
  let clientPromise=null;
  let authListenerAttached=false;

  function setMode(mode){
    Object.entries(views).forEach(([key,el])=>el?.classList.toggle('active',key===mode));
    if(mode==='reset'){
      recoveryMode=true;
      if(authTabs) authTabs.style.display='none';
      if(social) social.style.display='none';
      if($('eyebrowText')) $('eyebrowText').textContent='Account recovery';
      if($('panelTitle')) $('panelTitle').textContent='Set a new password';
      if($('panelSubtitle')) $('panelSubtitle').textContent='Choose a new password to finish recovering your account.';
      if($('authHelp')) $('authHelp').textContent='Your recovery session is protected by Supabase Auth.';
      return;
    }
    recoveryMode=false;
    if(authTabs) authTabs.style.display='grid';
    if(social) social.style.display='block';
    tabs.signin?.classList.toggle('active',mode==='signin');
    tabs.signup?.classList.toggle('active',mode==='signup');
    tabs.signin?.setAttribute('aria-selected',String(mode==='signin'));
    tabs.signup?.setAttribute('aria-selected',String(mode==='signup'));
    if(mode==='signin'){
      if($('eyebrowText')) $('eyebrowText').textContent='Workspace access';
      if($('panelTitle')) $('panelTitle').textContent='Welcome back';
      if($('panelSubtitle')) $('panelSubtitle').textContent='Sign in to continue to your Adatacore workspace.';
      if($('authHelp')) $('authHelp').textContent='By continuing, you are accessing a protected Adatacore workspace.';
    }else{
      if($('eyebrowText')) $('eyebrowText').textContent='Join Adatacore';
      if($('panelTitle')) $('panelTitle').textContent='Create your account';
      if($('panelSubtitle')) $('panelSubtitle').textContent='Create an account, verify your email, then complete your profile and assessment.';
      if($('authHelp')) $('authHelp').textContent='Email ownership must be confirmed before password-based workspace access.';
    }
  }

  function showNotice(type,title,message,buttonText='Done'){
    if(!notice){ alert(message); return Promise.resolve(); }
    return new Promise(resolve=>{
      notice.className='notice '+type;
      if($('noticeIcon')) $('noticeIcon').textContent=type==='success'?'✓':type==='error'?'!':'i';
      if($('noticeTitle')) $('noticeTitle').textContent=title;
      if($('noticeMessage')) $('noticeMessage').textContent=message;
      if($('noticeButton')) $('noticeButton').textContent=buttonText;
      const close=()=>{
        notice.classList.remove('show');
        document.removeEventListener('keydown',onKey);
        setTimeout(resolve,100);
      };
      const onKey=e=>{ if(e.key==='Escape'||e.key==='Enter') close(); };
      if($('noticeButton')) $('noticeButton').onclick=close;
      notice.onclick=e=>{ if(e.target===notice) close(); };
      document.addEventListener('keydown',onKey);
      requestAnimationFrame(()=>{
        notice.classList.add('show');
        setTimeout(()=>$('noticeButton')?.focus(),50);
      });
    });
  }

  function validEmail(value){
    const v=String(value||'').trim();
    const at=v.indexOf('@');
    const dot=v.lastIndexOf('.');
    return at>0&&dot>at+1&&dot<v.length-1&&!v.includes(' ');
  }
  function setLoading(button,loading,text){
    if(!button) return;
    if(!button.dataset.label) button.dataset.label=button.textContent;
    button.disabled=loading;
    button.classList.toggle('loading',loading);
    button.textContent=loading?text:button.dataset.label;
  }
  function isEmailRateLimit(error){
    const code=String(error?.code||'').toLowerCase();
    const message=String(error?.message||'').toLowerCase();
    return code==='over_email_send_rate_limit'||(Number(error?.status)===429&&message.includes('email'))||message.includes('email rate limit');
  }
  function setEmailCooldown(){ try{localStorage.setItem(EMAIL_COOLDOWN_KEY,String(Date.now()+60000));}catch(_){} }
  function emailCooldownActive(){ try{return Number(localStorage.getItem(EMAIL_COOLDOWN_KEY)||0)>Date.now();}catch(_){return false;} }
  async function showEmailBusy(kind){
    setEmailCooldown();
    const message=kind==='signup'
      ?'The verification email service is temporarily rate-limited. Please use Continue with Google or try email signup again in a minute.'
      :'The password recovery email service is temporarily rate-limited. Please try again shortly.';
    await showNotice('info','Email temporarily unavailable',message,'Got it');
  }

  function loadScript(src,timeoutMs=7000){
    return new Promise((resolve,reject)=>{
      const existing=[...document.scripts].find(s=>s.src===src);
      if(existing&&window.supabase?.createClient){ resolve(); return; }
      const script=existing||document.createElement('script');
      let done=false;
      const finish=(ok,err)=>{
        if(done) return;
        done=true;
        clearTimeout(timer);
        script.onload=null;
        script.onerror=null;
        ok?resolve():reject(err||new Error('SDK load failed'));
      };
      const timer=setTimeout(()=>finish(false,new Error('SDK load timed out')),timeoutMs);
      script.onload=()=>finish(!!window.supabase?.createClient,new Error('SDK unavailable after load'));
      script.onerror=()=>finish(false,new Error('SDK network error'));
      if(!existing){ script.src=src;script.async=true;script.crossOrigin='anonymous';document.head.appendChild(script); }
    });
  }

  async function getClient(){
    if(window.__adatacoreSupabaseClient) return window.__adatacoreSupabaseClient;
    if(clientPromise) return clientPromise;
    clientPromise=(async()=>{
      if(!window.supabase?.createClient){
        let loaded=false;
        for(const src of SDK_SOURCES){
          try{ await loadScript(src); if(window.supabase?.createClient){loaded=true;break;} }catch(_){ }
        }
        if(!loaded&&!window.supabase?.createClient) throw new Error('Authentication library could not load');
      }
      const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}});
      window.__adatacoreSupabaseClient=client;
      attachAuthListener(client);
      return client;
    })().catch(error=>{clientPromise=null;throw error;});
    return clientPromise;
  }

  async function requireClient(){
    try{return await getClient();}
    catch(_){
      await showNotice('error','Authentication service unavailable','The secure sign-in service did not load on this connection. Please refresh once or try another network. The page controls will continue to work.','Got it');
      return null;
    }
  }

  async function routeSession(client,session){
    if(!session?.user||recoveryMode||redirecting) return false;
    redirecting=true;
    try{
      const {data:profile,error}=await client.from('users').select('role,accountStatus').eq('id',session.user.id).single();
      if(error||!profile){redirecting=false;return false;}
      if(profile.accountStatus==='blocked'){await client.auth.signOut();location.replace('/access-revoked');return true;}
      if(profile.accountStatus!=='active'){await client.auth.signOut();location.replace('/verification-required');return true;}
      location.replace('/dashboard');
      return true;
    }catch(_){redirecting=false;return false;}
  }

  function attachAuthListener(client){
    if(authListenerAttached) return;
    authListenerAttached=true;
    client.auth.onAuthStateChange((event,session)=>{
      if(event==='PASSWORD_RECOVERY'){setMode('reset');return;}
      if(['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED'].includes(event)&&!recoveryRequested){
        queueMicrotask(()=>routeSession(client,session));
      }
    });
  }

  // UI is wired BEFORE the network auth dependency is requested.
  tabs.signin?.addEventListener('click',()=>setMode('signin'));
  tabs.signup?.addEventListener('click',()=>setMode('signup'));

  const eyeOpen='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.7"/></svg>';
  const eyeClosed='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 3 18 18M10.6 6.1A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.4 3.1M6.2 7.2C3.8 9 2.5 12 2.5 12S6 18 12 18c1.5 0 2.8-.4 4-1"/><path d="M10.5 10.5a2.2 2.2 0 0 0 3 3"/></svg>';
  document.querySelectorAll('[data-toggle-password]').forEach(btn=>{
    btn.innerHTML=eyeOpen;
    btn.addEventListener('click',()=>{
      const input=$(btn.dataset.togglePassword);
      if(!input) return;
      const show=input.type==='password';
      input.type=show?'text':'password';
      btn.innerHTML=show?eyeClosed:eyeOpen;
      btn.setAttribute('aria-label',show?'Hide password':'Show password');
    });
  });

  $('signupPassword')?.addEventListener('input',e=>{
    const value=e.currentTarget.value;
    let score=0;
    if(value.length>=8)score++;
    if(value.length>=12)score++;
    if(/[A-Z]/.test(value)&&/[a-z]/.test(value))score++;
    if(/[0-9]/.test(value))score++;
    if(/[^A-Za-z0-9]/.test(value))score++;
    const fill=$('strengthFill'),text=$('strengthText');
    if(!fill||!text) return;
    fill.style.width=(value.length?Math.max(18,Math.min(100,score*20)):0)+'%';
    if(!value){fill.style.background='#b5b7c1';text.textContent='Start with 8+ characters';}
    else if(score<=1){fill.style.background='#d65c6f';text.textContent='Weak — add length and variety';}
    else if(score<=3){fill.style.background='#d59a31';text.textContent='Good — add another character type';}
    else{fill.style.background='#2b9b75';text.textContent='Strong password';}
  });

  const stage=$('authStage');
  if(stage&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    stage.addEventListener('pointermove',e=>{
      const r=stage.getBoundingClientRect();
      stage.style.setProperty('--px',((((e.clientX-r.left)/r.width)-.5)*2).toFixed(3));
      stage.style.setProperty('--py',((((e.clientY-r.top)/r.height)-.5)*2).toFixed(3));
    });
    stage.addEventListener('pointerleave',()=>{stage.style.setProperty('--px','0');stage.style.setProperty('--py','0');});
  }

  $('signinForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const email=$('loginEmail')?.value.trim().toLowerCase()||'';
    const password=$('loginPassword')?.value||'';
    const button=$('signinButton');
    if(!validEmail(email)) return showNotice('error','Check your email','Enter a valid email address to continue.','Fix it');
    if(!password) return showNotice('error','Password required','Enter your password to sign in.','Fix it');
    const client=await requireClient();
    if(!client) return;
    setLoading(button,true,'Signing in…');
    try{
      const {error}=await client.auth.signInWithPassword({email,password});
      if(error) throw error;
      location.href='/dashboard';
    }catch(error){
      if(String(error?.code||'')==='email_not_confirmed') await showNotice('info','Confirm your email','This email has not been confirmed yet. Open the confirmation message sent when the account was created.','Got it');
      else await showNotice('error','Unable to sign in',error?.message||'Check your email and password, then try again.','Try again');
    }finally{setLoading(button,false,'');}
  });

  $('signupForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const name=$('signupName')?.value.trim()||'';
    const email=$('signupEmail')?.value.trim().toLowerCase()||'';
    const password=$('signupPassword')?.value||'';
    const button=$('signupButton');
    if(name.length<2) return showNotice('error','Check your name','Enter your full name to continue.','Fix it');
    if(!validEmail(email)) return showNotice('error','Check your email','Enter a valid email address.','Fix it');
    if(password.length<8) return showNotice('error','Password is too short','Use at least 8 characters for your password.','Fix it');
    if(emailCooldownActive()) return showEmailBusy('signup');
    const client=await requireClient();
    if(!client) return;
    setLoading(button,true,'Creating account…');
    try{
      const {data,error}=await client.auth.signUp({email,password,options:{data:{full_name:name},emailRedirectTo:location.origin+'/dashboard'}});
      if(error) throw error;
      if(data.session){
        await showNotice('success','Account created','Your account is ready. Taking you to Adatacore…');
        location.href='/dashboard';
      }else{
        setEmailCooldown();
        await showNotice('success','Check your email','We sent you a confirmation link. Open it to finish creating your Adatacore account.');
        setMode('signin');
        if($('loginEmail')) $('loginEmail').value=email;
      }
    }catch(error){
      if(isEmailRateLimit(error)) await showEmailBusy('signup');
      else await showNotice('error','Unable to create account',error?.message||'We could not create your account right now.','Try again');
    }finally{setLoading(button,false,'');}
  });

  $('forgotPassword')?.addEventListener('click',async()=>{
    const email=$('loginEmail')?.value.trim().toLowerCase()||'';
    if(!validEmail(email)){
      await showNotice('info','Enter your email first','Type the email address for your Adatacore account, then choose Forgot password again.','Got it');
      $('loginEmail')?.focus();
      return;
    }
    if(emailCooldownActive()) return showEmailBusy('recovery');
    const client=await requireClient();
    if(!client) return;
    const button=$('forgotPassword');
    if(button) button.disabled=true;
    try{
      const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/auth?recovery=1'});
      if(error) throw error;
      setEmailCooldown();
      await showNotice('success','Recovery email sent','Check your inbox for a secure password reset link.','Done');
    }catch(error){
      if(isEmailRateLimit(error)) await showEmailBusy('recovery');
      else await showNotice('error','Could not send recovery email',error?.message||'Please try again later.','Try again');
    }finally{if(button) button.disabled=false;}
  });

  $('resetForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const password=$('resetPassword')?.value||'';
    const button=$('resetButton');
    if(password.length<8) return showNotice('error','Password is too short','Use at least 8 characters for your new password.','Fix it');
    const client=await requireClient();
    if(!client) return;
    setLoading(button,true,'Updating password…');
    try{
      const {error}=await client.auth.updateUser({password});
      if(error) throw error;
      await showNotice('success','Password updated','Your new password is active. You can continue to your workspace.');
      location.href='/dashboard';
    }catch(error){await showNotice('error','Could not update password',error?.message||'Please request a new recovery link and try again.','Try again');}
    finally{setLoading(button,false,'');}
  });

  $('googleButton')?.addEventListener('click',async()=>{
    const button=$('googleButton');
    const client=await requireClient();
    if(!client) return;
    if(button) button.disabled=true;
    try{
      const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/dashboard'}});
      if(error) throw error;
    }catch(error){
      if(button) button.disabled=false;
      await showNotice('error','Google sign-in unavailable',error?.message||'Please try again or use email and password.','Try again');
    }
  });

  if(recoveryRequested) setMode('reset');
  else setMode(new URLSearchParams(location.search).get('mode')==='signup'?'signup':'signin');

  // Warm the auth dependency only after every local control is already interactive.
  getClient().then(client=>client.auth.getSession().then(({data:{session}})=>{if(session) routeSession(client,session);})).catch(()=>{});
})();