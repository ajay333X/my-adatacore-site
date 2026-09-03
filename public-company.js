(()=>{'use strict';
const ENDPOINT='https://llmhyezgcnbognmmsnzq.supabase.co/functions/v1/public-site-gateway';
function ensureBrand(){if(!document.querySelector('link[data-adatacore-public-brand]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/public-brand.css?v=20260903-1';link.dataset.adatacorePublicBrand='1';document.head.appendChild(link)}document.querySelectorAll('a[href="/subprocessors"]').forEach(a=>{if(a.closest('.cp-links,.cp-footer,.top-links,.footer-links'))a.remove()})}
ensureBrand();
function sid(){try{let v=sessionStorage.getItem('adatacore_public_session');if(!v){v=crypto.randomUUID();sessionStorage.setItem('adatacore_public_session',v)}return v}catch{return ''}}
function refHost(){try{return document.referrer?new URL(document.referrer).hostname:''}catch{return ''}}
function send(eventName){try{fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,body:JSON.stringify({action:'event',event_name:eventName,page_path:location.pathname,referrer_host:refHost(),session_id:sid()})}).catch(()=>{})}catch(_){}}
window.adatacorePublicEvent=send;
send('page_view');
document.querySelectorAll('[data-public-event]').forEach(el=>el.addEventListener('click',()=>send(el.getAttribute('data-public-event'))));
if('IntersectionObserver'in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}}),{threshold:.12});document.querySelectorAll('.reveal-cp').forEach(el=>io.observe(el))}else document.querySelectorAll('.reveal-cp').forEach(el=>el.classList.add('visible'));
})();
