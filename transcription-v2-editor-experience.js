(()=>{
'use strict';
const focus=document.getElementById('v2FocusMode'),back=document.getElementById('backLink');
if(focus){
 const apply=v=>{document.body.classList.toggle('v2-focus-mode',v);focus.classList.toggle('is-active',v);focus.setAttribute('aria-pressed',String(v));focus.textContent=v?'◩ Exit focus':'◧ Focus mode';};
 try{apply(localStorage.getItem('adatacore:txv2-focus')==='true')}catch(_){}
 focus.addEventListener('click',()=>{const active=!document.body.classList.contains('v2-focus-mode');apply(active);try{localStorage.setItem('adatacore:txv2-focus',String(active))}catch(_){}});
}
if(back){
 const promote=()=>{const href=back.getAttribute('href');if(href?.startsWith('/admin/transcription?'))back.setAttribute('href',href.replace('/admin/transcription?','/admin/transcription-v2?'));};
 const observer=new MutationObserver(promote);observer.observe(back,{attributes:true,attributeFilter:['href']});promote();
}
})();