import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "https://www.adatacore.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const clean=(value:unknown,max:number)=>String(value??"").slice(0,max);

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return new Response("Method not allowed",{status:405,headers:cors});
  try{
    const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
    if(!token)return new Response("Unauthorized",{status:401,headers:cors});
    const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    const {data:userData,error:userError}=await admin.auth.getUser(token);
    if(userError||!userData.user)return new Response("Unauthorized",{status:401,headers:cors});
    const since=new Date(Date.now()-60000).toISOString();
    const {count}=await admin.schema("app_private").from("client_error_events").select("id",{count:"exact",head:true}).eq("user_id",userData.user.id).gte("created_at",since);
    if((count||0)>=20)return new Response(JSON.stringify({ok:true,throttled:true}),{status:202,headers:{...cors,"Content-Type":"application/json"}});
    const body=await req.json().catch(()=>({}));
    const {error}=await admin.schema("app_private").from("client_error_events").insert({
      user_id:userData.user.id,
      route:clean(body.route,500)||"/",
      message:clean(body.message,4000)||"Unknown client error",
      stack:clean(body.stack,12000)||null,
      source:clean(body.source,1500)||null,
      line_no:Number.isFinite(Number(body.line))?Math.trunc(Number(body.line)):null,
      column_no:Number.isFinite(Number(body.column))?Math.trunc(Number(body.column)):null,
      user_agent:clean(body.userAgent,1000)||null,
      release:clean(body.release,120)||null,
      metadata:body.metadata&&typeof body.metadata==="object"&&!Array.isArray(body.metadata)?body.metadata:{}
    });
    if(error)throw error;
    return new Response(JSON.stringify({ok:true}),{status:200,headers:{...cors,"Content-Type":"application/json"}});
  }catch(error){console.error("client-error-report",error);return new Response(JSON.stringify({ok:false}),{status:500,headers:{...cors,"Content-Type":"application/json"}})}
});
