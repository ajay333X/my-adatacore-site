(function(){
"use strict";
const $=id=>document.getElementById(id);
const client=window.supabase.createClient(
 "https://llmhyezgcnbognmmsnzq.supabase.co",
 "sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml"
);
const endpoint="https://llmhyezgcnbognmmsnzq.supabase.co/functions/v1/admin-email-center";
const state={
 senderOptions:[],verifiedDomains:[],ownEmail:"",busy:false,
 audienceMode:"individual",contentMode:"rich",audience:null,
 currentPreview:"",previewTimer:null,previewSequence:0,previewMode:"rendered",
 pending:null,history:[]
};
function text(el,v){if(el)el.textContent=String(v==null?"":v)}
function make(tag,className,content){const n=document.createElement(tag);if(className)n.className=className;if(content!=null)n.textContent=String(content);return n}
function show(el,visible){if(el)el.hidden=!visible}
function errorMessage(err){return String(err&&err.message||err||"Request failed")}
function msg(message,type){
 const el=$("message");text(el,message);el.className="msg"+(message?" show":"")+(type?" "+type:"");
}
async function api(action,payload){
 const session=await client.auth.getSession();
 const token=session.data?.session?.access_token;
 if(!token)throw Error("Your admin session expired. Please sign in again.");
 const res=await fetch(endpoint,{
  method:"POST",
  headers:{
   "authorization":"Bearer "+token,
   "apikey":"sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml",
   "content-type":"application/json"
  },
  body:JSON.stringify(Object.assign({action:action},payload||{}))
 });
 const data=await res.json().catch(()=>({error:"The email service returned an unreadable response"}));
 if(!res.ok)throw Error(String(data.error||"Email service request failed"));
 return data;
}
function currentSender(){
 const picked=$("from").value;
 return picked==="custom"?$("senderCustom").value.trim().toLowerCase():picked;
}
function senderLabel(){
 return ($("senderName").value.trim()||"Adatacore")+" <"+(currentSender()||"sender@adatacore.com")+">";
}
function content(){return state.contentMode==="html"?$("htmlCode").value:$("body").value}
function payload(){
 return {
  kind:state.audienceMode,
  recipients:$("to").value,
  project_id:$("projectSelect").value?Number($("projectSelect").value):null,
  level:$("projectLevel").value
 };
}
function sendPayload(){
 return Object.assign(payload(),{
  sender_email:currentSender(),
  sender_name:$("senderName").value.trim(),
  subject:$("subject").value.trim(),
  content_mode:state.contentMode,
  content:content(),
  branded:$("branded").checked
 });
}
function projectName(){
 const s=$("projectSelect");return s.selectedIndex>=0?s.options[s.selectedIndex].textContent:"Project";
}
function updatePreviewMeta(){
 text($("previewFrom"),senderLabel());
 text($("previewTo"),
  state.audienceMode==="project"?(projectName()+" · "+$("projectLevel").selectedOptions[0]?.textContent):
  state.audienceMode==="multi"?(($("to").value.split(/[\n,;]+/).filter(Boolean).length||0)+" email addresses"):
  $("to").value.trim()||"Recipient preview"
 );
 text($("previewSubject"),$("subject").value.trim()||"Your email subject");
 text($("charCount"),content().length.toLocaleString()+" / 60,000 characters");
}
function updateLines(){
 const el=$("htmlCode"),gutter=$("codeLines"),count=el.value.split("\n").length;
 text(gutter,Array.from({length:count},(_x,i)=>String(i+1)).join("\n"));
 gutter.scrollTop=el.scrollTop;
}
function setPreviewStatus(value,kind){
 const el=$("previewStatus");
 text(el,value);el.className="preview-status"+(kind?" "+kind:"");
}
function renderStage(html){
 const mount=$("previewMount"),parsed=new DOMParser().parseFromString(html,"text/html");
 const shadow=mount.shadowRoot||mount.attachShadow({mode:"open"});
 shadow.innerHTML=
 '<style>:host{display:block;min-height:100%;font-family:Arial,Helvetica,sans-serif; color:#1b2c42}*{box-sizing:border-box}img{max-width:100%;height:auto}a{cursor:pointer}table{max-width:100%}td,th{overflow-wrap:anywhere}</style>'+
 parsed.body.innerHTML;
 text($("previewSource"),html);
}
function previewView(name){
 state.previewMode=name;
 for(const btn of document.querySelectorAll("[data-preview]")){
  const active=btn.dataset.preview===name;
  btn.classList.toggle("active",active);btn.setAttribute("aria-pressed",String(active));
 }
 show($("previewMount"),name==="rendered");show($("previewSource"),name==="source");
}
async function refreshPreview(){
 const seq=++state.previewSequence;
 updatePreviewMeta();setPreviewStatus("Rendering email through the secure email service…","");
 try{
  const response=await api("render",{content_mode:state.contentMode,content:content(),branded:$("branded").checked});
  if(seq!==state.previewSequence)return false;
  state.currentPreview=response.html||"";
  renderStage(state.currentPreview);
  setPreviewStatus("Preview updated · HTML matches the server-sanitized outgoing email","ok");
  previewView(state.previewMode);
  return true;
 }catch(err){
  if(seq!==state.previewSequence)return false;
  setPreviewStatus("Preview unavailable: "+errorMessage(err),"error");
  const mount=$("previewMount");
  if(!mount.shadowRoot)mount.replaceChildren(make("div","preview-loading","Preview could not load. Use Refresh preview to retry."));
  return false;
 }
}
function schedulePreview(){
 updatePreviewMeta();
 if(state.previewTimer)clearTimeout(state.previewTimer);
 state.previewTimer=setTimeout(function(){void refreshPreview()},380);
}
function updateModeControls(mode){
 state.contentMode=mode;
 show($("richGroup"),mode==="rich");show($("htmlGroup"),mode==="html");
 document.querySelectorAll("[data-mode]").forEach(function(b){
  const active=b.dataset.mode===mode;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));
 });
 if(mode==="html")updateLines();
 schedulePreview();
}
function invalidateAudience(){
 state.audience=null;
 $("send").disabled=true;text($("send"),"Review recipients first");
 show($("audienceReview"),false);
}
function selectAudience(mode){
 state.audienceMode=mode;
 document.querySelectorAll("[data-audience]").forEach(function(b){
  const yes=b.dataset.audience===mode;
  b.classList.toggle("active",yes);b.setAttribute("aria-pressed",String(yes));
 });
 show($("manualGroup"),mode!=="project");
 show($("projectGroup"),mode==="project");
 text($("manualLabel"),mode==="multi"?"Recipient email addresses":"Recipient email");
 text($("manualHint"),mode==="multi"?"Separate addresses with commas, semicolons or new lines. Each receives a private email.":"Add one recipient email address.");
 $("to").rows=mode==="multi"?4:2;
 invalidateAudience();updatePreviewMeta();
}
function insert(textToInsert,inputId){
 const el=$(inputId);const start=el.selectionStart,end=el.selectionEnd;
 el.setRangeText(textToInsert,start,end,"end");el.focus();
 if(inputId==="htmlCode")updateLines();schedulePreview();
}
function richFormat(kind){
 const field=$("body"),start=field.selectionStart,end=field.selectionEnd,chosen=field.value.slice(start,end);
 const template="Hello,\n\n# Welcome back to Adatacore!\n\nWe look forward to working with you again and having you contribute to our upcoming projects.\n\nPlease log in to your dashboard to see your available work and updates.\n\n[[button:Log In to Your Dashboard|https://www.adatacore.com/workspace]]\n\nBest regards,\n**The Adatacore Team**";
 if(kind==="template"){
  if(field.value.trim()&&!window.confirm("Replace the current Rich Text draft with the welcome-back template?"))return;
  field.value=template;field.focus();schedulePreview();return;
 }
 const value=chosen||"text";let result=value;
 if(kind==="bold")result="**"+value+"**";
 if(kind==="italic")result="*"+value+"*";
 if(kind==="heading")result="## "+(chosen||"Section heading");
 if(kind==="bullet")result=value.split("\n").map(x=>"- "+x).join("\n");
 if(kind==="numbered")result=value.split("\n").map((x,i)=>(i+1)+". "+x).join("\n");
 if(kind==="link")result="["+(chosen||"Dashboard")+"](https://www.adatacore.com/workspace)";
 if(kind==="button")result="[[button:"+(chosen||"Log In to Your Dashboard")+"|https://www.adatacore.com/workspace]]";
 if(kind==="divider")result="\n---\n";
 insert(result,"body");
}
function codeFormat(kind){
 const code=$("htmlCode");
 const button='<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0">\n  <tr><td bgcolor="#205c94" style="border-radius:9px;background-color:#205c94">\n    <a href="https://www.adatacore.com/workspace" style="display:inline-block;padding:14px 23px;background-color:#205c94;border-radius:9px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">Log In to Your Dashboard</a>\n  </td></tr>\n</table>';
 const templates={
  button:button,
  heading:'<h1 style="font-size:25px;color:#192d43;line-height:1.3">Welcome back!</h1>',
  paragraph:'<p style="font-size:15px;color:#354459;line-height:1.75">We look forward to working with you.</p>',
  table:'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dce5ed;border-radius:9px">\n  <tr><td style="padding:14px 18px;color:#354459">Your content</td></tr>\n</table>',
  template:'<h1 style="font-size:27px;color:#172940">Welcome back to Adatacore!</h1>\n<p style="font-size:15px;line-height:1.75;color:#46576b">Hello,</p>\n<p style="font-size:15px;line-height:1.75;color:#46576b">We are excited to work with you again. Your Adatacore dashboard is ready. Please log in to review updates and available projects.</p>\n'+button+'\n<p style="font-size:14px;line-height:1.75;color:#68788b">Best regards,<br><strong>The Adatacore Team</strong></p>'
 };
 if(kind==="template"){
  if(code.value.trim()&&!window.confirm("Replace your current HTML code with the welcome template?"))return;
  code.value=templates.template;code.focus();updateLines();schedulePreview();return;
 }
 insert(templates[kind]||"", "htmlCode");
}
function senderOptions(config){
 const drop=$("from");drop.replaceChildren();
 const found=Array.isArray(config.senders)?config.senders:[];
 state.senderOptions=found;
 state.verifiedDomains=config.verified_domains||[];
 for(const entry of found){
  const option=make("option",null,entry.label+" · "+entry.email+(entry.domainVerified?" ✓":""));
  option.value=entry.email;drop.append(option);
 }
 const extra=make("option",null,"Other company email address…");extra.value="custom";drop.append(extra);
 const preferred=found.find(x=>x.email==="hello@adatacore.com")||found.find(x=>x.email===config.default_sender)||found[0];
 drop.value=preferred?.email||"custom";
 show($("senderCustom"),drop.value==="custom");
 if(drop.value==="custom")$("senderCustom").value="hello@adatacore.com";
 text($("senderInfo"),state.verifiedDomains.length?
  "Resend reports "+state.verifiedDomains.join(", ")+" as verified. Pick any listed company alias or enter another address on an authorized domain.":
  "Company sender addresses are available. Resend domain verification could not be confirmed through this key; the provider will validate your chosen address when sending.");
}
function projectsOptions(config){
 const picker=$("projectSelect");picker.replaceChildren();
 const initial=make("option",null,"Choose an active project");initial.value="";picker.append(initial);
 for(const p of (config.projects||[])){
  const option=make("option",null,p.project_name+" · "+String(p.project_type||"Project"));
  option.value=String(p.id);picker.append(option);
 }
}
async function reviewAudience(kind){
 const target=kind==="test"?Object.assign(payload(),{kind:"test"}):payload();
 const data=await api("prepare",target);
 if(kind!=="test"){
  state.audience=data;
  show($("audienceReview"),true);
  text($("audienceCount"),data.count+" unique recipient"+(data.count===1?"":"s")+" ready");
  const list=$("audienceList");list.replaceChildren();
  for(const p of (data.recipients||[])){
   const badge=make("span","audience-chip",p.email);
   if(p.can_l2||p.can_l1){
    const label=make("span",null,p.can_l2?" · L2":" · L1");
    badge.append(label);
   }
   list.append(badge);
  }
  $("send").disabled=false;
  text($("send"),"Send to "+data.count+" recipient"+(data.count===1?"":"s"));
 }
 return data;
}
function validContent(){
 const contentText=content().trim();
 if(!$("subject").value.trim()||$("subject").value.trim().length<3)throw Error("Add an email subject with at least 3 characters.");
 if(contentText.length<5)throw Error("Write your email message before sending.");
 if(state.contentMode==="html"&&contentText.length<10)throw Error("Add valid HTML content before sending.");
 if(!currentSender())throw Error("Select a company sender.");
 if(!$("senderName").value.trim())throw Error("Enter a sender display name.");
}
function showConfirm(prepared,isTest){
 const d=$("confirmDialog"),target=isTest?state.ownEmail:prepared.recipients.map(x=>x.email).join(", ");
 const sel=sendPayload();
 text($("confirmTitle"),isTest?"Confirm test email":"Confirm "+prepared.count+" email"+(prepared.count===1?"":"s"));
 text($("confirmFrom"),senderLabel());
 text($("confirmTo"),isTest?state.ownEmail:
  (sel.kind==="project"?projectName()+" / "+$("projectLevel").selectedOptions[0]?.textContent:prepared.count+" selected recipient(s)"));
 text($("confirmSubject"),sel.subject);
 text($("confirmFormat"),state.contentMode==="html"?"HTML code · "+($("branded").checked?"Branded":"Custom layout"):"Rich text · "+($("branded").checked?"Branded":"Custom layout"));
 const list=$("confirmRecipients");list.replaceChildren();
 const people=prepared.recipients||[];
 for(const person of people)list.append(make("div",null,person.name&&person.name!=="Manual recipient"?person.name+" · "+person.email:person.email));
 text($("confirmSend"),isTest?"Send test email":"Send "+prepared.count+" email"+(prepared.count===1?"":"s")+" now");
 state.pending={prepared,isTest,selection:sel};
 if(typeof d.showModal==="function")d.showModal();
 else if(window.confirm("Send "+prepared.count+" email(s) to "+target+"?"))void finalizeSend();
}
function setBusy(on){
 state.busy=!!on;
 $("review").disabled=on;
 $("test").disabled=on;
 $("send").disabled=on||!state.audience;
 $("confirmSend").disabled=on;
 $("confirmCancel").disabled=on;
 text($("confirmSend"),on?"Sending securely…":$("confirmSend").textContent);
}
async function finalizeSend(){
 const pending=state.pending;if(!pending||state.busy)return;
 setBusy(true);msg("Sending emails securely through Resend…","");
 try{
  const inputs=Object.assign({},pending.selection,{kind:pending.isTest?"test":pending.selection.kind,
   audience_token:pending.prepared.token,campaign_id:window.crypto.randomUUID()});
  const result=await api("send",inputs);
  if(result.already_processed){
   msg("This send request was already processed. Review history before trying again.","error");
  }else{
   const accepted=Number(result.accepted||0),failed=Number(result.failed||0),unknown=Number(result.unknown||0);
   msg("Resend accepted "+accepted+" of "+Number(result.total||0)+" email(s)."+
    (failed?" Rejected: "+failed+".":"")+
    (unknown?" Unconfirmed: "+unknown+". Please check history before attempting any resend.":"")+
    " Provider acceptance does not confirm inbox delivery.",
    failed||unknown?"error":"success");
  }
  $("confirmDialog").close();
  invalidateAudience();await loadHistory();
 }catch(err){
  $("confirmDialog").close();
  msg(errorMessage(err)+". Check history before retrying a potentially accepted send.","error");
  await loadHistory();
 }finally{
  state.pending=null;setBusy(false);
 }
}
function timestamp(date){
 const d=new Date(date);return Number.isFinite(d.getTime())?d.toLocaleString():"—";
}
async function loadHistory(){
 const host=$("history");$("refresh").disabled=true;
 try{
  const res=await api("history");
  state.history=res.items||[];
  host.replaceChildren();
  if(!state.history.length){host.append(make("p","history-empty","No emails sent yet. Resend acceptance and errors will appear here."));return}
  const byCampaign=new Map();
  for(const entry of state.history){
   const key=entry.campaign_id||entry.created_at+":"+entry.recipient_email;
   if(!byCampaign.has(key))byCampaign.set(key,[]);
   byCampaign.get(key).push(entry);
  }
  for(const group of byCampaign.values()){
   const item=group[0],card=make("article","history-item");
   const accepted=group.filter(x=>x.status==="accepted").length;
   const failed=group.filter(x=>x.status==="failed"||x.status==="unknown").length;
   const top=make("div","history-top");
   const subject=make("strong",null,item.subject||"Untitled");subject.title=item.subject||"";
   const badge=make("span","status-pill "+(failed?"failed":accepted===group.length?"accepted":""),failed?"Partial / issues":accepted+" accepted");
   top.append(subject,badge);card.append(top);
   card.append(make("small",null,timestamp(item.created_at)+" · "+String(item.audience_kind||item.kind||"individual").toUpperCase()+" · "+group.length+" recipient"+(group.length===1?"":"s")));
   card.append(make("div","history-line",item.from_address||"Adatacore"));
   const detail=document.createElement("details"),sum=document.createElement("summary");
   sum.textContent="View recipient status";detail.append(sum);
   for(const entry of group){
    detail.append(make("div","history-sub",entry.recipient_email+" · "+entry.status+(entry.error_message?" — "+entry.error_message:"")));
   }
   card.append(detail);
   const reuse=make("button",null,"Use as new draft");reuse.type="button";
   reuse.addEventListener("click",function(){
    if((content().trim()||$("subject").value.trim())&&!window.confirm("Replace the current subject and message with this past email?"))return;
    $("subject").value=item.subject||"";
    updateModeControls(item.content_mode==="html"?"html":"rich");
    if(item.content_mode==="html")$("htmlCode").value=item.body_markdown||"";
    else $("body").value=item.body_markdown||"";
    $("to").value=item.recipient_email||"";
    selectAudience("individual");updateLines();schedulePreview();
    window.scrollTo({top:0,behavior:"smooth"});
    msg("A past message was loaded as a new draft. Review recipients before sending.");
   });
   card.append(reuse);host.append(card);
  }
 }catch(err){
  host.replaceChildren(make("p","history-empty","Could not load email history: "+errorMessage(err)));
 }finally{$("refresh").disabled=false}
}
async function requestConfirm(test){
 if(state.busy)return;
 try{
  validContent();
  const previewOk=await refreshPreview();
  if(!previewOk)throw Error("Secure preview is not available. Refresh the preview before sending.");
  const prepared=test?await reviewAudience("test"):state.audience;
  if(!prepared)throw Error("Review recipients before sending.");
  showConfirm(prepared,test);
 }catch(err){msg(errorMessage(err),"error")}
}
async function init(){
 const loading=$("loading");updatePreviewMeta();
 try{
  const session=await client.auth.getSession();
  if(!session.data?.session){location.replace("/auth?returnTo=%2Fadmin%2Femail-center");return}
  const config=await api("config");
  state.ownEmail=config.own_email||"";
  senderOptions(config);projectsOptions(config);
  text($("provider").querySelector("span:last-child"),
   state.verifiedDomains.length?"Resend · Company domain verified":"Resend · Company sender validation");
  $("provider").classList.add("active");
  $("review").disabled=false;$("test").disabled=false;
  document.body.classList.add("ready");
  await Promise.all([refreshPreview(),loadHistory()]);
 }catch(err){
  text(loading,"Could not open Email Center: "+errorMessage(err)+" · ");
  const a=make("a",null,"Back to Admin");a.href="/admin";a.style.color="#2367a1";loading.append(a);
 }
}
for(const id of ["to","projectSelect","projectLevel"]){
 $(id).addEventListener(id==="to"?"input":"change",function(){invalidateAudience();updatePreviewMeta()});
}
$("from").addEventListener("change",function(){
 show($("senderCustom"),$("from").value==="custom");
 updatePreviewMeta();
});
for(const id of ["senderCustom","senderName","subject"])$(id).addEventListener("input",updatePreviewMeta);
$("body").addEventListener("input",schedulePreview);
$("htmlCode").addEventListener("input",function(){updateLines();schedulePreview()});
$("htmlCode").addEventListener("scroll",function(){$("codeLines").scrollTop=$("htmlCode").scrollTop});
$("htmlCode").addEventListener("keydown",function(e){
 if(e.key!=="Tab")return;e.preventDefault();
 insert("  ","htmlCode");
});
$("branded").addEventListener("change",schedulePreview);
document.querySelectorAll("[data-audience]").forEach(b=>b.addEventListener("click",()=>selectAudience(b.dataset.audience)));
document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>updateModeControls(b.dataset.mode)));
document.querySelectorAll("[data-format]").forEach(b=>b.addEventListener("click",()=>richFormat(b.dataset.format)));
document.querySelectorAll("[data-code]").forEach(b=>b.addEventListener("click",()=>codeFormat(b.dataset.code)));
document.querySelectorAll("[data-preview]").forEach(b=>b.addEventListener("click",()=>previewView(b.dataset.preview)));
$("forcePreview").addEventListener("click",()=>void refreshPreview());
$("expandPreview").addEventListener("click",function(){
 const layout=document.querySelector(".layout");const expanded=layout.classList.toggle("preview-wide");
 text($("expandPreview"),expanded?"Compact view":"Expand view");
});
$("review").addEventListener("click",async function(){
 if(state.busy)return;msg("Finding current active recipients…");
 $("review").disabled=true;
 try{
  const data=await reviewAudience(state.audienceMode);
  msg(data.count+" recipient(s) resolved. Please inspect the review list, then choose Send.","success");
 }catch(err){invalidateAudience();msg(errorMessage(err),"error")}
 finally{$("review").disabled=false}
});
$("send").addEventListener("click",()=>void requestConfirm(false));
$("test").addEventListener("click",()=>void requestConfirm(true));
$("confirmCancel").addEventListener("click",function(){if(!state.busy){$("confirmDialog").close();state.pending=null}});
$("confirmSend").addEventListener("click",()=>void finalizeSend());
$("confirmDialog").addEventListener("cancel",function(e){if(state.busy)e.preventDefault();else state.pending=null});
$("refresh").addEventListener("click",()=>void loadHistory());
init();
})();