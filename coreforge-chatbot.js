(()=>{'use strict';
const U='https://llmhyezgcnbognmmsnzq.supabase.co',K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const $=id=>document.getElementById(id);
let inference=null,history=[],busy=false,loading=false;
const status=(s)=>{$('cflStatus').textContent=s};
function addMessage(role,content){
 const card=document.createElement('div');card.className='cfl-message '+role;
 const tag=document.createElement('span');tag.textContent=role==='user'?'You':'Qwen3 · local';
 const text=document.createElement('div');text.className='cfl-message-text';text.textContent=content;
 card.append(tag,text);$('cflMessages').append(card);
 $('cflMessages').scrollTop=$('cflMessages').scrollHeight;
 return text;
}
function cleanAnswer(raw){
 const value=String(raw||'');
 // Qwen3 sometimes emits a reasoning block. Never render it as customer-facing text.
 const afterClosedThink=value.replace(/<think>[\\s\\S]*?<\\/think>/gi,'').trim();
 if(/<think>/i.test(afterClosedThink))return '';
 return afterClosedThink.replace(/<\\/?(?:think|answer)>/gi,'').trim();
}
function setUsable(yes){$('cflPrompt').disabled=!yes;$('cflSend').disabled=!yes;$('cflLoad').disabled=yes;$('cflReady').textContent=yes?'Qwen ready locally':loading?'Downloading model':'Model not loaded';$('cflHint').textContent=yes?'Running entirely in your browser · not Groq':'Load the model to begin.'}
async function checkAccess(){
 try{
  if(!window.supabase?.createClient)throw Error('Secure login library unavailable');
  const client=window.supabase.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
  const {data:{user}}=await client.auth.getUser();
  if(!user){location.replace('/auth');return false}
  const {data,error}=await client.rpc('get_my_admin_access');
  if(error||!data?.is_super_admin){location.replace('/admin');return false}
  $('cflGate').hidden=true;$('cflApp').hidden=false;
  return true;
 }catch(error){$('cflGate').textContent='Unable to verify CoreForge access: '+String(error.message||error);return false}
}
async function boot(){
 if(!(await checkAccess()))return;
 const supported=Boolean(navigator.gpu);
 status(supported?'WebGPU available. Select Load local model.':'This browser does not expose WebGPU. Open Chrome or Edge on a compatible device.');
 $('cflLoad').disabled=!supported;
 $('cflLoad').onclick=async()=>{
  if(loading||inference)return;
  loading=true;setUsable(false);$('cflLoad').disabled=true;$('cflProgress').hidden=false;$('cflProgressFill').style.width='3%';
  try{
   status('Loading inference engine. This first setup may download a large model.');
   const lib=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm');
   lib.env.allowLocalModels=false;
   lib.env.useBrowserCache=true;
   inference=await lib.pipeline('text-generation','onnx-community/Qwen3-0.6B-ONNX',{device:'webgpu',dtype:'q4f16',progress_callback:p=>{
    if(p.status==='progress'&&typeof p.progress==='number'){$('cflProgressFill').style.width=Math.max(3,Math.min(100,p.progress))+'%'}
    if(p.status==='done')status('Loaded a model component; finalizing...');
    else if(p.status==='initiate')status('Downloading model weights and components...');
   }});
   loading=false;$('cflProgressFill').style.width='100%';setUsable(true);
   status('Model loaded. Your prompts are processed locally, not by Groq.');
   $('cflPrompt').focus();
  }catch(error){
   loading=false;inference=null;setUsable(false);$('cflLoad').disabled=false;
   $('cflProgress').hidden=true;status('Unable to load local model: '+String(error.message||error).slice(0,250));
  }
 };
 $('cflForm').onsubmit=async e=>{
  e.preventDefault();
  const question=$('cflPrompt').value.trim();if(!question||!inference||busy)return;
  if(history.length>=18)history=history.slice(-16);
  busy=true;$('cflSend').disabled=true;$('cflPrompt').disabled=true;
  $('cflMessages').querySelector('.cfl-placeholder')?.remove();
  addMessage('user',question);$('cflPrompt').value='';status('Qwen is generating locally...');
  const output=addMessage('assistant','Generating...');
  const messages=[{role:'system',content:'You are Adatacore Assistant, a multilingual chatbot. Answer directly in the same language as the user, accurately and concisely. Do not reveal analysis or thinking text. Do not claim to have been specially trained by Adatacore. Be clear when you cannot access business PDFs or data.'},...history,{role:'user',content:question+'\\n/no_think'}];
  try{
   const res=await inference(messages,{max_new_tokens:320,do_sample:false});
   const generated=res?.[0]?.generated_text;
   const last=Array.isArray(generated)?generated.at(-1):null;
   const content=cleanAnswer(last?.content|| (typeof generated==='string'?generated:'') ||'');
   if(!content)throw Error('The model did not produce a final answer. Please try again or use a stronger model.');
   output.textContent=content;
   history.push({role:'user',content:question},{role:'assistant',content});
   status('Answer generated on this device. No hosted inference API was called.');
  }catch(error){output.textContent='Unable to generate response: '+String(error.message||error);status('Inference failed. Try a shorter question.')}
  finally{busy=false;$('cflSend').disabled=false;$('cflPrompt').disabled=false;$('cflPrompt').focus()}
 };
 $('cflClear').onclick=()=>{if(busy)return;history=[];$('cflMessages').replaceChildren();const p=document.createElement('p');p.className='cfl-empty';p.textContent='Conversation cleared. The model stays loaded locally.';$('cflMessages').append(p);status('No conversation saved.')};
 $('cflPrompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();$('cflForm').requestSubmit()}});
}
window.addEventListener('DOMContentLoaded',boot);
})();