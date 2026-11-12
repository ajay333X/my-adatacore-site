import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.57.4";

const origins=new Set(["https://www.adatacore.com","https://adatacore.com"]);
const sender=(Deno.env.get("EMAIL_CENTER_FROM")||Deno.env.get("APPLICATION_EMAIL_FROM")||"Adatacore <applications@adatacore.com>").trim();
const logo="https://www.adatacore.com/assets/adatacore-logo.jpg";
const table="admin_email_center_messages";
function esc(v:unknown){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}
function inline(v:string){
 let t=esc(v);
 t=t.replace(/\[([^\]\n]{1,120})\]\((https?:\/\/[^\s<>"()]{3,450})\)/gi,(_m,label,url)=>'<a href="'+url+'" style="color:#2368a3;text-decoration:underline">'+label+'</a>');
 t=t.replace(/\*\*([^*\n]{1,1000})\*\*/g,"<strong>$1</strong>");
 t=t.replace(/(^|[^*])\*([^*\n]{1,1000})\*(?!\*)/g,"$1<em>$2</em>");
 return t;
}
function bodyHtml(markdown:string){
 let body="",list:string|null=null;
 const close=()=>{if(list){body+="</"+list+">";list=null;}};
 for(const original of markdown.replace(/\r\n?/g,"\n").split("\n")){
  const text=original.trim();
  if(!text){close();continue;}
  if(/^---+$/.test(text)){close();body+='<hr style="border:0;border-top:1px solid #e3e9f0;margin:22px 0">';continue;}
  const title=text.match(/^(#{1,3})\s+(.+)$/);
  if(title){close();const size=title[1].length===1?25:title[1].length===2?20:17;body+='<h2 style="font-size:'+size+'px;margin:15px 0 13px;line-height:1.35;color:#1a2b43">'+inline(title[2])+'</h2>';continue;}
  const ul=text.match(/^[-*]\s+(.+)$/),ol=text.match(/^\d+\.\s+(.+)$/);
  if(ul||ol){const kind=ul?"ul":"ol";if(list!==kind){close();body+="<"+kind+' style="margin:0 0 18px;padding-left:24px;font-size:15px;line-height:1.75;color:#374151">';list=kind;}body+='<li style="margin:4px 0">'+inline((ul||ol)![1])+"</li>";continue;}
  close();
  if(/^>\s*/.test(text)){body+='<blockquote style="margin:10px 0 18px;padding:11px 18px;background:#f5f8fc;border-left:3px solid #b5d0ec;color:#4b5f76;font-size:15px;line-height:1.7">'+inline(text.replace(/^>\s*/,""))+"</blockquote>";continue;}
  body+='<p style="margin:0 0 17px;color:#354459;font-size:15px;line-height:1.8">'+inline(text)+"</p>";
 }
 close();return body||'<p style="color:#64748b">Your message appears here.</p>';
}
function emailHtml(body:string){
 return [
 '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
 '<body style="margin:0;padding:0;background:#f3f6fa;color:#1b2d43;font-family:Arial,Helvetica,sans-serif">',
 '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fa"><tr><td align="center" style="padding:32px 14px">',
 '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border:1px solid #dfe7f0;border-radius:14px">',
 '<tr><td style="padding:23px 32px;border-bottom:1px solid #e9eef5"><table role="presentation" cellpadding="0" cellspacing="0"><tr>',
 '<td><img src="'+logo+'" width="38" height="38" alt="Adatacore" style="display:block;border-radius:9px"></td>',
 '<td style="padding-left:11px;color:#17263a;font-size:19px;font-weight:700;letter-spacing:-.02em">Adatacore</td>',
 '</tr></table></td></tr><tr><td style="padding:32px 34px 26px">',
 bodyHtml(body),
 '</td></tr><tr><td style="padding:20px 32px;background:#fafbfe;border-top:1px solid #edf1f5;color:#718096;font-size:12px;line-height:1.6">',
 'Sent by Adatacore · <a href="https://www.adatacore.com" style="color:#39729d;text-decoration:none">adatacore.com</a>',
 '</td></tr></table></td></tr></table></body></html>'
 ].join("");
}
function reply(obj:unknown,status=200,origin=""){
 const headers=new Headers({"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"});
 if(origins.has(origin))headers.set("Access-Control-Allow-Origin",origin);
 return new Response(JSON.stringify(obj),{status,headers});
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")||"";
 if(req.method==="OPTIONS"){
  const h=new Headers({"Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Max-Age":"300","Vary":"Origin"});
  if(origins.has(origin))h.set("Access-Control-Allow-Origin",origin);
  return new Response(null,{status:204,headers:h});
 }
 if(req.method!=="POST")return reply({error:"Method not allowed"},405,origin);
 if(origin&&!origins.has(origin))return reply({error:"Origin not permitted"},403,origin);
 const auth=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
 if(!auth)return reply({error:"Sign in to Adatacore"},401,origin);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return reply({error:"Email service is not configured"},503,origin);
 const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
 const session=await db.auth.getUser(auth);
 if(session.error||!session.data.user)return reply({error:"Session expired. Sign in again"},401,origin);
 const {data:person,error:userError}=await db.from("users").select("id,email,role,accountStatus").eq("id",session.data.user.id).maybeSingle();
 if(userError||!person||person.role!=="admin"||person.accountStatus!=="active")return reply({error:"Active administrator access required"},403,origin);
 let data:any;
 try{data=await req.json()}catch{return reply({error:"Invalid request"},400,origin)}
 if(!data||typeof data!=="object")return reply({error:"Invalid request"},400,origin);
 const action=String(data.action||"");
 if(action==="config")return reply({sender,user_email:person.email,limits:{hourly:15,daily:60}},200,origin);
 if(action==="history"){
  const r=await db.from(table).select("id,created_at,recipient_email,from_address,subject,body_markdown,kind,status,provider_message_id,error_message").order("created_at",{ascending:false}).limit(40);
  if(r.error)return reply({error:"Unable to read email history"},500,origin);
  return reply({items:r.data||[]},200,origin);
 }
 if(action!=="send")return reply({error:"Unknown action"},400,origin);
 const resendKey=Deno.env.get("RESEND_API_KEY");
 if(!resendKey)return reply({error:"Resend is not configured"},503,origin);
 const test=data.test===true;
 const to=String(test?person.email||"":data.to||"").trim().toLowerCase();
 const subject=String(data.subject||"").trim().replace(/[\r\n]+/g," ");
 const message=String(data.body_markdown||"").replace(/\r\n?/g,"\n").trim();
 const rid=String(data.request_id||"");
 if(!/^[^\s@,;<>]{1,100}@[^\s@,;<>]{1,200}\.[A-Za-z]{2,30}$/.test(to))return reply({error:"Enter one valid recipient email"},400,origin);
 if(subject.length<3||subject.length>180)return reply({error:"Subject must have 3–180 characters"},400,origin);
 if(message.length<5||message.length>20000)return reply({error:"Message must have 5–20,000 characters"},400,origin);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rid))return reply({error:"Invalid request ID"},400,origin);
 const old=await db.from(table).select("id,status,provider_message_id").eq("request_id",rid).eq("created_by",person.id).maybeSingle();
 if(old.data)return reply({ok:old.data.status==="accepted",already_processed:true,status:old.data.status,id:old.data.id,provider_id:old.data.provider_message_id},200,origin);
 const now=Date.now();
 const hourly=await db.from(table).select("id",{head:true,count:"exact"}).eq("created_by",person.id).gte("created_at",new Date(now-3600000).toISOString());
 const daily=await db.from(table).select("id",{head:true,count:"exact"}).eq("created_by",person.id).gte("created_at",new Date(now-86400000).toISOString());
 if(hourly.error||daily.error)return reply({error:"Could not verify sending allowance"},503,origin);
 if((hourly.count||0)>=15||(daily.count||0)>=60)return reply({error:"Email sending limit reached for this admin"},429,origin);
 const saved=await db.from(table).insert({
  request_id:rid,created_by:person.id,from_address:sender,recipient_email:to,
  subject,body_markdown:message,kind:test?"test":"individual",status:"processing"
 }).select("id").single();
 if(saved.error||!saved.data)return reply({error:saved.error?.code==="23505"?"Request already exists; refresh history":"Could not record email; nothing sent"},503,origin);
 const plain=message.replace(/\*\*/g,"").replace(/(^|\n)#{1,3}\s+/g,"$1").replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,"$1: $2");
 try{
  const sent=await fetch("https://api.resend.com/emails",{
   method:"POST",
   headers:{"Authorization":"Bearer "+resendKey,"Content-Type":"application/json","Idempotency-Key":"adatacore-email-center/"+rid},
   body:JSON.stringify({from:sender,to:[to],subject,html:emailHtml(message),text:plain})
  });
  const result=await sent.json().catch(()=>({}));
  const ok=sent.ok&&typeof result.id==="string";
  await db.from(table).update({
   status:ok?"accepted":"failed",provider_message_id:ok?String(result.id):null,
   provider_response_code:sent.status,error_message:ok?null:String(result.message||"Provider rejected email").slice(0,400),
   finalized_at:new Date().toISOString()
  }).eq("id",saved.data.id);
  if(!ok)return reply({error:"Resend did not accept the message",provider_status:sent.status,detail:String(result.message||"Check sender and recipient").slice(0,150)},502,origin);
  return reply({ok:true,status:"accepted",provider_id:result.id,recipient:to,sender},200,origin);
 }catch(_e){
  await db.from(table).update({status:"unknown",error_message:"Provider response could not be confirmed",finalized_at:new Date().toISOString()}).eq("id",saved.data.id);
  return reply({error:"Provider response unconfirmed. Check email history before trying again.",status:"unknown"},502,origin);
 }
});
