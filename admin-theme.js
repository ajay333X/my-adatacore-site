(()=>{
'use strict';
if(window.__adatacoreAdminTheme)return;window.__adatacoreAdminTheme=true;
const KEY='adatacore-theme',LEGACY='adatacore-admin-theme',DASH='adatacore-dashboard-theme',VALID=new Set(['light','dark']);
const reduceMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const savedTheme=()=>{try{const a=localStorage.getItem(KEY),b=localStorage.getItem(LEGACY),c=localStorage.getItem(DASH);if(VALID.has(a))return a;if(VALID.has(b))return b;if(VALID.has(c))return c;return window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(_){return 'light'}};
function setTheme(theme,persist=false){
  const next=VALID.has(theme)?theme:'light',root=document.documentElement;
  root.dataset.adminTheme=next;root.dataset.dashboardTheme=next;root.dataset.adatacoreTheme=next;root.style.colorScheme=next;
  if(persist){try{localStorage.setItem(KEY,next);localStorage.setItem(LEGACY,next);localStorage.setItem(DASH,next)}catch(_){}}
  const button=document.getElementById('adminThemeToggle');
  if(button){const dark=next==='dark';button.dataset.theme=next;button.setAttribute('aria-pressed',String(dark));button.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme');button.title=dark?'Switch to light theme':'Switch to dark theme';const label=button.querySelector('.admin-theme-label');if(label)label.textContent=dark?'Light':'Dark'}
}
function transitionTheme(next,button){
  if(button.getAttribute('aria-busy')==='true')return;button.setAttribute('aria-busy','true');button.classList.add('is-switching');
  const finish=()=>{button.classList.remove('is-switching');button.setAttribute('aria-busy','false')};
  if(!reduceMotion()&&document.startViewTransition){const tr=document.startViewTransition(()=>setTheme(next,true));tr.finished.catch(()=>{}).finally(finish);return}
  setTheme(next,true);setTimeout(finish,reduceMotion()?40:180);
}
function mount(){
  setTheme(document.documentElement.dataset.adminTheme||savedTheme());
  const actions=document.querySelector('.admin-header-actions');if(!actions||document.getElementById('adminThemeToggle'))return !!actions;
  const button=document.createElement('button');button.id='adminThemeToggle';button.className='admin-theme-toggle';button.type='button';button.innerHTML='<span class="admin-theme-sky" aria-hidden="true"><span class="admin-theme-star s1"></span><span class="admin-theme-star s2"></span><span class="admin-theme-star s3"></span><span class="admin-theme-orb"></span></span><span class="admin-theme-label">Dark</span>';
  actions.prepend(button);setTheme(document.documentElement.dataset.adminTheme||savedTheme());button.addEventListener('click',()=>transitionTheme(document.documentElement.dataset.adminTheme==='dark'?'light':'dark',button));return true;
}
setTheme(document.documentElement.dataset.adminTheme||savedTheme());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
let tries=0;const timer=setInterval(()=>{tries++;if(mount()||tries>40)clearInterval(timer)},125);
window.addEventListener('storage',e=>{if((e.key===KEY||e.key===LEGACY||e.key===DASH)&&VALID.has(e.newValue))setTheme(e.newValue)});
})();
