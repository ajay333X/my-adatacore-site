import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.57.4";
import sanitizeHtml from "npm:sanitize-html@2.18.2";

const site="https://www.adatacore.com";
const logo=site+"/assets/adatacore-logo.jpg";
const origins=new Set([site,"https://adatacore.com"]);
const emailRE=/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,30}$/i;
const localRE=/^[a-z0-9._+-]{1,64}$/i;
const maxBatch=250;
const limits={perSend:250,perHour:250,perDay:500};
const preferred=["hello","applications","notifications","updates","team","support","partnerships","contact","no-reply"];
const safeStyle=/^(?!.*(?:url\s*\(|expression\s*\(|javascript\s*:|@import|behavior\s*:|binding\s*:))[a-z0-9\s#.,()%\/+!:-]{1,170}$/i;
const cssProps=["color","background","background-color","font-size","font-family","font-weight","font-style","line-height","letter-spacing","text-align","text-decoration","display","padding","padding-left","padding-right","padding-top","padding-bottom","margin","margin-top","margin-bottom","margin-left","margin-right","border","border-color","border-style","border-width","border-radius","width","max-width","min-width","height","max-height","vertical-align","white-space"];
const styles:Record<string,Record<string,RegExp[]>>={"*":{}};
for(const prop of cssProps)styles["*"][prop]=[safeStyle];
function esc(v:unknown){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function safeHtml(raw:string){
 return sanitizeHtml(raw,{
  allowedTags:["div","span","p","br","hr","strong","b","em","i","u","s","h1","h2","h3","h4","h5","h6","blockquote","center","small","sup","sub","pre","code","ul","ol","li","a","img","table","thead","tbody","tfoot","tr","td","th"],
  allowedAttributes:{"*":["style","align","valign","bgcolor","width","height","title"],"a":["href","style","title","target","rel"],"img":["src","alt","width","height","style"],"table":["role","cellpadding","cellspacing","border","width","style","bgcolor"],"td":["colspan","rowspan","align","valign","style","bgcolor","width","height"],"th":["colspan","rowspan","align","valign","style","bgcolor","width","height"]},
  allowedSchemes:["https","http","mailto"],allowedSchemesByTag:{"img":["https"]},
  allowProtocolRelative:false,allowedStyles:styles,disallowedTagsMode:"discard"
 });
}
function inlineText(raw:string){
 let s=esc(raw);
 s=s.replace(/\[\[button:([^\]|\n]{1,90})\|(https?:\/\/[^\s\]<>]{3,400})\]\]/gi,(_all,label,url)=>
 '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0"><tr><td bgcolor="#205c94" style="border-radius:9px;background-color:#205c94"><a href="'+url+'" style="display:inline-block;padding:14px 23px;background-color:#205c94;border-radius:9px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">'+label+'</a></td></tr></table>');
 s=s.replace(/\[([^\]\n]{1,140})\]\((https?:\/\/[^\s<>()]{3,400})\)/gi,(_all,label,url)=>'<a href="'+url+'" style="color:#2469a4;text-decoration:underline">'+label+'</a>');
 s=s.replace(/\*\*([^*\n]{1,1200})\*\*/g,"<strong>$1</strong>");
 s=s.replace(/(^|[^*])\*([^*\n]{1,1200})\*(?!\*)/g,"$1<em>$2</em>");
 return s;
}
function markdown(raw:string){
 let out="",list:"ul"|"ol"|null=null;
 const close=()=>{if(list){out+="</"+list+">";list=null;}};
 for(const original of raw.replace(/\r\n?/g,"\n").split("\n")){
  const line=original.trim();
  if(!line){close();continue;}
  if(/^---+$/.test(line)){close();out+='<hr style="border:0;border-top:1px solid #e3e9f0;margin:22px 0">';continue;}
  const h=line.match(/^(#{1,3})\s+(.+)$/);
  if(h){close();const sz=h[1].length===1?25:h[1].length===2?20:17;out+='<h2 style="font-size:'+sz+'px;margin:15px 0 13px;line-height:1.35;color:#1a2b43">'+inlineText(h[2])+"</h2>";continue;}
  const ul=line.match(/^[-*]\s+(.+)$/),ol=line.match(/^\d+\.\s+(.+)$/);
  if(ul||ol){const kind=ul?"ul":"ol";if(list!==kind){close();out+="<"+kind+' style="margin:0 0 18px;padding-left:24px;font-size:15px;line-height:1.75;color:#374151">';list=kind;}out+='<li style="margin:4px 0">'+inlineText((ul||ol)![1])+"</li>";continue;}
  close();
  if(/^>\s*/.test(line)){out+='<blockquote style="margin:10px 0 18px;padding:11px 18px;background:#f5f8fc;border-left:3px solid #b5d0ec;color:#4b5f76;font-size:15px;line-height:1.7">'+inlineText(line.replace(/^>\s*/,""))+"</blockquote>";continue;}
  out+='<p style="margin:0 0 17px;color:#354459;font-size:15px;line-height:1.8">'+inlineText(line)+"</p>";
 }
 close();return out||'<p style="color:#64748b">Your message appears here.</p>';
}
function render(content:string,mode:string,branded:boolean){
 const inner=safeHtml(mode==="html"?content:markdown(content));
 if(!branded)return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:18px;background:#fff;font-family:Arial,Helvetica,sans-serif">'+inner+'</body></html>';
 return [
 '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
 '<body style="margin:0;padding:0;background:#f3f6fa;color:#1b2d43;font-family:Arial,Helvetica,sans-serif">',
 '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fa"><tr><td align="center" style="padding:32px 14px">',
 '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border:1px solid #dfe7f0;border-radius:14px">',
 '<tr><td style="padding:23px 32px;border-bottom:1px solid #e9eef5"><table role="presentation" cellpadding="0" cellspacing="0"><tr>',
 '<td><img src="'+logo+'" width="38" height="38" alt="Adatacore" style="display:block;border-radius:9px"></td>',
 '<td style="padding-left:11px;color:#17263a;font-size:19px;font-weight:700;letter-spacing:-.02em">Adatacore</td></tr></table></td></tr>',
 '<tr><td style="padding:32px 34px 26px">'+inner+'</td></tr>',
 '<tr><td style="padding:20px 32px;background:#fafbfe;border-top:1px solid #edf1f5;color:#718096;font-size:12px;line-height:1.6">',
 'Sent by Adatacore · <a href="'+site+'" style="color:#39729d;text-decoration:none">adatacore.com</a>',
 '</td></tr></table></td></tr></table></body></html>'
 ].join("");
}
function json(obj:unknown,status=200,origin=""){
 const h=new Headers({"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"});
 if(origins.has(origin))h.set("Access-Control-Allow-Origin",origin);
 return new Response(JSON.stringify(obj),{status,headers:h});
}
function err(message:string,status=400,origin=""){return json({error:message},status,origin);}
function normalizeEmail(v:unknown){return String(v??"").trim().toLowerCase();}
function validEmail(v:string){return v.length<=320&&emailRE.test(v);}
function hashable(kind:string,projectId:number|null,level:string,recipients:string[]){
 return JSON.stringify({kind,projectId,level,recipients:[...recipients].sort()});
}
async function digest(text:string){
 const data=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
 return Array.from(new Uint8Array(data)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function verifiedDomains(apiKey:string):Promise<string[]>{
 if(!apiKey)return [];
 try{
  const r=await fetch("https://api.resend.com/domains?limit=100",{headers:{"Authorization":"Bearer "+apiKey}});
  if(!r.ok)return [];
  const parsed=await r.json();
  return (Array.isArray(parsed.data)?parsed.data:[]).filter((d:any)=>
   String(d.status||"").toLowerCase()==="verified" &&
   (!d.capabilities||d.capabilities.sending==="enabled"||d.capabilities.sending===true)
  ).map((d:any)=>String(d.name||"").toLowerCase()).filter((d:string)=>
   d==="adatacore.com"||d.endsWith(".adatacore.com")
  ).slice(0,12);
 }catch{return [];}
}
function senderOptions(domains:string[]){
 const list:any[]=[];
 for(const domain of (domains.length?domains:["adatacore.com"])){
  for(const local of preferred){
   list.push({email:local+"@"+domain,label:local.replace(/(^|-)([a-z])/g,(_m,d,c)=>String(d? " ":"")+c.toUpperCase()),domainVerified:domains.includes(domain)});
  }
 }
 return list;
}
function senderDetails(value:unknown,display:unknown,domains:string[]){
 const email=normalizeEmail(value),at=email.lastIndexOf("@");
 if(at<1||!validEmail(email))throw Error("Choose a valid company sender");
 const local=email.slice(0,at),domain=email.slice(at+1);
 if(!localRE.test(local)||!(domain==="adatacore.com"||domains.includes(domain)))
  throw Error("Sender must use an authorized Adatacore email domain");
 const name=String(display||"Adatacore").trim();
 if(name.length<2||name.length>65||/[\r\n<>]/.test(name))throw Error("Invalid sender display name");
 return {email,from:name+" <"+email+">"};
}
async function directory(db:any,projectId:number,level:string){
 const {data,error}=await db.rpc("admin_email_center_project_members",{p_project_id:projectId,p_level:level});
 if(error)throw Error("Project recipient lookup failed: "+error.message);
 if(!Array.isArray(data))throw Error("Project directory did not return a list");
 return data.map((m:any)=>({email:normalizeEmail(m.email),name:String(m.name||"Contributor"),can_l1:!!m.can_l1,can_l2:!!m.can_l2})).filter((m:any)=>validEmail(m.email));
}
async function resolve(db:any,input:any,own:string){
 const kind=String(input.kind||"individual"),level=String(input.level||"all").toLowerCase();
 if(!["individual","multi","project","test"].includes(kind)||!["all","l1","l2"].includes(level))throw Error("Invalid audience selection");
 let projectId:number|null=null;
 let people:any[]=[];
 if(kind==="test")people=[{email:normalizeEmail(own),name:"Your admin email"}];
 else if(kind==="project"){
  projectId=Number(input.project_id);
  if(!Number.isSafeInteger(projectId)||projectId<1)throw Error("Select a project first");
  people=await directory(db,projectId,level);
 }else{
  const pieces=String(input.recipients||"").split(/[\n,;]+/).map(s=>normalizeEmail(s)).filter(Boolean);
  if(kind==="individual"&&pieces.length!==1)throw Error("Individual mode requires exactly one email");
  people=pieces.map(email=>({email,name:"Manual recipient"}));
 }
 const seen=new Set(),unique:any[]=[];
 for(const person of people){
  if(!validEmail(person.email))throw Error("One or more recipient email addresses are invalid");
  if(seen.has(person.email))continue;
  seen.add(person.email);unique.push(person);
 }
 if(unique.length===0)throw Error(kind==="project"?"No active members match this project and level":"Enter at least one recipient");
 if(unique.length>maxBatch)throw Error("The audience has "+unique.length+" recipients. Maximum is "+maxBatch+" per send. Narrow the project level or split the audience.");
 const recipients=unique.map(x=>x.email);
 const token=await digest(hashable(kind,projectId,level,recipients));
 return {kind,level,projectId,people:unique,recipients,count:unique.length,token};
}
function modeDetails(input:any){
 const mode=String(input.content_mode||"rich");
 const text=String(input.content||"").replace(/\r\n?/g,"\n").trim();
 const branded=input.branded!==false;
 if(!["rich","html"].includes(mode))throw Error("Choose Rich Text or HTML Code");
 if(text.length>60000)throw Error("Email content exceeds 60,000 characters");
 if(mode==="html"&&text.length<10)throw Error("Add HTML markup for your email");
 return {mode,text,branded};
}
function subjectText(input:any){
 const s=String(input.subject||"").trim().replace(/[\r\n]+/g," ");
 if(s.length<3||s.length>180)throw Error("Subject must contain 3–180 characters");
 return s;
}
async function finish(db:any,campaignId:string,items:any[]){
 const r=await db.rpc("admin_email_center_finish_batch",{p_campaign_id:campaignId,p_results:items});
 if(r.error)throw Error("Email was processed, but audit status update failed: "+r.error.message);
}
function plainText(mode:string,content:string){
 if(mode==="rich")return content.replace(/\*\*/g,"").replace(/(^|\n)#{1,3}\s+/g,"$1").replace(/\[\[button:([^\]|]+)\|([^\]]+)\]\]/g,"$1: $2").replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,"$1: $2");
 return content.replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<\/?(?:p|h[1-6]|div|li|br|tr|table|hr)\b[^>]*>/gi,"\n").replace(/<[^>]*>/g," ").replace(/\n{3,}/g,"\n\n").trim().slice(0,60000);
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")||"";
 if(req.method==="OPTIONS"){
  const h=new Headers({"Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Max-Age":"300","Vary":"Origin"});
  if(origins.has(origin))h.set("Access-Control-Allow-Origin",origin);
  return new Response(null,{status:204,headers:h});
 }
 if(req.method!=="POST")return err("Method not allowed",405,origin);
 if(origin&&!origins.has(origin))return err("Origin not permitted",403,origin);
 const auth=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
 if(!auth)return err("Sign in to Adatacore",401,origin);
 const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!serviceKey)return err("Email service is not configured",503,origin);
 const db=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
 const session=await db.auth.getUser(auth);
 if(session.error||!session.data.user)return err("Session expired. Sign in again",401,origin);
 const user=await db.from("users").select("id,email,role,accountStatus").eq("id",session.data.user.id).maybeSingle();
 const admin=user.data;
 if(user.error||!admin||admin.role!=="admin"||admin.accountStatus!=="active")return err("Active administrator access required",403,origin);
 let input:any;
 try{input=await req.json()}catch{return err("Invalid request",400,origin);}
 if(!input||typeof input!=="object")return err("Invalid request",400,origin);
 const action=String(input.action||"");
 const resendKey=Deno.env.get("RESEND_API_KEY")||"";
 if(action==="config"){
  const domains=await verifiedDomains(resendKey);
  const projects=await db.from("project_lab").select("id,project_name,project_type").eq("lifecycle_status","active").order("project_name");
  if(projects.error)return err("Cannot load project options",503,origin);
  return json({senders:senderOptions(domains),verified_domains:domains,
   default_sender:"applications@adatacore.com",sender_verified:domains.length>0,
   default_display_name:"Adatacore",own_email:admin.email,
   projects:projects.data||[],limits:limits},200,origin);
 }
 if(action==="history"){
  const result=await db.from("admin_email_center_messages").select("campaign_id,created_at,recipient_email,from_address,subject,body_markdown,content_mode,audience_kind,audience_level,project_id,kind,status,provider_message_id,error_message").order("created_at",{ascending:false}).limit(140);
  if(result.error)return err("Unable to read email history",503,origin);
  return json({items:result.data||[]},200,origin);
 }
 if(action==="render"){
  try{
   const d=modeDetails(input);
   return json({html:render(d.text,d.mode,d.branded),mode:d.mode},200,origin);
  }catch(e){return err(String((e as Error).message||e),400,origin);}
 }
 if(action==="prepare"){
  try{
   const a=await resolve(db,input,admin.email);
   return json({count:a.count,recipients:a.people,token:a.token,kind:a.kind,project_id:a.projectId,level:a.level},200,origin);
  }catch(e){return err(String((e as Error).message||e),400,origin);}
 }
 if(action!=="send")return err("Unknown email action",400,origin);
 if(!resendKey)return err("Resend is not configured",503,origin);
 try{
  const a=await resolve(db,input,admin.email);
  if(!input.audience_token||String(input.audience_token)!==a.token)
   return err("Recipients changed since review. Review the audience again before sending.",409,origin);
  const d=modeDetails(input),subject=subjectText(input);
  if(d.text.length<5)throw Error("Write an email message before sending");
  const domains=await verifiedDomains(resendKey);
  const sender=senderDetails(input.sender_email,input.sender_name,domains);
  const campaignId=String(input.campaign_id||"");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(campaignId))
   throw Error("Invalid send request ID");
  const reserve=await db.rpc("admin_email_center_reserve_campaign",{
   p_admin_id:admin.id,p_campaign_id:campaignId,p_recipients:a.recipients,p_from:sender.from,
   p_subject:subject,p_body:d.text,p_kind:a.kind,p_content_mode:d.mode,
   p_project_id:a.projectId,p_level:a.level
  });
  if(reserve.error)throw Error("Email sending is blocked: "+reserve.error.message);
  if(reserve.data?.already_processed)return json({ok:false,already_processed:true,campaign_id:campaignId,count:reserve.data.count,message:"This campaign was already processed; refresh history before starting a new send."},200,origin);
  const html=render(d.text,d.mode,d.branded);
  const plain=plainText(d.mode,d.text);
  const entries=a.recipients;
  let accepted=0,failed=0,unknown=0;
  for(let offset=0;offset<entries.length;offset+=100){
   const batch=entries.slice(offset,offset+100);
   const payload=batch.map(email=>({from:sender.from,to:[email],subject,html,text:plain}));
   const single=batch.length===1;
   const endpoint=single?"https://api.resend.com/emails":"https://api.resend.com/emails/batch";
   let updates:any[]=[];
   try{
    const request=await fetch(endpoint,{
     method:"POST",
     headers:{"Authorization":"Bearer "+resendKey,"Content-Type":"application/json","Idempotency-Key":"adatacore-email-center/"+campaignId+"/"+Math.floor(offset/100)},
     body:JSON.stringify(single?payload[0]:payload)
    });
    const result=await request.json().catch(()=>({}));
    const ids=single?[result.id]:(Array.isArray(result.data)?result.data.map((x:any)=>x.id):[]);
    if(request.ok&&ids.length===batch.length&&ids.every((x:any)=>typeof x==="string"&&x.length>1)){
     updates=batch.map((email,i)=>({email,status:"accepted",provider_id:ids[i],provider_code:request.status,error_text:""}));
     accepted+=batch.length;
    }else{
     const errorText=String(result.message||"Resend did not accept the batch").slice(0,250);
     const uncertain=request.ok?"unknown":"failed";
     updates=batch.map(email=>({email,status:uncertain,provider_id:"",provider_code:request.status,error_text:errorText}));
     if(uncertain==="failed")failed+=batch.length;else unknown+=batch.length;
    }
   }catch(_error){
    updates=batch.map(email=>({email,status:"unknown",provider_id:"",provider_code:0,error_text:"Provider response could not be confirmed"}));
    unknown+=batch.length;
   }
   await finish(db,campaignId,updates);
  }
  return json({ok:accepted===a.count,campaign_id:campaignId,total:a.count,accepted,failed,unknown,
   status:accepted===a.count?"accepted":failed===a.count?"failed":"partial",
   sender:sender.from,kind:a.kind,message:"Provider acceptance is not proof of inbox delivery."},200,origin);
 }catch(e){return err(String((e as Error).message||e),400,origin);}
});
