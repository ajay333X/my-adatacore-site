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
 const instructions=String(p.instructions||"").slice(0,5000).trim();
 // Groq is the fast inference provider already supported by this project (not xAI Grok).
 // Do not silently charge OpenAI when Groq is missing or unavailable.
 const groq=Deno.env.get("GROQ_API_KEY");
 if(!groq)return out({error:"Groq is not configured. Add GROQ_API_KEY in Supabase Edge Function secrets."},503);
 const promptTemplate=String(p.prompt_template||"").slice(0,8000).trim();
 const replacements:Record<string,string>={
  count:String(n),language,mode:mode==="solo"?"single voice actor reading both sides":"pair of voice actors reading Agent and Customer roles",
  scenario,emotions:emotions.join(", "),duration_seconds:String(d),
  word_count:String(Math.round(d/60*120))
 };
 const defaultPrompt="Create "+n+" DIFFERENT authentic, emotionally rich "+language+" customer-service dialogue scripts for a "+replacements.mode+". Scenario: "+scenario+". Emotions: "+emotions.join(", ")+". Each conversation must contain approximately "+replacements.word_count+" spoken words (roughly "+d+" seconds). Different situations and resolutions, clear Agent:/Customer: turns, realistic interruptions and corrections, no filler repetition, natural conversational phrases, no real identifying data, financial secrets, dangerous instructions, or made-up company policies. JSON only with key scripts containing "+n+" objects with keys title,scenario,emotion,body. Make sure the scripts are long enough and dialogue remains coherent.";
 const customizedPrompt=promptTemplate?promptTemplate.replace(/\\{(count|language|mode|scenario|emotions|duration_seconds|word_count)\\}/g,(_:string,key:string)=>replacements[key]||""):"";
 const prompt=(customizedPrompt||defaultPrompt)+" Must return exactly "+n+" scripts with keys title, scenario, emotion and body as schema-valid JSON. No markdown."+(instructions?" Additional administrator directions: "+instructions:"");
 const url="https://api.groq.com/openai/v1/chat/completions";
 const schema={type:"object",additionalProperties:false,properties:{
  scripts:{type:"array",items:{type:"object",additionalProperties:false,properties:{
   title:{type:"string"},scenario:{type:"string"},emotion:{type:"string"},body:{type:"string"}
  },required:["title","scenario","emotion","body"]}}
 },required:["scripts"]};
 let parsed:any=null,providerError="";
 // Generate each short script as an independently validated response. A bad JSON
 // generation should not discard already-created scripts in the caller's batch.
 for(let attempt=0;attempt<3;attempt++){
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+groq},body:JSON.stringify({
   model:"openai/gpt-oss-120b",
   messages:[
    {role:"system",content:"You create excellent realistic dialogue. Return only the JSON object described by the provided schema."},
    {role:"user",content:prompt+" Exactly "+n+" unique scripts are required. Keep body text as one escaped JSON string per script and do not include markdown."}
   ],
   temperature:0.65,reasoning_effort:"low",reasoning_format:"hidden",
   response_format:{type:"json_schema",json_schema:{name:"voice_scripts",strict:true,schema}},
   max_completion_tokens:Math.min(12000,Math.max(4000,n*Math.round(d/60*120)*5))
  })});
  const result=await response.json();
  if(!response.ok){
   providerError=String(result.error?.message||"Unknown provider error").slice(0,220);
   // A transient constrained-generation error merits a retry. Do not retry
   // authentication, permission or model-access failures.
   if(response.status!==400&&response.status!==422&&response.status!==502&&response.status!==503)break;
   if(!/json|generat|schema|validat|temporar|timeout/i.test(providerError))break;
   continue;
  }
  try{
   const candidate=JSON.parse(result.choices?.[0]?.message?.content||"{}");
   if(Array.isArray(candidate.scripts)&&candidate.scripts.length>0&&candidate.scripts.every((s:any)=>typeof s.body==="string"&&s.body.length>250)){
    parsed=candidate;break;
   }
   providerError="The AI response was incomplete or shorter than requested.";
  }catch(_){providerError="The AI response could not be parsed as JSON."}
 }
 if(!parsed)return out({error:"Groq could not produce a valid script after three attempts",detail:providerError||"Please retry"},502);
 let rows=(Array.isArray(parsed.scripts)?parsed.scripts:[]).slice(0,n).filter((s:any)=>typeof s.body==="string"&&s.body.length>250).map((s:any)=>({project_id:project,mode,title:String(s.title||scenario).slice(0,120),scenario:String(s.scenario||scenario).slice(0,120),emotion:String(s.emotion||"Neutral").slice(0,50),language,duration_seconds:d,body:s.body.slice(0,18000)}));
 if(rows.length===0)return out({error:"Provider returned no valid scripts; please retry"},502);
 const {data,error}=await db.from("vs_scripts").insert(rows).select("id,title");
 if(error)return out({error:"Failed saving scripts",detail:error.message},500);
 // Persist the exact creation settings, prompt and returned JSON for inspection
 // in Audio Lab 2. Never store the secret provider credential in this audit log.
 let logWarning="";
 for(const created of data||[]){
  const original=(parsed.scripts||[]).find((item:any)=>String(item.title||scenario).slice(0,120)===created.title)||parsed.scripts?.[0]||null;
  const {error:historyError}=await db.from("vs_script_generations").insert({
   project_id:project,script_id:created.id,requested_by:user.id,
   provider:"Groq",model:"openai/gpt-oss-120b",
   request_json:{count:n,mode,language,scenario,emotions,duration_seconds:d,instructions,prompt_template:promptTemplate},
   prompt_text:prompt,output_json:{scripts:original?[original]:[]}
  });
  if(historyError)logWarning="Script created, but generation history was not saved.";
 }
 return out({created:data?.length||0,scripts:data,provider:"Groq",model:"openai/gpt-oss-120b",warning:logWarning});
 }catch(e){return out({error:"Script generation failed",detail:String(e instanceof Error?e.message:e).slice(0,180)},500)}
});