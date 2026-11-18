import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || "";
const BUCKET = "adatacore-dataset-studio", MAX = 25 * 1024 * 1024;
const db = createClient(SUPABASE_URL, KEY, {auth:{persistSession:false,autoRefreshToken:false}});
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const result = (data:unknown,status=200) => new Response(JSON.stringify(data),{status,headers:cors});
const err = (message:string,status=400) => result({error:message},status);
const strip = (s:unknown) => String(s??"").replace(/<[^>]*>/g," ").replace(/&(?:nbsp|amp|quot|lt|gt);/g,m=>({"&nbsp;":" ","&amp;":"&","&quot;":'"',"&lt;":"<","&gt;":">"}[m]||m)).replace(/\s+/g," ").trim().slice(0,600);
const extFor = (url:string) => (new URL(url, "https://archive.org").pathname.match(/\.(ogg|oga|opus|mp3|wav|flac|webm|m4a|mp4|aac)$/i)?.[1] || "").toLowerCase();
const mime = (ext:string)=>({ogg:"audio/ogg",oga:"audio/ogg",opus:"audio/opus",mp3:"audio/mpeg",wav:"audio/wav",flac:"audio/flac",webm:"audio/webm",m4a:"audio/mp4",mp4:"audio/mp4",aac:"audio/aac"} as Record<string,string>)[ext]||"";
function allowedHost(h:string) {return h==="upload.wikimedia.org"||h==="commons.wikimedia.org"||h==="archive.org"||/^ia\d{2,10}(?:\.us)?\.archive\.org$/.test(h)}
function approved(lic:string,url:string) {
  const lower=(lic+" "+url).toLowerCase();
  if (/(by-nc|by-nd|noncommercial|no.derivatives)/i.test(lower)) return false;
  return /cc\s*by(?:-sa)?(?:\s|\d|$)|cc\s*0|cc0|public.domain|creativecommons\.org\/(licenses\/by(?:-sa)?\/|publicdomain\/)/.test(lower);
}
function kindFor(raw:string) {
  try {const u=new URL(raw);
    if(u.protocol!=="https:")return "external";
    if(u.hostname==="commons.wikimedia.org"||u.hostname==="upload.wikimedia.org")return "commons";
    if(u.hostname==="archive.org"||u.hostname==="www.archive.org")return "archive";
    if(["youtube.com","www.youtube.com","youtu.be","m.youtube.com"].includes(u.hostname))return "youtube";
  }catch(_){}return "external";
}
async function inspect(source:any) {
 const raw=source.source_url||"",kind=kindFor(raw);
 if(kind==="youtube"||kind==="external"){
   await db.from("dataset_studio_sources").update({source_kind:kind,status:"unsupported",last_error:kind==="youtube"?"YouTube downloads are not supported. Upload an authorized recording file instead.":"This host is not supported for automated download. Upload an authorized file."}).eq("id",source.id);
   return {status:"unsupported",message:kind==="youtube"?"YouTube URL saved as a reference only; upload an authorized audio file.":"Link saved for reference; upload an authorized file."};
 }
 let out:any={};
 if(kind==="commons"){
   const u=new URL(raw);
   let file="";
   if(u.hostname==="upload.wikimedia.org")file=u.pathname.split("/").pop()||"";
   else {
     const p=decodeURIComponent(u.pathname);
     if(/^\/wiki\/File:/i.test(p))file=p.slice("/wiki/File:".length);
     else if(/^\/wiki\/Special:FilePath\//i.test(p)) file=p.split("/").pop()||"";
     else file=p.split("/").pop()?.replace(/^File:/i,"")||"";
   }
   file=file.replace(/_/g," ").trim();
   if(!file||file.length>260)throw Error("Could not identify the Wikimedia Commons filename.");
   const api=new URL("https://commons.wikimedia.org/w/api.php");
   api.search=new URLSearchParams({action:"query",format:"json",prop:"imageinfo",iiprop:"url|size|mime|extmetadata",iilimit:"1",titles:"File:"+file}).toString();
   const res=await fetch(api,{headers:{"User-Agent":"AdatacoreDatasetStudio/1.0 (https://www.adatacore.com; public file metadata)"},signal:AbortSignal.timeout(14000)});
   if(!res.ok)throw Error("Wikimedia Commons metadata is temporarily unavailable.");
   const json=await res.json();const page=Object.values(json.query?.pages||{})[0] as any;const info=page?.imageinfo?.[0];
   if(!info)throw Error("No downloadable Commons audio file was found.");
   const meta=info.extmetadata||{};
   const license=strip(meta.LicenseShortName?.value||meta.UsageTerms?.value||"");
   const licenseUrl=strip(meta.LicenseUrl?.value||"");
   out={title:strip(page.title?.replace(/^File:/,""))||file,author:strip(meta.Artist?.value||meta.Credit?.value||""),license_name:license,license_url:licenseUrl,
     metadata:{download_url:info.url,bytes:info.size,source_mime:info.mime,source_page:"https://commons.wikimedia.org/wiki/"+encodeURIComponent(page.title),license_checked_at:new Date().toISOString()}};
 } else {
   const u=new URL(raw);
   const id=(u.pathname.match(/^\/(?:details|download|metadata)\/([\w-]+)/)||[])[1];
   if(!id)throw Error("Use an Internet Archive item URL such as archive.org/details/item-id.");
   const response=await fetch("https://archive.org/metadata/"+encodeURIComponent(id),{signal:AbortSignal.timeout(16000)});
   if(!response.ok)throw Error("Internet Archive metadata could not be read.");
   const data=await response.json();if(data.is_dark||data.is_collection||data.metadata?.is_dark)throw Error("This Archive item is unavailable.");
   const audio=(data.files||[]).filter((x:any)=>/\.(ogg|oga|mp3|wav|flac|m4a|opus|webm)$/i.test(x.name||"") && Number(x.size)>0 && Number(x.size)<=MAX)
     .sort((a:any,b:any)=>(a.source==="original"?-1:0)-(b.source==="original"?-1:0))[0];
   if(!audio)throw Error("No audio file under 25 MB was found in this Archive item.");
   const licenseUrl=strip(data.metadata?.licenseurl||"");const license=strip(data.metadata?.rights||licenseUrl||"Unspecified");
   out={title:strip(data.metadata?.title||id),author:strip(data.metadata?.creator||""),license_name:license,license_url:licenseUrl,
    metadata:{download_url:"https://archive.org/download/"+encodeURIComponent(id)+"/"+audio.name.split("/").map(encodeURIComponent).join("/"),bytes:Number(audio.size),source_mime:mime(extFor(audio.name)),source_page:"https://archive.org/details/"+id,license_checked_at:new Date().toISOString(),source_file:audio.name}};
 }
 const path=out.metadata.download_url;const host=new URL(path).hostname;
 if(!allowedHost(host)||!extFor(path))throw Error("Only recognized audio formats from approved hosts can be imported.");
 const licOK=approved(out.license_name||"",out.license_url||"");
 const patch={...out,source_kind:kind,status:"inspected",last_error:licOK?null:"License needs manual verification. Automatic download is disabled for this source."};
 const {error}=await db.from("dataset_studio_sources").update(patch).eq("id",source.id);if(error)throw Error("Unable to save source metadata.");
 return {status:"inspected",license_approved:licOK,title:out.title,license:out.license_name,bytes:out.metadata.bytes};
}
async function fetchLimited(url:string){
 let current=url;
 for(let hop=0;hop<4;hop++){
  const u=new URL(current);
  if(u.protocol!=="https:"||!allowedHost(u.hostname))throw Error("The audio download redirects to an unapproved host.");
  const response=await fetch(current,{redirect:"manual",signal:AbortSignal.timeout(70000),headers:{"User-Agent":"AdatacoreDatasetStudio/1.0 (https://www.adatacore.com; permitted audio import)"}});
  if([301,302,303,307,308].includes(response.status)){
    const location=response.headers.get("location");if(!location)throw Error("Missing download redirect URL.");current=new URL(location,current).href;continue;
  }
  if(!response.ok||!response.body)throw Error("The source did not provide a downloadable audio file ("+response.status+").");
  const declared=Number(response.headers.get("content-length")||0);
  if(declared>MAX)throw Error("Audio is larger than the 25 MB source limit.");
  const parts:Uint8Array[]=[];let size=0;const reader=response.body.getReader();
  try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX)throw Error("Audio exceeds the 25 MB limit.");parts.push(value)}} finally {await reader.cancel().catch(()=>{})}
  const bytes=new Uint8Array(size);let pos=0;for(const part of parts){bytes.set(part,pos);pos+=part.length}
  return {bytes,type:mime(extFor(current))||response.headers.get("content-type")||"audio/ogg",ext:extFor(current)};
 }
 throw Error("Too many redirects to retrieve this audio file.");
}
async function download(source:any,userId:string){
 if(source.status!=="inspected"||!source.rights_confirmed)throw Error("Inspect the source and confirm reuse rights before downloading.");
 if(!approved(source.license_name||"",source.license_url||""))throw Error("A verified, eligible reuse license is required for automatic downloading. Upload an authorized file instead.");
 const path=String(source.metadata?.download_url||"");
 if(!path||!allowedHost(new URL(path).hostname)||!extFor(path))throw Error("No approved direct audio source was found.");
 const data=await fetchLimited(path);
 if(!data.bytes.length)throw Error("The source audio is empty.");
 const storagePath=userId+"/"+source.id+"/original."+data.ext;
 const {error:e}=await db.storage.from(BUCKET).upload(storagePath,data.bytes,{contentType:data.type,upsert:true});
 if(e)throw Error("Storage upload failed: "+e.message);
 const {error}=await db.from("dataset_studio_sources").update({storage_path:storagePath,source_bytes:data.bytes.length,source_mime:data.type,status:"downloaded",last_error:null}).eq("id",source.id);
 if(error)throw Error("Audio saved but database update failed.");
 return {status:"downloaded",bytes:data.bytes.length};
}

type TranscriptProvider = "groq" | "openai" | "gemini" | "deepgram";
function providerInfo() {
 return {
  groq: {configured:Boolean(Deno.env.get("GROQ_API_KEY")?.trim()), model:"whisper-large-v3-turbo", timestamps:true},
  openai: {configured:Boolean(Deno.env.get("OPENAI_API_KEY")?.trim()), model:"gpt-transcribe", timestamps:false},
  gemini: {configured:Boolean(Deno.env.get("GEMINI_API_KEY")?.trim()), model:"gemini-3.5-transcribe", timestamps:false, free_tier_data_use:true},
  deepgram: {configured:Boolean(Deno.env.get("DEEPGRAM_API_KEY")?.trim()), model:"nova-3", timestamps:true, trial_credits:true}
 };
}
function safeProvider(raw:unknown):TranscriptProvider {
 if(raw==="openai")return "openai";
 if(raw==="gemini")return "gemini";
 if(raw==="deepgram")return "deepgram";
 if(raw==="groq" || raw===undefined || raw===null)return "groq";
 throw Error("Unsupported transcription provider.");
}

const GEMINI_INLINE_LIMIT = 12 * 1024 * 1024; // Keep the encoded JSON payload comfortably below the 20 MB inline request ceiling.
function toBase64(buffer:ArrayBuffer):string {
 const bytes=new Uint8Array(buffer);
 const size=32766; // Multiple of three: padding only at the end of the entire file.
 let output="";
 for(let i=0;i<bytes.length;i+=size){
  const chunk=bytes.subarray(i,Math.min(i+size,bytes.length));
  let binary="";
  for(let j=0;j<chunk.length;j++)binary+=String.fromCharCode(chunk[j]);
  output+=btoa(binary);
 }
 return output;
}
async function geminiTranscribe(bytes:Blob,key:string,language:string):Promise<{transcript:string,segments:any[]}>{
 if(bytes.size>GEMINI_INLINE_LIMIT)throw Error("Gemini inline transcription currently supports WAV clips up to 12 MB. Choose a shorter clip in the editor.");
 const b64=toBase64(await bytes.arrayBuffer());
 // Official Gemini Interactions API: audio content with inline base64 + dedicated ASR model.
 const languageCode=/^[a-z]{2}$/.test(language)?language+"-"+(language==="hi"?"IN":language==="ur"?"PK":"IN"):"";
 const config:any={mode:{type:"verbatim"}};
 if(languageCode && language==="hi")config.language_codes=[languageCode]; // Other languages may be code-switched; let Gemini detect automatically.
 let response:Response;
 try {
  response=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
   method:"POST",
   headers:{"x-goog-api-key":key,"Content-Type":"application/json"},
   body:JSON.stringify({model:"gemini-3.5-transcribe",input:[{type:"audio",data:b64,mime_type:"audio/wav"}],generation_config:{transcription_config:config}}),
   signal:AbortSignal.timeout(90000)
  });
 }catch(_){throw Error("Gemini transcription could not be reached or timed out. Your current transcript was not changed.");}
 if(!response.ok){
  const code=response.status;
  await response.body?.cancel();
  if(code===401||code===403)throw Error("Google Gemini rejected this API key or the project lacks access to Gemini 3.5 Transcribe. Check Google AI Studio.");
  if(code===429)throw Error("Gemini free-tier quota or rate limit reached. Check your project's usage and rate limits in Google AI Studio.");
  if(code===402)throw Error("Gemini project billing or credits are insufficient.");
  if(code===400)throw Error("Gemini rejected this audio request. Ensure the selected clip is a supported WAV file and the model is enabled.");
  throw Error("Gemini transcription failed (HTTP "+code+"). Verify the model's availability for your Google AI Studio project.");
 }
 const output=await response.json();
 if(output.status && output.status!=="completed")throw Error("Gemini did not complete the transcription ("+String(output.status).slice(0,60)+"). Your transcript remains unchanged.");
 const steps=Array.isArray(output.steps)?output.steps:[];
 const texts=steps.filter((step:any)=>step?.type==="model_output").flatMap((step:any)=>Array.isArray(step.content)?step.content:[])
  .filter((item:any)=>item?.type==="text"&&typeof item.text==="string").map((item:any)=>item.text);
 const transcript=texts.join("\n").trim().slice(0,30000);
 if(!transcript)throw Error("Gemini returned no text for this audio. Your transcript remains unchanged.");
 return {transcript,segments:[]};
}


async function deepgramTranscribe(bytes:Blob,key:string,language:string):Promise<{transcript:string,segments:any[]}> {
 // Use a supported Nova-3 monolingual model; otherwise use the multilingual model for a language-detection fallback.
 const supported=new Set(["hi","bn","gu","kn","mr","ne","pa","ta","te","ur","ml","kok","ks","sd","bo","doi","en"]);
 const code=supported.has(language)?language:"multi";
 const query=new URLSearchParams({model:"nova-3",language:code,punctuate:"true",filler_words:"true",smart_format:"false",mip_opt_out:"true"});
 let response:Response;
 try{
  response=await fetch("https://api.deepgram.com/v1/listen?"+query.toString(),{
   method:"POST",
   headers:{"Authorization":"Token "+key,"Content-Type":"audio/wav"},
   body:bytes,signal:AbortSignal.timeout(90000)
  });
 }catch(_){throw Error("Deepgram request timed out or could not connect. Your transcript remains unchanged.");}
 if(!response.ok){
  const status=response.status;
  await response.body?.cancel();
  if(status===401||status===403)throw Error("Deepgram rejected the API key. Check the key and its permissions in Deepgram Console.");
  if(status===402)throw Error("Deepgram API credits are exhausted. The introductory credit balance is not unlimited.");
  if(status===429)throw Error("Deepgram request or concurrency limit reached. Retry after the provider limit resets.");
  if(status===400)throw Error("Deepgram rejected this audio or language (400). Try a different supported language setting.");
  throw Error("Deepgram transcription failed (HTTP "+status+"). Check your Deepgram project.");
 }
 const output=await response.json();
 const alternative=output?.results?.channels?.[0]?.alternatives?.[0];
 const transcript=String(alternative?.transcript||"").trim().slice(0,30000);
 if(!transcript)throw Error("Deepgram produced no spoken text. Your existing transcript was kept.");
 const segments=Array.isArray(alternative?.words)?alternative.words.slice(0,600)
  .filter((word:any)=>Number.isFinite(Number(word.start))&&Number.isFinite(Number(word.end)))
  .map((word:any)=>({start:Number(word.start),end:Number(word.end),text:String(word.punctuated_word||word.word||"").slice(0,2000)})):[];
 return {transcript,segments};
}

async function createDraft(clip:any,provider:TranscriptProvider,allowGoogleDataUse:boolean,allowDeepgramProcessing:boolean) {
 if(provider==="gemini" && !allowGoogleDataUse)throw Error("Google Gemini Free Tier may use submitted audio to improve products. Confirm processing rights and explicitly opt in for this recording.");
 if(provider==="deepgram" && !allowDeepgramProcessing)throw Error("Confirm you have permission to send this recording to Deepgram for transcription.");
 const keyName=provider==="gemini"?"GEMINI_API_KEY":provider==="deepgram"?"DEEPGRAM_API_KEY":provider==="openai"?"OPENAI_API_KEY":"GROQ_API_KEY";
 const key=Deno.env.get(keyName)?.trim();
 if(!key)throw Error(provider==="gemini"?"Gemini API key missing. Add GEMINI_API_KEY in Supabase Edge Function secrets.":provider==="deepgram"?"Deepgram API key missing. Add DEEPGRAM_API_KEY in Supabase Edge Function secrets.":provider==="openai"?"OpenAI API key is missing. Add OPENAI_API_KEY to Supabase Edge Function secrets. ChatGPT subscriptions do not supply API access.":"Groq API key is missing. Add GROQ_API_KEY to Supabase Edge Function secrets.");
 const {data:bytes,error:e}=await db.storage.from(BUCKET).download(clip.storage_path);
 if(e||!bytes)throw Error("Stored clip is unavailable.");
 if(bytes.size>MAX)throw Error("Clip exceeds the audio transcription upload limit.");

 if(provider==="gemini") {
  const draft=await geminiTranscribe(bytes,key,String(clip.language||"").toLowerCase());
  return {...draft,transcript_status:"ai_draft",provider,model_name:"gemini/gemini-3.5-transcribe",timestamps_available:false};
 }
 if(provider==="deepgram") {
  const draft=await deepgramTranscribe(bytes,key,String(clip.language||"").toLowerCase());
  return {...draft,transcript_status:"ai_draft",provider,model_name:"deepgram/nova-3",timestamps_available:draft.segments.length>0};
 }
 const form=new FormData();
 form.append("file",bytes,"clip.wav");
 const model=provider==="openai"?"gpt-transcribe":"whisper-large-v3-turbo";
 form.append("model",model);
 form.append("response_format",provider==="openai"?"json":"verbose_json");
 if(provider==="groq")form.append("timestamp_granularities[]","segment");
 const lang=String(clip.language||"").trim().toLowerCase();
 if(/^[a-z]{2}$/.test(lang)){
  if(provider==="openai")form.append("languages[]",lang);
  else form.append("language",lang);
 }
 const host=provider==="openai"?"https://api.openai.com/v1/audio/transcriptions":"https://api.groq.com/openai/v1/audio/transcriptions";
 let response:Response;
 try {
  response=await fetch(host,{method:"POST",headers:{Authorization:"Bearer "+key},body:form,signal:AbortSignal.timeout(90000)});
 } catch(error) {
  throw Error("Transcription provider could not be reached or timed out. Please retry.");
 }
 if(!response.ok) {
  // Only extract safe provider error classification. Never leak provider messages, keys or request headers.
  const status=response.status;
  const providerBody=await response.json().catch(()=>({}));
  const code=typeof providerBody?.error?.code==="string"?providerBody.error.code.slice(0,100):"";
  const type=typeof providerBody?.error?.type==="string"?providerBody.error.type.slice(0,100):"";
  const kind=code||type;
  const name=provider==="openai"?"OpenAI":"Groq";
  if(status===401||status===403)throw Error(name+" API credentials were rejected. Check the key and its assigned project.");
  if(status===402)throw Error(name+" has insufficient billing credits. Check the API billing settings.");
  if(status===429) {
    if(["credit_balance_exhausted","insufficient_quota"].includes(kind)||
      kind.includes("quota")||kind.includes("credit_balance")) {
      throw Error(name+" API credits or quota are exhausted. This is not a temporary rate limit. Check API billing/usage and add credits or adjust limits before retrying.");
    }
    if(["project_spend_limit_exceeded","organization_spend_limit_exceeded","organization_usage_limit_exceeded","billing_hard_limit_reached"].includes(kind)||
      kind.includes("spend_limit")||kind.includes("usage_limit")) {
      throw Error(name+" API project or organization spending/usage limit was reached ("+kind+"). Review your project and organization limits; retrying alone will not fix it.");
    }
    const rawRetry=response.headers.get("retry-after")||"";
    const seconds=/^[0-9]+$/.test(rawRetry)?Math.min(3600,Math.max(1,Number(rawRetry))):0;
    const retry=seconds?" Retry after at least "+seconds+" seconds.":" Retry after a short delay.";
    if(kind.includes("rate_limit")||kind.includes("rate_limit_exceeded"))throw Error(name+" temporary rate limit reached."+retry+" Repeated immediate retries can worsen the limit.");
    throw Error(name+" returned HTTP 429. This may mean exhausted API credits, a spending limit, or a temporary request rate limit. Check your API billing and limits; do not retry repeatedly until the cause is known.");
  }
  if(status===413)throw Error("The transcription provider rejected this audio size.");
  if(status===400)throw Error(name+" rejected the transcription request (HTTP 400). Verify the selected model, language and audio format.");
  throw Error(name+" transcription failed (HTTP "+status+"). Check the provider configuration and audio format.");
 }
 const output=await response.json();
 const transcript=String(output.text||"").trim().slice(0,30000);
 if(!transcript)throw Error("Transcription returned no text; your existing transcript was kept.");
 const segments=Array.isArray(output.segments)?output.segments.slice(0,600)
  .filter((item:any)=>Number.isFinite(Number(item.start))&&Number.isFinite(Number(item.end)))
  .map((item:any)=>({start:Number(item.start),end:Number(item.end),text:String(item.text||"").slice(0,2000)})):[];
 return {transcript,segments,transcript_status:"ai_draft",provider,model_name:provider+"/"+model,timestamps_available:segments.length>0};
}
async function transcribe(clip:any,provider:TranscriptProvider,replaceExisting:boolean,allowGoogleDataUse:boolean,allowDeepgramProcessing:boolean) {
 if(clip.transcript_status==="human_verified")throw Error("Human-verified transcripts are protected from AI replacement.");
 if(clip.transcript && !replaceExisting)throw Error("Confirm replacement of the existing draft before generating another.");
 const draft=await createDraft(clip,provider,allowGoogleDataUse,allowDeepgramProcessing);
 const {data:saved,error}=await db.from("dataset_studio_clips").update({
  transcript:draft.transcript,transcript_segments:draft.segments,transcript_status:"ai_draft",
  model_name:draft.model_name,updated_at:new Date().toISOString()
 }).eq("id",clip.id).neq("transcript_status","human_verified").select("id").maybeSingle();
 if(error)throw Error("The draft was generated, but saving the result failed.");
 if(!saved)throw Error("This transcript was human-verified while processing; AI changes were not saved.");
 return draft;
}

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return err("Method not allowed.",405);
 try {
  const token=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"")||"";
  if(!token)return err("Authentication is required.",401);
  const {data:userData,error:authErr}=await db.auth.getUser(token);
  const userId=userData?.user?.id;
  if(authErr||!userId)return err("Session invalid.",401);
  const [{data:roles,error:rError},{data:profile,error:pError}]=await Promise.all([
    db.from("admin_staff_roles").select("user_id").eq("user_id",userId).eq("role","super_admin").eq("active",true).limit(1),
    db.from("users").select("accountStatus").eq("id",userId).maybeSingle()]);
  if(rError||pError||!roles?.length||profile?.accountStatus!=="active")return err("Super Admin access is required.",403);
  const body=await req.json();
  const action=String(body?.action||"");
  if(!["inspect","download","transcribe","compare","provider_status"].includes(action))return err("Unknown operation.");
  if(action==="provider_status")return result({providers:providerInfo()});
  if(action==="transcribe"||action==="compare"){
   if(!/^[0-9a-f-]{36}$/i.test(body.clip_id||""))return err("Invalid clip identifier.");
   const {data:clip,error}=await db.from("dataset_studio_clips").select("*").eq("id",body.clip_id).maybeSingle();
   if(error||!clip)return err("Clip not found.",404);
   if(clip.transcript_status==="human_verified")return err("Human-verified transcripts cannot be overwritten or rerun through this tool.",409);
   if(action==="compare"){
    if(body.confirm_api_usage!==true)return err("Confirm that comparison calls two external AI providers and uses API credits.",400);
    if(!Array.isArray(body.providers)||body.providers.length!==2||body.providers[0]===body.providers[1])return err("Choose exactly two different providers.",400);
    const providers=body.providers.map(safeProvider);
    if(providers[0]===providers[1])return err("Choose two different providers.",400);
    const responses=await Promise.allSettled(providers.map(provider=>createDraft(clip,provider,body.allow_google_data_use===true,body.allow_deepgram_processing===true)));
    const results=responses.map((r,i)=>r.status==="fulfilled"
     ?{provider:providers[i],transcript:r.value.transcript,segments:r.value.segments,model_name:r.value.model_name}
     :{provider:providers[i],error:r.reason instanceof Error?r.reason.message:"Transcription failed."});
    // Deliberately no database write: the admin must select and explicitly save a result.
    return result({results,non_persistent:true});
   }
   const provider=safeProvider(body.provider);
   if(clip.transcript&&!body.replace_existing)return err("Confirm replacement of the existing draft before rerunning transcription.",409);
   return result(await transcribe(clip,provider,body.replace_existing===true,body.allow_google_data_use===true,body.allow_deepgram_processing===true));
  }
  if(!/^[0-9a-f-]{36}$/i.test(body.source_id||""))return err("Invalid source identifier.");
  const {data:source,error}=await db.from("dataset_studio_sources").select("*").eq("id",body.source_id).maybeSingle();
  if(error||!source)return err("Source not found.",404);
  try{return result(action==="inspect"?await inspect(source):await download(source,userId))}
  catch(e){const message=e instanceof Error?e.message:"Operation failed";await db.from("dataset_studio_sources").update({last_error:message}).eq("id",source.id);return err(message,422)}
 }catch(e){return err(e instanceof Error?e.message:"Operation failed.",422)}
});