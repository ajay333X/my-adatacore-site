(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const GATEWAY='https://llmhyezgcnbognmmsnzq.supabase.co/functions/v1/public-site-gateway';
const modal=$('#projectModal'),toast=$('#homeToast'),menuBtn=$('#mobileNavBtn'),mobileMenu=$('#mobileMenu');
let toastTimer=null,formStartedAt=0;
function sessionId(){try{let v=sessionStorage.getItem('adatacore_public_session');if(!v){v=crypto.randomUUID();sessionStorage.setItem('adatacore_public_session',v)}return v}catch{return ''}}
function refHost(){try{return document.referrer?new URL(document.referrer).hostname:''}catch{return ''}}
function event(name){try{fetch(GATEWAY,{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,body:JSON.stringify({action:'event',event_name:name,page_path:location.pathname,referrer_host:refHost(),session_id:sessionId()})}).catch(()=>{})}catch(_){}}
window.adatacorePublicEvent=event;
function lockBody(v){document.body.style.overflow=v?'hidden':''}
function openProject(){if(!modal)return;formStartedAt=Date.now();modal.classList.add('open');modal.setAttribute('aria-hidden','false');lockBody(true);event('project_inquiry_open');setTimeout(()=>$('#inqName')?.focus(),50)}
function closeProject(){if(!modal)return;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');lockBody(false)}
window.openProjectInquiry=openProject;
function showToast(title,message){if(!toast)return;toast.innerHTML=`<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),5200)}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function gateway(payload){const res=await fetch(GATEWAY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});let data={};try{data=await res.json()}catch(_){}if(!res.ok)throw new Error(data?.error||'We could not submit your inquiry right now. Please try again.');return data}
const form=$('#projectInquiryForm');
if(form)form.addEventListener('submit',async e=>{e.preventDefault();const submit=$('#inqSubmit');const fullName=$('#inqName').value.trim(),companyName=$('#inqCompany').value.trim(),email=$('#inqEmail').value.trim().toLowerCase(),stage=$('#inqStage').value,details=$('#inqDetails').value.trim(),website=$('#inqWebsite')?.value||'';if(fullName.length<2)return showToast('Check your name','Please enter your full name.');if(companyName.length<2)return showToast('Company required','Please enter your company or team name.');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return showToast('Check your email','Please enter a valid work email.');if(details.length<10)return showToast('Add more context','Please add at least a short project brief so we can route your inquiry correctly.');submit.disabled=true;submit.textContent='Sending…';try{await gateway({action:'inquiry',full_name:fullName,company_name:companyName,email,project_stage:stage||null,project_details:details,website,started_at:formStartedAt||Date.now()-2000});event('project_inquiry_submit_success');form.reset();closeProject();showToast('Project inquiry received','Thanks. Your project brief has been submitted to Adatacore.')}catch(err){event('project_inquiry_submit_error');showToast('Submission unsuccessful',err.message||'Please try again.')}finally{submit.disabled=false;submit.textContent='Send project inquiry'}});
$$('[data-close-modal]').forEach(el=>el.addEventListener('click',closeProject));modal?.addEventListener('click',e=>{if(e.target===modal)closeProject()});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeProject();if(mobileMenu?.classList.contains('open'))toggleMenu(false)}});
function toggleMenu(force){if(!menuBtn||!mobileMenu)return;const open=typeof force==='boolean'?force:!mobileMenu.classList.contains('open');mobileMenu.classList.toggle('open',open);menuBtn.classList.toggle('open',open);menuBtn.setAttribute('aria-expanded',String(open))}
menuBtn?.addEventListener('click',()=>toggleMenu());$$('#mobileMenu a').forEach(a=>a.addEventListener('click',()=>toggleMenu(false)));
$$('.faq-v2-btn').forEach(btn=>btn.addEventListener('click',()=>{const item=btn.closest('.faq-v2-item'),open=item.classList.toggle('open');btn.setAttribute('aria-expanded',String(open))}));
$$('[data-public-event]').forEach(el=>el.addEventListener('click',()=>event(el.getAttribute('data-public-event'))));
if('IntersectionObserver'in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const io=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');io.unobserve(entry.target)}}),{threshold:.12,rootMargin:'0px 0px -40px'});$$('.reveal-v2').forEach(el=>io.observe(el))}else $$('.reveal-v2').forEach(el=>el.classList.add('visible'));
event('page_view');
if(new URLSearchParams(location.search).get('start')==='project')setTimeout(openProject,120);
})();