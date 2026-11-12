(()=>{
'use strict';
const P=94,U='https://llmhyezgcnbognmmsnzq.supabase.co',K='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
const db=supabase.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true}});
const cleanAccent=x=>/^#[0-9a-f]{6}$/i.test(String(x||''))?x:'#155a64';
function displayCode(code){
 document.querySelectorAll('.header-actions .chip').forEach(chip=>{
  const dot=document.createElement('span');dot.className='dot';
  chip.replaceChildren(dot,document.createTextNode('Voice Studio · '+code));
 });
 const eyebrow=document.querySelector('.vs-welcome .eyebrow');
 if(eyebrow){eyebrow.textContent='ADATACORE · '+code;eyebrow.style.textTransform='none';eyebrow.style.letterSpacing='.035em'}
 const sub=document.getElementById('vsPublicCodeHead');
 if(sub){sub.textContent=code+' · Hindi voice studio';sub.style.textTransform='none';sub.style.letterSpacing='.02em'}
 for(const node of [document.querySelector('#vsAdmin .eyebrow'),document.getElementById('vsAlert')]){
  if(!node)continue;
  const rewrite=()=>{const before=node.textContent||'';if(before.includes('PROJECT #94')||before.includes('Project #94'))node.textContent=before.replaceAll('PROJECT #94',code).replaceAll('Project #94',code)};
  rewrite();if(node.id==='vsAlert')new MutationObserver(rewrite).observe(node,{childList:true});
 }
 document.querySelectorAll('header a[href="/workspace"]').forEach(a=>a.href='/workspace?project='+P);
}
function apply(ui){
 if(!ui||typeof ui!=='object')return;
 const hero=document.querySelector('.vs-welcome');
 if(!hero)return;
 const h=hero.querySelector('h1'),p=hero.querySelector('p'),label=hero.querySelector('.eyebrow');
 if(ui.headline&&h)h.textContent=ui.headline;
 if(ui.subtitle&&p)p.textContent=ui.subtitle;
 if(ui.badge&&label)label.textContent=ui.badge;
 if(ui.button_label){const btn=document.getElementById('openSolo');if(btn)btn.textContent=ui.button_label+' ↗'}
 const accent=cleanAccent(ui.accent);
 if(ui.accent&&/^#[0-9a-f]{6}$/i.test(ui.accent)){
  const style=document.createElement('style');style.id='vs-project-accent';
  style.textContent='.vs-solo-card{border-top-color:'+accent+'!important}.vs-session-card .btn.primary,.vs-record-dock .btn.primary{background:'+accent+'!important;border-color:'+accent+'!important}.vs-session-icon{color:'+accent+'!important}.vs-welcome{border-left:3px solid '+accent+'!important}';
  document.head.append(style);
 }
 if(ui.image_url&&/^https:\/\/[^ <>"']+$/i.test(ui.image_url)){
  hero.style.position='relative';hero.style.overflow='hidden';
  const image=document.createElement('img');image.className='ac-project-cover-image';image.src=ui.image_url;image.alt='Project cover';
  image.style.cssText='position:absolute;right:0;top:0;height:100%;width:35%;object-fit:cover;mask-image:linear-gradient(to right,transparent,#000);opacity:.6;pointer-events:none';
  hero.append(image);
  for(const child of hero.children){if(child!==image){child.style.position='relative';child.style.zIndex='1'}}
 }
}
async function boot(){
 try{
  const {data:{user}}=await db.auth.getUser();if(!user)return;
  const [{data:info,error},{data:config,error:configError}]=await Promise.all([
   db.from('project_lab').select('project_code').eq('id',P).single(),
   db.rpc('project_ui_public',{p_project:P})
  ]);
  if(!error&&info?.project_code)displayCode(info.project_code);
  if(!configError)apply(config);
 }catch(e){console.warn('Project branding could not be loaded',e?.message||e)}
}
boot();
})();