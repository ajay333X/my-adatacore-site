window.addEventListener('DOMContentLoaded',()=>{
  const SUPABASE_URL='https://llmhyezgcnbognmmsnzq.supabase.co';
  const SUPABASE_KEY='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
  const client=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}});
  const $=id=>document.getElementById(id);
  const views={signin:$('signinForm'),signup:$('signupForm'),reset:$('resetForm')};
  const tabs={signin:$('tabSignin'),signup:$('tabSignup')};
  const notice=$('notice'),social=$('socialArea'),authTabs=$('authTabs');
  const recoveryRequested=new URLSearchParams(location.search).get('recovery')==='1'||location.hash.includes('type=recovery');
  const EMAIL_COOLDOWN_KEY='adatacore-auth-email-cooldown-until';
  let recoveryMode=recoveryRequested,redirecting=false;

  const stage=$('authStage');
  if(stage&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    stage.addEventListener('pointermove',e=>{const r=stage.getBoundingClientRect();const x=((e.clientX-r.left)/r.width-.5)*2;const y=((e.clientY-r.top)/r.height-.5)*2;stage.style.setProperty('--px',x.toFixed(3));stage.style.setProperty('--py',y.toFixed(3))});
    stage.addEventListener('pointerleave',()=>{stage.style.setProperty('--px','0');stage.style.setProperty('--py','0')});
  }

  function validEmail(value){
    const v=String(value||'').trim();
    const at=v.indexOf('@');
    const dot=v.lastIndexOf('.');
    return at>0&&dot>at+1&&dot<v.length-1&&!v.includes(' ');
  }
  function isEmailRateLimit(error){const code=String(error?.code||'').toLowerCase();const message=String(error?.message||'').toLowerCase();return code==='over_email_send_rate_limit'||(Number(error?.status)===429&&message.includes('email'))||message.includes('email rate limit')}
  function setEmailCooldown(){try{localStorage.setItem(EMAIL_COOLDOWN_KEY,String(Date.now()+60000))}catch(_){}}
  function emailCooldownActive(){try{return Number(localStorage.getItem(EMAIL_COOLDOWN_KEY)||0)>Date.now()}catch(_){return false}}
  function setLoading(button,loading,text){if(!button)return;if(!button.dataset.label)button.dataset.label=button.textContent;button.disabled=loading;button.classList.toggle('loading',loading);button.textContent=loading?text:button.dataset.label}

  function showNotice(type,title,message,buttonText='Done'){
    return new Promise(resolve=>{
      notice.className='notice '+type;
      $('noticeIcon').textContent=type==='success'?'✓':type==='error'?'!':'i';
      $('noticeTitle').textContent=title;$('noticeMessage').textContent=message;$('noticeButton').textContent=buttonText;
      const close=()=>{notice.classList.remove('show');document.removeEventListener('keydown',onKey);setTimeout(resolve,120)};
      const onKey=e=>{if(e.key==='Escape'||e.key==='Enter')close()};
      $('noticeButton').onclick=close;notice.onclick=e=>{if(e.target===notice)close()};document.addEventListener('keydown',onKey);requestAnimationFrame(()=>{notice.classList.add('show');setTimeout(()=>$('noticeButton').focus(),60)});
    });
  }
  async function showEmailBusy(kind){setEmailCooldown();const message=kind==='signup'?'The verification email service is temporarily rate-limited. Please use Continue with Google or try email signup again in a minute.':'The password recovery email service is temporarily rate-limited. Please try again shortly.';await showNotice('info','Email temporarily unavailable',message,'Got it')}

  async function routeSession(session){
    if(!session?.user||recoveryMode||redirecting)return false;redirecting=true;
    try{
      const {data:profile,error}=await client.from('users').select('role,accountStatus').eq('id',session.user.id).single();
      if(error||!profile){redirecting=false;return false}
      if(profile.accountStatus==='blocked'){await client.auth.signOut();location.replace('/access-revoked');return true}
      if(profile.accountStatus!=='active'){await client.auth.signOut();location.replace('/verification-required');return true}
      location.replace('/dashboard');return true;
    }catch(_){redirecting=false;return false}
  }

  function setMode(mode){
    Object.entries(views).forEach(([key,el])=>el?.classList.toggle('active',key===mode));
    if(mode==='reset'){
      recoveryMode=true;authTabs.style.display='none';social.style.display='none';
      $('eyebrowText').textContent='Account recovery';$('panelTitle').textContent='Set a new password';$('panelSubtitle').textContent='Choose a new password to finish recovering your account.';$('authHelp').textContent='Your recovery session is protected by Supabase Auth.';return;
    }
    recoveryMode=false;authTabs.style.display='grid';social.style.display='block';
    tabs.signin.classList.toggle('active',mode==='signin');tabs.signup.classList.toggle('active',mode==='signup');
    tabs.signin.setAttribute('aria-selected',String(mode==='signin'));tabs.signup.setAttribute('aria-selected',String(mode==='signup'));
    if(mode==='signin'){$('eyebrowText').textContent='Workspace access';$('panelTitle').textContent='Welcome back';$('panelSubtitle').textContent='Sign in to continue to your Adatacore workspace.';$('authHelp').textContent='By continuing, you are accessing a protected Adatacore workspace.'}
    else{$('eyebrowText').textContent='Join Adatacore';$('panelTitle').textContent='Create your account';$('panelSubtitle').textContent='Create an account, verify your email, then complete your profile and assessment.';$('authHelp').textContent='Email ownership must be confirmed before password-based workspace access.'}
  }
  tabs.signin.addEventListener('click',()=>setMode('signin'));
  tabs.signup.addEventListener('click',()=>setMode('signup'));

  const eyeOpen='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.7"/></svg>';
  const eyeClosed='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 3 18 18M10.6 6.1A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.4 3.1M6.2 7.2C3.8 9 2.5 12 2.5 12S6 18 12 18c1.5 0 2.8-.4 4-1"/><path d="M10.5 10.5a2.2 2.2 0 0 0 3 3"/></svg>';
  document.querySelectorAll('[data-toggle-password]').forEach(btn=>{btn.innerHTML=eyeOpen;btn.addEventListener('click',()=>{const input=$(btn.dataset.togglePassword);const show=input.type==='password';input.type=show?'text':'password';btn.innerHTML=show?eyeClosed:eyeOpen;btn.setAttribute('aria-label',show?'Hide password':'Show password')})});

  const strengthInput=$('signupPassword');
  strengthInput.addEventListener('input',()=>{const value=strengthInput.value;let score=0;if(value.length>=8)score++;if(value.length>=12)score++;if(/[A-Z]/.test(value)&&/[a-z]/.test(value))score++;if(/[0-9]/.test(value))score++;if(/[^A-Za-z0-9]/.test(value))score++;const fill=$('strengthFill'),text=$('strengthText');const pct=value.length?Math.max(18,Math.min(100,score*20)):0;fill.style.width=pct+'%';if(!value){fill.style.background='#b5b7c1';text.textContent='Start with 8+ characters'}else if(score<=1){fill.style.background='#d65c6f';text.textContent='Weak — add length and variety'}else if(score<=3){fill.style.background='#d59a31';text.textContent='Good — add another character type'}else{fill.style.background='#2b9b75';text.textContent='Strong password'}});

  $('signinForm').addEventListener('submit',async e=>{
    e.preventDefault();const email=$('loginEmail').value.trim().toLowerCase(),password=$('loginPassword').value,button=$('signinButton');
    if(!validEmail(email))return showNotice('error','Check your email','Enter a valid email address to continue.','Fix it');
    if(!password)return showNotice('error','Password required','Enter your password to sign in.','Fix it');
    setLoading(button,true,'Signing in…');
    try{const {error}=await client.auth.signInWithPassword({email,password});if(error)throw error;location.href='/dashboard'}catch(error){const code=String(error?.code||'');if(code==='email_not_confirmed')await showNotice('info','Confirm your email','This email has not been confirmed yet. Open the confirmation message we sent when the account was created.','Got it');else await showNotice('error','Unable to sign in',error.message||'Check your email and password, then try again.','Try again')}finally{setLoading(button,false,'')}
  });

  $('signupForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const name=$('signupName').value.trim(),email=$('signupEmail').value.trim().toLowerCase(),password=$('signupPassword').value,button=$('signupButton');
    if(name.length<2)return showNotice('error','Check your name','Enter your full name to continue.','Fix it');
    if(!validEmail(email))return showNotice('error','Check your email','Enter a valid email address.','Fix it');
    if(password.length<8)return showNotice('error','Password is too short','Use at least 8 characters for your password.','Fix it');
    if(emailCooldownActive())return showEmailBusy('signup');
    setLoading(button,true,'Creating account…');
    try{
      const {data,error}=await client.auth.signUp({email,password,options:{data:{full_name:name},emailRedirectTo:location.origin+'/dashboard'}});
      if(error)throw error;
      if(data.session){await showNotice('success','Account created','Your account is ready. Taking you to Adatacore…');location.href='/dashboard'}
      else{setEmailCooldown();await showNotice('success','Check your email','We sent you a confirmation link. Open it to finish creating your Adatacore account.');setMode('signin');$('loginEmail').value=email}
    }catch(error){if(isEmailRateLimit(error))await showEmailBusy('signup');else await showNotice('error','Unable to create account',error.message||'We could not create your account right now.','Try again')}finally{setLoading(button,false,'')}
  });

  $('forgotPassword').addEventListener('click',async()=>{
    const email=$('loginEmail').value.trim().toLowerCase();
    if(!validEmail(email)){await showNotice('info','Enter your email first','Type the email address for your Adatacore account, then choose Forgot password again.','Got it');$('loginEmail').focus();return}
    if(emailCooldownActive())return showEmailBusy('recovery');
    $('forgotPassword').disabled=true;
    try{const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/auth?recovery=1'});if(error)throw error;setEmailCooldown();await showNotice('success','Recovery email sent','Check your inbox for a secure password reset link.','Done')}catch(error){if(isEmailRateLimit(error))await showEmailBusy('recovery');else await showNotice('error','Could not send recovery email',error.message||'Please try again later.','Try again')}finally{$('forgotPassword').disabled=false}
  });

  $('resetForm').addEventListener('submit',async e=>{e.preventDefault();const password=$('resetPassword').value,button=$('resetButton');if(password.length<8)return showNotice('error','Password is too short','Use at least 8 characters for your new password.','Fix it');setLoading(button,true,'Updating password…');try{const {error}=await client.auth.updateUser({password});if(error)throw error;await showNotice('success','Password updated','Your new password is active. You can continue to your workspace.');location.href='/dashboard'}catch(error){await showNotice('error','Could not update password',error.message||'Please request a new recovery link and try again.','Try again')}finally{setLoading(button,false,'')});

  $('googleButton').addEventListener('click',async()=>{const button=$('googleButton');button.disabled=true;try{const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/dashboard'}});if(error)throw error}catch(error){button.disabled=false;await showNotice('error','Google sign-in unavailable',error.message||'Please try again or use email and password.','Try again')}});

  client.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){setMode('reset');return}if(['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED'].includes(event)&&!recoveryRequested)queueMicrotask(()=>routeSession(session))});
  if(recoveryRequested)setMode('reset');else{const requestedMode=new URLSearchParams(location.search).get('mode');if(requestedMode==='signup')setMode('signup');client.auth.getSession().then(({data:{session}})=>{if(session)routeSession(session)})}
});