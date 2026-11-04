/* Inline SVG icons: consistent stroke weight, zero external assets. */
(()=>{'use strict';
const icons={
overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
settings:'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.1 2.1-.06-.06A1.7 1.7 0 0 0 15.75 18a1.7 1.7 0 0 0-1.05 1.55V20h-3v-.45A1.7 1.7 0 0 0 10.65 18a1.7 1.7 0 0 0-1.9.98l-.06.06-2.1-2.1.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.55-1.05H5.1v-3h.35A1.7 1.7 0 0 0 7 9.9a1.7 1.7 0 0 0-.35-1.88L6.6 8l2.1-2.1.06.06A1.7 1.7 0 0 0 10.65 6 1.7 1.7 0 0 0 11.7 4.45V4h3v.45A1.7 1.7 0 0 0 15.75 6a1.7 1.7 0 0 0 1.9-.04l.06-.06 2.1 2.1-.06.06A1.7 1.7 0 0 0 19.4 9.9a1.7 1.7 0 0 0 1.55 1.05h.35v3h-.35A1.7 1.7 0 0 0 19.4 15Z" transform="translate(-1 -1) scale(.96)"/>',
inventory:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12M15 9v12"/>',
people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v1"/>',
assignments:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 12l2 2 4-4M9 18h6"/>',
templates:'<path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M15 3v5h5M9 12h6M9 16h6"/>',
reviews:'<path d="m9 12 2 2 4-4"/><path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6l-8-4Z"/>',
payments:'<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9h19M7 15h3"/>',
activity:'<path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2"/>',
danger:'<path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v5M12 17h.01"/>'
};
const svg=k=>'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="lab-nav-icon">'+(icons[k]||icons.overview)+'</svg>';
function paint(){
 document.querySelectorAll('.lab-app .lab-nav button[data-view]').forEach(btn=>{
 if(btn.querySelector('.lab-nav-icon'))return;
 const label=btn.textContent.replace(/^[^A-Za-z]+/,'').trim();
 const icon=document.createElement('span');icon.innerHTML=svg(btn.dataset.view);btn.textContent=label;btn.prepend(icon.firstChild);
 });
 document.querySelectorAll('.lab-app .quick[data-jump]').forEach(card=>{
 if(card.querySelector('.quick-icon'))return;
 const icon=document.createElement('span');icon.className='quick-icon';icon.innerHTML=svg(card.dataset.jump);card.prepend(icon);
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',paint,{once:true});else paint();
const root=document.querySelector('.lab-app');if(root){let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;paint()})}).observe(root,{childList:true,subtree:true})}
})();