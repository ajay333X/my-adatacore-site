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
  id,account:null,
  async action(db,name,payload={}){
   const {data,error}=await db.rpc('admin_sandbox_voice_action',{p_session_id:id,p_action:name,p_payload:payload});
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
   if(name==='vs_enter')return this.action(db,'enter',{mode:args.p_mode});
   if(name==='vs_leave')return this.action(db,'leave',{take_id:args.p_session});
   if(name==='vs_submit')return this.action(db,'submit',{
    take_id:args.p_session,extension:String(args.p_path||'').split('.').pop(),
    seconds:args.p_seconds,mime:args.p_mime,bytes:args.p_bytes
   });
   if(name==='vs_save_transcript')return this.action(db,'transcript',{take_id:args.p_session,text:args.p_text});
   throw Error('Production Voice RPC "'+name+'" is disabled in sandbox mode.');
  },
  storagePath(takeId,extension){
   if(!uuid.test(takeId)||!this.account?.account_id)throw Error('Missing verified sandbox recording');
   if(!['webm','mp4','ogg'].includes(extension))throw Error('Unsupported sandbox audio extension');
   return this.account.owner_id ? this.account.owner_id+'/'+takeId+'/'+this.account.account_id+'.'+extension : null;
  },
  async upload(db,takeId,extension,blob,options={}){
   const {data:{user},error:authError}=await db.auth.getUser();
   if(authError||!user)throw Error('Sandbox login required');
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