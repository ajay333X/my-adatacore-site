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

    if(fullName.length<2){alert('Please enter your full name.');fields[0].focus();return}
    if(companyName.length<2){alert('Please enter a company or team name.');fields[1].focus();return}
    if(projectDetails.length<10){alert('Please enter at least 10 characters for the project details.');fields[4].focus();return}

    btn.disabled=true;
    btn.textContent='Sending…';
    try{
      await postPublic('company_inquiries',{full_name:fullName,company_name:companyName,email,budget_range:budgetRange,project_details:projectDetails});
      inquiryForm.reset();
      closeModal();
      alert('Thanks — your inquiry was submitted successfully.');
    }catch(err){
      alert(err.message||'Unable to submit the form right now. Please try again.');
    }finally{
      btn.disabled=false;
      btn.textContent='Send inquiry';
    }
  });
}

const annotatorForm=document.getElementById('annotatorAppForm');if(annotatorForm)annotatorForm.addEventListener('submit',async e=>{e.preventDefault();const fields=annotatorForm.querySelectorAll('input,select'),btn=annotatorForm.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent='Submitting…';try{await postPublic('annotator_applications',{full_name:fields[0].value.trim(),birth_place:fields[1].value.trim(),email:fields[2].value.trim().toLowerCase(),education_level:fields[3].value});annotatorForm.reset();closeAnnotatorFormModal();alert('Application submitted successfully.')}catch(err){alert(err.message||'Unable to submit your application right now.')}finally{btn.disabled=false;btn.textContent='Submit application'}});
