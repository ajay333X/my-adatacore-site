import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";

const allowedOrigin=(origin:string)=>origin==="https://adatacore.com"||origin==="https://www.adatacore.com"||(origin.startsWith("https://my-adatacore-")&&origin.endsWith(".vercel.app"));
const allowedMime=new Set(["audio/wav","audio/x-wav","audio/wave","audio/mpeg","audio/mp3","audio/mp4","audio/x-m4a","audio/ogg","audio/webm","audio/flac","audio/x-flac","application/ogg","video/mp4"]);
function distance<T>(a:T[],b:T[]){
 const old=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  let prev=old[0];old[0]=i;
  for(let j=1;j<=b.length;j++){
   const temp=old[j];
   old[j]=Math.min(old[j]+1,old[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));
   prev=temp;
  }
 }
 return old[b.length];
}
function normalize(s:string){return s.toLocaleLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}\s]/gu," ").trim().replace(/\s+/g," ")}
Deno.serve(async request=>{
 const origin=request.headers.get("origin")||"";
 const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":allowedOrigin(origin)?origin:"https://www.adatacore.com","Vary":"Origin","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
 const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(request.method!=="POST")return reply({error:"Method not allowed"},405);
 try{
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return reply({error:"Sign in required"},401);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),groq=Deno.env.get("GROQ_API_KEY");
  if(!url||!key||!groq)return reply({error:"Playground provider is not configured"},503);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await db.auth.getUser(token);
  if(error||!user)return reply({error:"Sign in required"},401);
  // Service-role RPC does not inherit a user identity; use authenticated role
  // plus the same verified account check as the CoreForge super-admin guard.
  const {data:profile,error:profileError}=await db.from("users").select("role,accountStatus").eq("id",user.id).maybeSingle();
  if(profileError||profile?.role!=="admin"||profile.accountStatus!=="active")return reply({error:"Administrator permission required"},403);
  // Validate scoped super-admin status with the user's authenticated JWT.
  const actor=createClient(url,"sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml",{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const permitted=await actor.rpc("get_my_admin_access");
  if(permitted.error||permitted.data?.is_super_admin!==true)return reply({error:"Super Admin permission required"},403);

  const length=Number(request.headers.get("content-length")||0);
  if(length>12*1024*1024)return reply({error:"Audio too large. Use a file below 10 MB."},413);
  const form=await request.formData();
  const file=form.get("audio");
  if(!(file instanceof File)||file.size<512||file.size>10*1024*1024)return reply({error:"Choose an audio file between 512 bytes and 10 MB."},400);
  const mime=file.type.split(";")[0].toLowerCase();
  const ext=String(file.name||"").toLowerCase().split(".").pop()||"";
  if(!allowedMime.has(mime)&&!["wav","mp3","mp4","m4a","flac","ogg","webm","mpeg","mpga"].includes(ext))return reply({error:"Use WAV, MP3, MP4, M4A, FLAC, OGG or WebM audio."},400);
  const language=String(form.get("language")||"hi");
  if(!["hi","en","auto"].includes(language))return reply({error:"Unsupported language"},400);
  const reference=String(form.get("reference")||"").slice(0,15000);
  const started=Date.now();
  const outbound=new FormData();
  outbound.set("file",file,file.name||"sample.webm");
  outbound.set("model","whisper-large-v3-turbo");
  outbound.set("response_format","json");
  if(language!=="auto")outbound.set("language",language);
  const result=await fetch("https://api.groq.com/openai/v1/audio/transcriptions",{method:"POST",headers:{Authorization:"Bearer "+groq},body:outbound,signal:AbortSignal.timeout(100000)});
  const body=await result.json().catch(()=>({}));
  if(!result.ok)return reply({error:"Hosted baseline transcription failed",detail:String(body.error?.message||"Provider error").slice(0,240)},502);
  const transcript=String(body.text||"").trim();
  if(!transcript)return reply({error:"Model returned an empty transcript"},502);
  let metrics:null|{wer:number,cer:number,word_edits:number,reference_words:number,character_edits:number,reference_chars:number}=null;
  if(reference.trim()){
   const a=normalize(reference),b=normalize(transcript);
   const wordsA=a?a.split(" "):[],wordsB=b?b.split(" "):[];
   const charsA=Array.from(a.replace(/\s/g,"")),charsB=Array.from(b.replace(/\s/g,""));
   const editsW=distance(wordsA,wordsB),editsC=distance(charsA,charsB);
   metrics={wer:Math.round(editsW/Math.max(1,wordsA.length)*10000)/100,cer:Math.round(editsC/Math.max(1,charsA.length)*10000)/100,word_edits:editsW,reference_words:wordsA.length,character_edits:editsC,reference_chars:charsA.length};
  }
  return reply({transcript,model:"whisper-large-v3-turbo",provider:"Groq",source:"hosted_baseline_not_adatacore_finetune",duration_ms:Date.now()-started,metrics});
 }catch(error){return reply({error:"Speech AI Playground failed",detail:String(error instanceof Error?error.message:error).slice(0,180)},500)}
});