/* Shared native Voice Studio sandbox backend. Never impersonates production.
 * These methods are called by voice-studio-platform.js with the SAME UI.
 * There is deliberately no fallback to any production RPC or storage bucket. */
(function(){
 'use strict';
 const params=new URLSearchParams(location.search),id=params.get('test_session')||'';
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(!id)return;
 if(!uuid.test(id))throw Error('Invalid native sandbox session');
 const api={
  id,account:null,lastMode:'solo',
  async action(db,name,payload={}){
   const {data,error}=await db.rpc('admin_sandbox_voice_action',{p_session_id:id,p_action:name,p_payload:payload});
   if(error)throw error;
   return data;
  },
  async duo(db,action,payload={}){
   const {data,error}=await db.rpc('admin_sandbox_duo_action',{p_session_id:id,p_action:action,p_payload:payload});
   if(error)throw error;
   return data;
  },
  async initialize(db){
   const ctx=await this.action(db,'validate');
   if(Number(ctx.project_id)!==94)throw Error('Voice Studio sandbox is currently available for Project 94 only');
   this.account=ctx;
   const banner=document.createElement('div');
   banner.className='vs-sandbox-banner';banner.setAttribute('role','status');
   const label=document.createElement('span');
   label.textContent='TEST MODE · '+ctx.name+' · '+ctx.level+' · Isolated recordings, reviews and permissions. No payouts or live submissions.';
   const back=document.createElement('a');back.href='/workspace?test_session='+encodeURIComponent(id);
   back.textContent='Return to test dashboard';
   banner.append(label,back);document.body.prepend(banner);
   return ctx;
  },
  async rpc(db,name,args={}){
   if(name==='vs_is_admin')return this.account?.level==='L2';
   if(name==='vs_can_join')return Boolean(this.account);
   if(name==='vs_enter'){
    this.lastMode=args.p_mode||'solo';
    return this.lastMode==='duo'?this.duo(db,'enter'):this.action(db,'enter',{mode:args.p_mode});
   }
   if(name==='vs_waiting')return this.duo(db,'waiting');
   if(name==='vs_leave')return this.lastMode==='duo'?this.duo(db,'leave',{session_id:args.p_session}):this.action(db,'leave',{take_id:args.p_session});
   if(name==='vs_submit'){
    const payload={session_id:args.p_session,take_id:args.p_session,
      extension:String(args.p_path||'').split('.').pop(),
      seconds:args.p_seconds,mime:args.p_mime,bytes:args.p_bytes};
    return this.lastMode==='duo'?this.duo(db,'submit',payload):this.action(db,'submit',payload);
   }
   if(name==='vs_save_transcript')return this.action(db,'transcript',{take_id:args.p_session,text:args.p_text});
   const kinds={
     vs_wait_heartbeat:'heartbeat',vs_consent:'consent',
     vs_request_recording:'request',vs_respond_recording:'respond',
     vs_begin:'begin',vs_track_progress:'progress',vs_flag_task:'flag'
   };
   if(this.lastMode==='duo'&&kinds[name])return this.duo(db,kinds[name],{
    session_id:args.p_session,accept:args.p_accept,state:args.p_state,reason:args.p_reason
   });
   throw Error('Production Voice RPC "'+name+'" is disabled in sandbox mode.');
  },
  async getDuo(db,sessionId){return this.duo(db,'get',{session_id:sessionId})},
  async tracks(db,sessionId){return this.duo(db,'tracks',{session_id:sessionId})},
  async signal(db,sessionId,kind,payload){return this.duo(db,'signal_send',{session_id:sessionId,kind,payload})},
  async signals(db,sessionId,after){return this.duo(db,'signal_list',{session_id:sessionId,after})},
  storagePath(takeId,extension){
   if(!uuid.test(takeId)||!this.account?.account_id)throw Error('Missing verified sandbox recording');
   if(!['webm','mp4','ogg'].includes(extension))throw Error('Unsupported sandbox audio extension');
   return this.account.owner_id ? this.account.owner_id+'/'+takeId+'/'+this.account.account_id+'.'+extension : null;
  },
  async upload(db,takeId,extension,blob,options={}){
   const {data:{user},error:authError}=await db.auth.getUser();
   if(authError||!user)throw Error('Sandbox login required');
   if(this.lastMode==='duo'){
    const target=await this.duo(db,'upload_target',{session_id:takeId});
    takeId=target.take_id;
   }
   const path=user.id+'/'+takeId+'/'+this.account.account_id+'.'+extension;
   const {error}=await db.storage.from('sandbox-voice').upload(path,blob,{...options,upsert:false});
   if(error)throw error;
   return path;
  },
  async list(db){return this.action(db,'list')},
  async review(db,takeId,decision,rating,feedback){return this.action(db,'review',{take_id:takeId,decision,rating,feedback})}
 };
 window.SandboxNativeVoice=api;
})();