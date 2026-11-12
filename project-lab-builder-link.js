(()=>{
'use strict';
if(window.__acVisualBuilderLink)return;window.__acVisualBuilderLink=true;
const P=Number(new URLSearchParams(location.search).get('project')||0);
const dest='/admin/project-builder'+(P?'?project='+P:'');
function mount(){
 const settings=document.querySelector('.lab-nav [data-view="settings"]'),main=document.querySelector('.lab-main');
 if(!settings||!main)return false;
 const scope=window.__adatacoreProjectAccess;
 if(!scope?.is_super_admin)return false;
 if(!document.getElementById('view-interface')){
  const nav=document.createElement('button');nav.dataset.view='interface';nav.textContent='▧ Visual Builder';settings.after(nav);
  const section=document.createElement('section');section.id='view-interface';section.className='lab-view';
  section.innerHTML='<div class="view-head"><div><div class="eyebrow">Advanced visual design</div><h1>Project Builder</h1><p>Control every new page, nested layer, shape, component, color and layout—not just a cover image. Your project engine and task history remain intact.</p></div></div><div class="card lab-card" style="padding:38px;max-width:1000px"><div style="display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:25px;align-items:center"><div><div class="eyebrow">ADATACORE / VISUAL BUILDER</div><h2 style="font-size:29px;letter-spacing:-.04em;margin:10px 0">Design complete project interfaces.</h2><p style="font-size:13px;line-height:1.8;color:var(--muted)">Drag and drop components. Create multiple pages. Rearrange layer trees. Edit dimensions, colors, backgrounds, borders and typography. Add audio and transcription interface blocks, then preview, save drafts and publish.</p><a id="visualBuilderOpen" class="btn btn-primary" style="margin-top:16px" href="#">Open full Visual Builder ↗</a></div><div style="border-radius:16px;background:linear-gradient(160deg,#172c3a,#1a665d);padding:24px;display:grid;gap:12px;color:white;font-size:12px"><div>▤ &nbsp; Pages</div><div style="padding-left:22px">▧ &nbsp; Header</div><div style="padding-left:22px">▣ &nbsp; Grid</div><div style="padding-left:44px">■ &nbsp; Button</div><div style="padding-left:44px">◉ &nbsp; Audio widget</div><div>≡ &nbsp; Layers + styles</div></div></div></div><div class="card lab-card" style="margin-top:14px;max-width:1000px"><strong style="font-size:12px">Safe publishing</strong><p style="font-size:12px;line-height:1.7;color:var(--muted)">The builder publishes additional project pages. Existing production recording, transcription and evaluation logic is not overwritten. Connect new workflow actions before enabling contributors.</p></div>';
  main.append(section);
  section.querySelector('#visualBuilderOpen').href=dest;
  nav.onclick=()=>{
   document.querySelectorAll('.lab-nav button').forEach(b=>b.classList.toggle('active',b===nav));
   document.querySelectorAll('.lab-view').forEach(x=>x.classList.toggle('active',x===section));
   history.replaceState(null,'','/admin/project-lab?project='+P+'#interface');
  };
 }
 if(location.hash==='#interface')document.querySelector('.lab-nav [data-view="interface"]')?.click();
 return true;
}
async function init(){
 for(let n=0;n<120;n++){
  if(mount())return;
  await new Promise(resolve=>setTimeout(resolve,130));
 }
}
init();
})();