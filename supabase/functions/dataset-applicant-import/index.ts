import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const BASE = Deno.env.get("SUPABASE_URL") || "";
const SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default || "";
const PUBLIC_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml";
const BUCKET = "adatacore-dataset-studio";
const SOURCE_BUCKET = "application_assessments";
const MAX_BYTES = 25*1024*1024;
const db = createClient(BASE,SECRET,{auth:{persistSession:false,autoRefreshToken:false}});
const headers = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"apikey,authorization,content-type,x-client-info","Content-Type":"application/json"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const fail=(message:string,status=400)=>json({error:message},status);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const indic=new Set(["hi","bn","ta","ml","te","mr","kn","gu","pa","or","as","ur","ne","sa","kok","mai","sd","ks","mni","bo","doi","sat"]);
const types:Record<string,string>={webm:"audio/webm",ogg:"audio/ogg",oga:"audio/ogg",wav:"audio/wav",mp3:"audio/mpeg",m4a:"audio/mp4",mp4:"audio/mp4",aac:"audio/aac"};
Deno.serve(async(request:Request)=>{
 if(request.method==="OPTIONS")return new Response(null,{headers});
 if(request.method!=="POST")return fail("Method not allowed.",405);
 try {
  const bearer=request.headers.get("Authorization")?.replace(/^Bearer\s+/i,"")||"";
  if(!bearer)return fail("Sign in required.",401);
  const {data:auth,error:authError}=await db.auth.getUser(bearer);
  const uid=auth.user?.id;
  if(authError||!uid)return fail("Authentication expired.",401);
  const [{data:roles,error:roleError},{data:user,error:userError}]=await Promise.all([
   db.from("admin_staff_roles").select("user_id").eq("user_id",uid).eq("role","super_admin").eq("active",true).limit(1),
   db.from("users").select("accountStatus").eq("id",uid).maybeSingle()
  ]);
  if(roleError||userError||!roles?.length||user?.accountStatus!=="active")return fail("Only active Super Admins can import applicant recordings.",403);
  const payload=await request.json().catch(()=>null);
  const id=String(payload?.application_id||"");
  if(!uuid.test(id))return fail("Invalid application identifier.");
  const {data:review,error:reviewError}=await db.from("dataset_studio_applicant_reviews").select("*").eq("application_id",id).maybeSingle();
  if(reviewError||!review)return fail("Review the application audio before importing.",409);
  if(review.imported_source_id)return json({source_id:review.imported_source_id,status:"already_imported"});
  if(review.decision!=="selected"||review.explicit_consent_confirmed!==true||String(review.consent_evidence||"").trim().length<12){
   return fail("Select this recording and record specific, verifiable applicant permission for dataset reuse.",409);
  }
  // Resolve original recording from the existing permission-checked application RPC using the caller's JWT.
  const caller=createClient(BASE,PUBLIC_KEY,{global:{headers:{Authorization:"Bearer "+bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:detail,error:detailError}=await caller.rpc("admin_application_detail",{p_application_id:id});
  const app=detail?.application;
  if(detailError||!app||app.track!=="voice_acting"||!app.recording_path||app.recording_bucket!==SOURCE_BUCKET){
   return fail("Application voice audio could not be resolved.",404);
  }
  const code=String(app.language_code||"").split("-")[0].toLowerCase();
  if(!indic.has(code))return fail("This dataset currently accepts Indic-language recordings only.",422);
  const ext=String(app.recording_path).toLowerCase().match(/\.(webm|ogg|oga|wav|mp3|m4a|mp4|aac)$/)?.[1]||"webm";
  if(!types[ext])return fail("Unsupported original recording format.",422);
  const {data:original,error:sourceError}=await db.storage.from(SOURCE_BUCKET).download(app.recording_path);
  if(sourceError||!original)return fail("Private application audio could not be retrieved.",404);
  if(original.size<100||original.size>MAX_BYTES)return fail("Recording exceeds the 25 MB import limit.",422);
  const sourceId=crypto.randomUUID();
  const storagePath=uid+"/"+sourceId+"/original."+ext;
  const {error:copyError}=await db.storage.from(BUCKET).upload(storagePath,original,{contentType:types[ext],upsert:false});
  if(copyError)return fail("Unable to save private dataset source: "+copyError.message,422);
  const {error:insertError}=await db.from("dataset_studio_sources").insert({
   id:sourceId,created_by:uid,source_kind:"upload",language:code,
   title:"Private application recording — "+(app.language_label||code),
   author:"Applicant (identity withheld)",license_name:"Explicit applicant reuse permission on file",
   rights_confirmed:true,status:"uploaded",storage_path:storagePath,source_bytes:original.size,
   source_mime:types[ext],duration_seconds:Math.round(Number(app.recording_duration_ms||0)/1000)||null,
   metadata:{origin:"private_voice_application",source_application_id:id,scripted_assessment:true,
    rights_reference:review.consent_evidence,privacy:"private",publication_requires_manual_review:true,
    imported_at:new Date().toISOString()}
  });
  if(insertError){await db.storage.from(BUCKET).remove([storagePath]);return fail("Source registry could not be updated: "+insertError.message,422)}
  const {error:statusError}=await db.from("dataset_studio_applicant_reviews").update({
   decision:"imported",imported_source_id:sourceId,reviewed_at:new Date().toISOString()
  }).eq("application_id",id);
  if(statusError)return fail("Audio copied but review status could not be updated; check Dataset Studio before retrying.",500);
  return json({status:"imported",source_id:sourceId,bytes:original.size,language:code});
 }catch(e){console.error("Dataset application import error",e instanceof Error?e.name:"unknown");
  return fail("Applicant import failed. Confirm consent and retry.",422);
 }
});