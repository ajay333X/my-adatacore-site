import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";
const allowed=(o:string)=>o==="https://www.adatacore.com"||o==="https://adatacore.com"||(o.startsWith("https://my-adatacore-")&&o.endsWith(".vercel.app"));
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")||"";
 const hdr={"Content-Type":"application/json","Access-Control-Allow-Origin":allowed(origin)?origin:"https://www.adatacore.com","Vary":"Origin","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
 const out=(o:unknown,s=200)=>new Response(JSON.stringify(o),{status:s,headers:hdr});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:hdr});
 if(req.method!=="POST")return out({error:"Method not allowed"},405);
 try{
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 const dbUrl=Deno.env.get("SUPABASE_URL"),role=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!token)return out({error:"Sign-in required"},401);
 if(!dbUrl||!role)return out({error:"Database configuration missing"},503);
 const db=createClient(dbUrl,role,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await db.auth.getUser(token);
 if(authError||!user)return out({error:"Invalid session"},401);
 const {data:profile}=await db.from("users").select("role").eq("id",user.id).maybeSingle();
 if(profile?.role!=="admin")return out({error:"Administrator access required"},403);
 const p=await req.json(),n=Number(p.count),d=Number(p.duration_seconds),project=Number(p.project_id),mode=String(p.mode);
 if(project!==94||!Number.isInteger(n)||n<1||n>5||!Number.isInteger(d)||d<60||d>180||!["solo","duo"].includes(mode))return out({error:"Invalid script configuration"},400);
 const language=String(p.language||"English").slice(0,45),scenario=String(p.scenario||"Customer support").slice(0,140);
 const emotions=(Array.isArray(p.emotions)?p.emotions:[]).map((v:unknown)=>String(v).slice(0,40)).slice(0,12);
 // Groq is the fast inference provider already supported by this project (not xAI Grok).
 // Do not silently charge OpenAI when Groq is missing or unavailable.
 const groq=Deno.env.get("GROQ_API_KEY");
 if(!groq)return out({error:"Groq is not configured. Add GROQ_API_KEY in Supabase Edge Function secrets."},503);
 const prompt="Create "+n+" DIFFERENT authentic, emotionally rich "+language+" customer-service dialogue scripts for a "+(mode==="solo"?"single voice actor reading both sides":"pair of voice actors reading Agent and Customer roles")+". Scenario: "+scenario+". Emotions: "+emotions.join(", ")+". Each conversation must contain approximately "+Math.round(d/60*120)+" spoken words (roughly "+d+" seconds). Different situations and resolutions, clear Agent:/Customer: turns, realistic interruptions and corrections, no filler repetition, natural conversational phrases, no real identifying data, financial secrets, dangerous instructions, or made-up company policies. JSON only with key scripts containing "+n+" objects with keys title,scenario,emotion,body. Make sure the scripts are long enough and dialogue remains coherent.";
 const url="https://api.groq.com/openai/v1/chat/completions";
 const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+groq},body:JSON.stringify({model:"llama-3.3-70b-versatile",messages:[{role:"system",content:"Expert voice-script author. Return strict JSON only."},{role:"user",content:prompt}],temperature:.8,response_format:{type:"json_object"},max_tokens:Math.min(9000,Math.max(2800,n*Math.round(d/60*120)*3))})});
 const result=await response.json();
 if(!response.ok)return out({error:"AI provider request failed",detail:String(result.error?.message||"Unknown provider error").slice(0,180)},502);
 const parsed=JSON.parse(result.choices?.[0]?.message?.content||"{}");
 let rows=(Array.isArray(parsed.scripts)?parsed.scripts:[]).slice(0,n).filter((s:any)=>typeof s.body==="string"&&s.body.length>250).map((s:any)=>({project_id:project,mode,title:String(s.title||scenario).slice(0,120),scenario:String(s.scenario||scenario).slice(0,120),emotion:String(s.emotion||"Neutral").slice(0,50),language,duration_seconds:d,body:s.body.slice(0,18000)}));
 if(rows.length===0)return out({error:"Provider returned no valid scripts; please retry"},502);
 const {data,error}=await db.from("vs_scripts").insert(rows).select("id,title");
 if(error)return out({error:"Failed saving scripts",detail:error.message},500);
 return out({created:data?.length||0,scripts:data,provider:"Groq",model:"llama-3.3-70b-versatile"});
 }catch(e){return out({error:"Script generation failed",detail:String(e instanceof Error?e.message:e).slice(0,180)},500)}
});