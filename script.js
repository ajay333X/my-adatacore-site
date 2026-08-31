(()=>{
  const head=document.head;
  if(!head)return;
  const addIcon=(rel,href,type,sizes)=>{
    let link=head.querySelector(`link[rel="${rel}"]`);
    if(!link){link=document.createElement('link');link.rel=rel;head.appendChild(link)}
    link.href=href;
    if(type)link.type=type;
    if(sizes)link.sizes=sizes;
  };
  addIcon('icon','/favicon.png?v=20260831-2','image/png','64x64');
  addIcon('shortcut icon','/favicon.ico?v=20260831-2','image/x-icon');
})();

const elements={infoModal:document.getElementById('infoModal'),contactModal:document.getElementById('contactModal'),annotatorInfoModal:document.getElementById('annotatorInfoModal'),annotatorFormModal:document.getElementById('annotatorFormModal')};
function openLayer(el){if(el){el.style.display='flex';document.body.style.overflow='hidden'}}
function closeLayer(el){if(el){el.style.display='none';document.body.style.overflow='auto'}}
function openInfoModal(){openLayer(elements.infoModal)}function closeInfoModal(){closeLayer(elements.infoModal)}
function openModal(){openLayer(elements.contactModal)}function closeModal(){closeLayer(elements.contactModal)}
function openAnnotatorInfoModal(){openLayer(elements.annotatorInfoModal)}function closeAnnotatorInfoModal(){closeLayer(elements.annotatorInfoModal)}
function openAnnotatorFormModal(){openLayer(elements.annotatorFormModal)}function closeAnnotatorFormModal(){closeLayer(elements.annotatorFormModal)}
function switchToInquiry(){closeInfoModal();setTimeout(openModal,120)}function switchToAnnotatorForm(){closeAnnotatorInfoModal();setTimeout(openAnnotatorFormModal,120)}

function ensureNoticeModal(){
  let modal=document.getElementById('adatacoreNotice');
  if(modal)return modal;

  const style=document.createElement('style');
  style.textContent=`
    .ac-notice{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(3,3,9,.74);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);opacity:0;visibility:hidden;transition:opacity .22s ease,visibility .22s ease}
    .ac-notice.is-visible{opacity:1;visibility:visible}
    .ac-notice-card{position:relative;width:min(430px,100%);padding:30px;border:1px solid rgba(167,139,250,.2);border-radius:22px;background:linear-gradient(145deg,rgba(18,18,31,.98),rgba(9,9,17,.98));box-shadow:0 28px 90px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.025) inset;text-align:center;transform:translateY(14px) scale(.975);opacity:0;transition:transform .26s cubic-bezier(.2,.8,.2,1),opacity .22s ease;overflow:hidden}
    .ac-notice.is-visible .ac-notice-card{transform:none;opacity:1}
    .ac-notice-card:before{content:"";position:absolute;width:210px;height:210px;left:50%;top:-145px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(circle,rgba(139,92,246,.25),transparent 70%);pointer-events:none}
    .ac-notice-icon{position:relative;width:58px;height:58px;margin:0 auto 18px;border-radius:18px;display:grid;place-items:center;font-size:25px;font-weight:800}
    .ac-notice.success .ac-notice-icon{color:#8ff0c7;background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.24);box-shadow:0 0 34px rgba(52,211,153,.08)}
    .ac-notice.error .ac-notice-icon{color:#f9a8b5;background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.24);box-shadow:0 0 34px rgba(244,63,94,.08)}
    .ac-notice.info .ac-notice-icon{color:#c4b5fd;background:rgba(139,92,246,.12);border:1px solid rgba(167,139,250,.24)}
    .ac-notice-title{position:relative;margin:0 0 9px;color:#f6f3ff;font-size:21px;line-height:1.25;letter-spacing:-.025em;font-weight:760}
    .ac-notice-message{position:relative;margin:0 auto;color:#aaa9bb;font-size:14px;line-height:1.65;max-width:340px}
    .ac-notice-button{position:relative;width:100%;margin-top:24px;padding:12px 18px;border:1px solid rgba(167,139,250,.34);border-radius:12px;background:linear-gradient(135deg,#7c3aed,#8b5cf6);color:#fff;font:inherit;font-size:13px;font-weight:750;cursor:pointer;box-shadow:0 12px 28px rgba(124,58,237,.18);transition:transform .18s ease,filter .18s ease}
    .ac-notice-button:hover{transform:translateY(-1px);filter:brightness(1.08)}
    .ac-notice-button:focus-visible{outline:2px solid #c4b5fd;outline-offset:3px}
    @media(max-width:520px){.ac-notice-card{padding:25px 20px;border-radius:19px}.ac-notice-title{font-size:19px}}
    @media(prefers-reduced-motion:reduce){.ac-notice,.ac-notice-card,.ac-notice-button{transition:none!important}}
  `;
  document.head.appendChild(style);

  modal=document.createElement('div');
  modal.id='adatacoreNotice';
  modal.className='ac-notice';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');
  modal.setAttribute('aria-labelledby','acNoticeTitle');
  modal.setAttribute('aria-describedby','acNoticeMessage');
  modal.innerHTML=`<div class="ac-notice-card"><div class="ac-notice-icon" aria-hidden="true">✓</div><h2 class="ac-notice-title" id="acNoticeTitle"></h2><p class="ac-notice-message" id="acNoticeMessage"></p><button type="button" class="ac-notice-button">Done</button></div>`;
  document.body.appendChild(modal);
  return modal;
}

function showNotice({title,message,type='info',buttonText='Done'}={}){
  return new Promise(resolve=>{
    const modal=ensureNoticeModal();
    const icon=modal.querySelector('.ac-notice-icon');
    const titleEl=modal.querySelector('.ac-notice-title');
    const messageEl=modal.querySelector('.ac-notice-message');
    const button=modal.querySelector('.ac-notice-button');
    const previousOverflow=document.body.style.overflow;

    modal.classList.remove('success','error','info');
    modal.classList.add(type);
    icon.textContent=type==='success'?'✓':type==='error'?'!':'i';
    titleEl.textContent=title||'';
    messageEl.textContent=message||'';
    button.textContent=buttonText;

    const close=()=>{
      modal.classList.remove('is-visible');
      document.removeEventListener('keydown',onKey);
      setTimeout(()=>{
        document.body.style.overflow=previousOverflow;
        resolve();
      },220);
    };
    const onKey=e=>{if(e.key==='Escape'||e.key==='Enter')close()};
    const onBackdrop=e=>{if(e.target===modal)close()};

    button.onclick=close;
    modal.onclick=onBackdrop;
    document.addEventListener('keydown',onKey);
    document.body.style.overflow='hidden';
    requestAnimationFrame(()=>{
      modal.classList.add('is-visible');
      setTimeout(()=>button.focus(),80);
    });
  });
}

const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const precisionText=document.getElementById('precisionText');
const precisionCaret=document.getElementById('precisionCaret');
const precisionPhrase='Precision in Every Byte.';
function typePrecision(){
  if(!precisionText)return;
  if(reduceMotion){precisionText.textContent=precisionPhrase;if(precisionCaret)precisionCaret.classList.add('done');return}
  let i=0;
  const tick=()=>{
    precisionText.textContent=precisionPhrase.slice(0,i);
    if(i<=precisionPhrase.length){i++;setTimeout(tick,i<10?58:72)}
    else if(precisionCaret)precisionCaret.classList.add('done');
  };
  setTimeout(tick,420);
}
typePrecision();

if(!reduceMotion&&'IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('active');observer.unobserve(entry.target)}}),{threshold:.1,rootMargin:'0px 0px -40px'});
  document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
}else document.querySelectorAll('.reveal').forEach(el=>el.classList.add('active'));

function toggleFAQ(button){const content=button.nextElementSibling;const open=content.dataset.open==='1';content.dataset.open=open?'0':'1';content.style.maxHeight=open?'0px':content.scrollHeight+'px';button.setAttribute('aria-expanded',String(!open));const icon=button.querySelector('[data-chevron]');if(icon)icon.style.transform=open?'rotate(0deg)':'rotate(180deg)'}

window.addEventListener('click',e=>Object.values(elements).forEach(modal=>{if(modal&&e.target===modal)closeLayer(modal)}));
window.addEventListener('keydown',e=>{if(e.key==='Escape')Object.values(elements).forEach(closeLayer)});

const FORM_API='https://llmhyezgcnbognmmsnzq.supabase.co/rest/v1',FORM_KEY='sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
async function postPublic(table,payload){
  const res=await fetch(`${FORM_API}/${table}`,{method:'POST',headers:{apikey:FORM_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(payload)});
  if(!res.ok){
    let message='Unable to submit the form right now. Please check your details and try again.';
    try{
      const data=await res.json();
      if(data?.code==='23514'&&String(data?.message||'').includes('company_inquiries_project_details_check')) message='Please enter at least 10 characters for the project details.';
      else if(data?.code==='23514'&&String(data?.message||'').includes('company_inquiries_full_name_check')) message='Please enter a valid full name.';
      else if(data?.code==='23514'&&String(data?.message||'').includes('company_inquiries_company_name_check')) message='Please enter a valid company name.';
    }catch(_){ }
    throw new Error(message);
  }
}

const inquiryForm=document.getElementById('fullInquiryForm');
if(inquiryForm){
  const fields=inquiryForm.querySelectorAll('input,select,textarea');
  if(fields[0]){fields[0].minLength=2;fields[0].maxLength=120}
  if(fields[1]){fields[1].minLength=2;fields[1].maxLength=160}
  if(fields[4]){fields[4].minLength=10;fields[4].maxLength=5000}

  inquiryForm.addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=inquiryForm.querySelector('button[type="submit"]');
    const fullName=fields[0].value.trim();
    const companyName=fields[1].value.trim();
    const email=fields[2].value.trim().toLowerCase();
    const budgetRange=fields[3].value;
    const projectDetails=fields[4].value.trim();

    if(fullName.length<2){await showNotice({type:'error',title:'Check your name',message:'Please enter your full name before submitting.',buttonText:'Fix it'});fields[0].focus();return}
    if(companyName.length<2){await showNotice({type:'error',title:'Company name required',message:'Please enter a company or team name before submitting.',buttonText:'Fix it'});fields[1].focus();return}
    if(projectDetails.length<10){await showNotice({type:'error',title:'Tell us a little more',message:'Please enter at least 10 characters describing your project or data workflow.',buttonText:'Continue editing'});fields[4].focus();return}

    btn.disabled=true;
    btn.textContent='Sending…';
    try{
      await postPublic('company_inquiries',{full_name:fullName,company_name:companyName,email,budget_range:budgetRange,project_details:projectDetails});
      inquiryForm.reset();
      closeModal();
      await showNotice({type:'success',title:'Project inquiry received',message:'Thanks for reaching out. Your project details have been submitted successfully, and the Adatacore team has been notified.',buttonText:'Done'});
    }catch(err){
      await showNotice({type:'error',title:'We couldn’t submit that',message:err.message||'Something went wrong while submitting your inquiry. Please try again.',buttonText:'Try again'});
    }finally{
      btn.disabled=false;
      btn.textContent='Send inquiry';
    }
  });
}

const annotatorForm=document.getElementById('annotatorAppForm');
if(annotatorForm)annotatorForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const fields=annotatorForm.querySelectorAll('input,select'),btn=annotatorForm.querySelector('button[type="submit"]');
  btn.disabled=true;
  btn.textContent='Submitting…';
  try{
    await postPublic('annotator_applications',{full_name:fields[0].value.trim(),birth_place:fields[1].value.trim(),email:fields[2].value.trim().toLowerCase(),education_level:fields[3].value});
    annotatorForm.reset();
    closeAnnotatorFormModal();
    await showNotice({type:'success',title:'Application received',message:'Your annotator application has been submitted successfully. We’ll review the details you provided.',buttonText:'Done'});
  }catch(err){
    await showNotice({type:'error',title:'Submission unsuccessful',message:err.message||'We couldn’t submit your application right now. Please try again.',buttonText:'Try again'});
  }finally{
    btn.disabled=false;
    btn.textContent='Submit application';
  }
});
