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
async function transcribe(clip:any) {
 const key=Deno.env.get("GROQ_API_KEY")?.trim();
 if(!key)throw Error("AI transcription is unavailable: GROQ_API_KEY is not configured.");
 const {data:bytes,error:e}=await db.storage.from(BUCKET).download(clip.storage_path);
 if(e||!bytes)throw Error("Stored clip is unavailable.");
 if(bytes.size>MAX)throw Error("Clip is too large to transcribe.");
 const form=new FormData();
 form.append("file",bytes,"clip.wav");
 form.append("model","whisper-large-v3-turbo");
 form.append("response_format","verbose_json");
 form.append("timestamp_granularities[]","segment");
 form.append("temperature","0");
 const lang=String(clip.language||"").trim().toLowerCase();
 if(/^[a-z]{2}$/.test(lang))form.append("language",lang);
 const resp=await fetch("https://api.groq.com/openai/v1/audio/transcriptions",{method:"POST",headers:{Authorization:"Bearer "+key},body:form,signal:AbortSignal.timeout(90000)});
 if(!resp.ok)throw Error("Speech recognition provider rejected this clip ("+resp.status+").");
 const output=await resp.json(),transcript=String(output.text||"").slice(0,30000),segments=Array.isArray(output.segments)?output.segments.slice(0,600).map((s:any)=>({start:s.start,end:s.end,text:String(s.text||"").slice(0,2000)})):[];
 const {error}=await db.from("dataset_studio_clips").update({transcript,transcript_segments:segments,transcript_status:"ai_draft",model_name:"groq/whisper-large-v3-turbo"}).eq("id",clip.id);
 if(error)throw Error("Transcription succeeded but could not be stored.");
 return {transcript,segments,transcript_status:"ai_draft"};
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
  if(!["inspect","download","transcribe"].includes(action))return err("Unknown operation.");
  if(action==="transcribe"){
   if(!/^[0-9a-f-]{36}$/i.test(body.clip_id||""))return err("Invalid clip identifier.");
   const {data:clip,error}=await db.from("dataset_studio_clips").select("*").eq("id",body.clip_id).maybeSingle();
   if(error||!clip)return err("Clip not found.",404);
   return result(await transcribe(clip));
  }
  if(!/^[0-9a-f-]{36}$/i.test(body.source_id||""))return err("Invalid source identifier.");
  const {data:source,error}=await db.from("dataset_studio_sources").select("*").eq("id",body.source_id).maybeSingle();
  if(error||!source)return err("Source not found.",404);
  try{return result(action==="inspect"?await inspect(source):await download(source,userId))}
  catch(e){const message=e instanceof Error?e.message:"Operation failed";await db.from("dataset_studio_sources").update({last_error:message}).eq("id",source.id);return err(message,422)}
 }catch(e){return err(e instanceof Error?e.message:"Operation failed.",422)}
});