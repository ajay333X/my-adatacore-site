(()=>{
'use strict';
if(window.__adatacoreAdminTheme)return;window.__adatacoreAdminTheme=true;
const KEY='adatacore-admin-theme',VALID=new Set(['light','dark']);
const reduceMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const savedTheme=()=>{try{const v=localStorage.getItem(KEY);return VALID.has(v)?v:'light'}catch(_){return 'light'}};
function setTheme(theme,persist=false){
  const next=VALID.has(theme)?theme:'light';
  document.documentElement.dataset.adminTheme=next;
  document.documentElement.style.colorScheme=next;
  if(persist){try{localStorage.setItem(KEY,next)}catch(_){}}
  const button=document.getElementById('adminThemeToggle');
  if(button){
    const dark=next==='dark';
    button.dataset.theme=next;
    button.setAttribute('aria-pressed',String(dark));
    button.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme');
    button.title=dark?'Switch to light theme':'Switch to dark theme';
    const label=button.querySelector('.admin-theme-label');if(label)label.textContent=dark?'Light':'Dark';
  }
}
function transitionTheme(next,button){
  if(button.getAttribute('aria-busy')==='true')return;
  button.setAttribute('aria-busy','true');button.classList.add('is-switching');
  if(reduceMotion()){
    setTheme(next,true);
    setTimeout(()=>{button.classList.remove('is-switching');button.setAttribute('aria-busy','false')},80);
    return;
  }
  const r=button.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  const edgeX=Math.max(x,innerWidth-x),edgeY=Math.max(y,innerHeight-y),radius=Math.hypot(edgeX,edgeY),scale=Math.max(1,radius/15*1.08);
  const wipe=document.createElement('div');wipe.className='admin-theme-transition';wipe.style.left=`${x-15}px`;wipe.style.top=`${y-15}px`;wipe.style.background=next==='dark'?'#080810':'#f4f6fb';document.body.appendChild(wipe);
  const animation=wipe.animate([
    {transform:'scale(.01)',opacity:.96,offset:0},
    {transform:`scale(${scale})`,opacity:1,offset:.56},
    {transform:`scale(${scale})`,opacity:0,offset:1}
  ],{duration:660,easing:'cubic-bezier(.22,.8,.22,1)',fill:'forwards'});
  setTimeout(()=>setTheme(next,true),285);
  animation.finished.catch(()=>{}).finally(()=>{wipe.remove();button.classList.remove('is-switching');button.setAttribute('aria-busy','false')});
}
function mount(){
  setTheme(document.documentElement.dataset.adminTheme||savedTheme());
  const actions=document.querySelector('.admin-header-actions');if(!actions||document.getElementById('adminThemeToggle'))return !!actions;
  const button=document.createElement('button');button.id='adminThemeToggle';button.className='admin-theme-toggle';button.type='button';button.innerHTML='<span class="admin-theme-sky" aria-hidden="true"><span class="admin-theme-star s1"></span><span class="admin-theme-star s2"></span><span class="admin-theme-star s3"></span><span class="admin-theme-orb"></span></span><span class="admin-theme-label">Dark</span>';
  actions.prepend(button);setTheme(document.documentElement.dataset.adminTheme||savedTheme());
  button.addEventListener('click',()=>transitionTheme(document.documentElement.dataset.adminTheme==='dark'?'light':'dark',button));
  return true;
}
setTheme(document.documentElement.dataset.adminTheme||savedTheme());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
let tries=0;const timer=setInterval(()=>{tries++;if(mount()||tries>40)clearInterval(timer)},125);
window.addEventListener('storage',e=>{if(e.key===KEY&&VALID.has(e.newValue))setTheme(e.newValue)});
})();
