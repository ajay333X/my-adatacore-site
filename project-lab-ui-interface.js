(()=>{
'use strict';
if(window.__acUiEditorLoaded)return;window.__acUiEditorLoaded=true;
const P=Number(new URLSearchParams(location.search).get('project')||0);
const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
const $=x=>document.getElementById(x);
const colors=['#155a64','#315c91','#7252a2','#197757','#af6939'];
let project=null,stored=null,busy=false;
const css='<style id="acEditorCss">'+
'.ac-ui-grid{display:grid;grid-template-columns:minmax(300px,.85fr) minmax(300px,1.1fr);gap:16px}.ac-ui-fields{display:grid;gap:12px}.ac-ui-fields label{font-size:11px;font-weight:780;display:block;margin-bottom:5px}.ac-ui-fields .input{width:100%;min-height:42px;padding:9px 11px}.ac-ui-fields textarea.input{min-height:72px;resize:vertical}.ac-ui-actions{display:flex;gap:8px;flex-wrap:wrap}.ac-ui-actions .btn{flex:1}.ac-ui-preview{border-radius:15px;border:1px solid var(--line);overflow:hidden;background:var(--panel)}.ac-ui-cover{height:133px;padding:20px;display:flex;align-items:end;position:relative;background:linear-gradient(125deg,var(--ui-accent,#155a64),#223c4a);color:white}.ac-ui-cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.ac-ui-cover:after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,#142d386e,transparent)}.ac-ui-cover b{position:relative;z-index:2;font-size:10px;letter-spacing:.1em;text-transform:uppercase}.ac-ui-preview-body{padding:22px}.ac-ui-preview-body h3{font-size:23px;margin:0 0 8px}.ac-ui-preview-body p{color:var(--muted);line-height:1.6;font-size:12px;margin-bottom:15px}.ac-ui-preview-body button{border:0;border-radius:9px;padding:11px 17px;color:#fff;font-weight:800;background:var(--ui-accent,#155a64)}.ac-ui-swatches{display:flex;gap:9px;align-items:center}.ac-ui-swatches button{border:2px solid #fff;outline:1px solid var(--line);height:27px;width:27px;border-radius:50%;cursor:pointer}.ac-ui-preview-iframe{display:none;margin-top:12px;border:1px solid var(--line);border-radius:10px;overflow:hidden}.ac-ui-preview-iframe iframe{width:100%;height:480px;border:0}.ac-ui-help{font-size:10px;color:var(--muted);line-height:1.7}.ac-ui-code{font-family:ui-monospace,monospace;font-size:12px;font-weight:780;letter-spacing:.07em;user-select:all;word-break:break-all}.ac-ui-editor-note{font-size:11px;color:var(--muted);line-height:1.6}.ac-ui-editor-note:not(:empty){padding:10px;background:var(--panel2);border-radius:8px}.ac-ui-columns{display:flex;align-items:center;gap:12px}@media(max-width:980px){.ac-ui-grid{grid-template-columns:1fr}.ac-ui-preview-iframe iframe{height:380px}}</style>';
function message(t){$('acUiMsg').textContent=t}
function clean(raw){
 const v={headline:String(raw.headline||'').trim().slice(0,110),subtitle:String(raw.subtitle||'').trim().slice(0,260),badge:String(raw.badge||'').trim().slice(0,60),button_label:String(raw.button_label||'').trim().slice(0,50),accent:String(raw.accent||'#155a64'),image_url:String(raw.image_url||'').trim()};
 if(!/^#[0-9a-f]{6}$/i.test(v.accent))throw Error('Choose a valid accent color.');
 if(v.image_url&&(!/^https:\/\/[^ <>"']+$/i.test(v.image_url)||v.image_url.length>1000))throw Error('Use an HTTPS image URL or upload an image.');
 return v;
}
function collect(){return clean({headline:$('acUiHeadline').value,subtitle:$('acUiSubtitle').value,badge:$('acUiBadge').value,button_label:$('acUiButton').value,accent:$('acUiAccent').value,image_url:$('acUiImage').value})}
function preview(){
 if(!project)return;const draft=collect(),wrap=$('acUiDesign'),cover=$('acUiCover');
 wrap.style.setProperty('--ui-accent',draft.accent);
 $('acUiAccentLabel').textContent=draft.accent;
 $('acUiPreviewHeadline').textContent=draft.headline||project.project_name;
 $('acUiPreviewSubtitle').textContent=draft.subtitle||project.description||'Your assigned project workspace.';
 $('acUiPreviewBadge').textContent=draft.badge||'ADATACORE PROJECT';
 $('acUiPreviewButton').textContent=draft.button_label||'Open project →';
 cover.querySelector('img')?.remove();
 if(draft.image_url){const img=document.createElement('img');img.src=draft.image_url;img.alt='Project cover';cover.prepend(img)}
}
function fill(c={}){
 $('acUiHeadline').value=c.headline||'';$('acUiSubtitle').value=c.subtitle||'';
 $('acUiBadge').value=c.badge||'';$('acUiButton').value=c.button_label||'';
 $('acUiAccent').value=/^#[0-9a-f]{6}$/i.test(c.accent||'')?c.accent:'#155a64';
 $('acUiImage').value=c.image_url||'';
 preview();
}
function initUi(){
 const nav=document.querySelector('.lab-nav'),settings=nav?.querySelector('[data-view="settings"]'),main=document.querySelector('.lab-main');
 if(!nav||!settings||!main)return false;
 const b=document.createElement('button');b.dataset.view='interface';b.textContent='▧ UI Interface';
 settings.after(b);
 const panel=document.createElement('section');panel.id='view-interface';panel.className='lab-view';
 panel.innerHTML=
 '<div class="view-head"><div><div class="eyebrow">No-code project design</div><h1>UI Interface</h1><p>Customize the project screen without touching code. Preview changes, save a draft, publish the design, or restore the previous design.</p></div><span id="acUiState" class="pill pill-gray">Draft</span></div>'+
 '<div class="ac-ui-grid"><div class="card lab-card ac-ui-fields">'+
 '<div><label>Public project reference</label><div class="ac-ui-columns"><code class="ac-ui-code" id="acUiCode" style="overflow-wrap:anywhere;user-select:all;flex:1">Loading…</code><button type="button" class="btn btn-secondary" id="acUiCopy">Copy ID</button></div></div>'+
 '<div><label for="acUiHeadline">Main heading</label><input id="acUiHeadline" maxlength="110" class="input" placeholder="Welcome to your project"></div>'+
 '<div><label for="acUiSubtitle">Description</label><textarea id="acUiSubtitle" maxlength="260" class="input" placeholder="Short introduction"></textarea></div>'+
 '<div><label for="acUiBadge">Small label</label><input id="acUiBadge" maxlength="60" class="input" placeholder="Voice Studio"></div>'+
 '<div><label for="acUiButton">Primary button label</label><input id="acUiButton" maxlength="50" class="input" placeholder="Open studio"></div>'+
 '<div><label for="acUiAccent">Accent color</label><div class="ac-ui-columns"><input type="color" id="acUiAccent" value="#155a64"><span class="ac-ui-code" id="acUiAccentLabel"></span></div><div class="ac-ui-swatches" id="acUiSwatches"></div></div>'+
 '<div><label for="acUiImage">Cover image URL (HTTPS)</label><input id="acUiImage" class="input" type="url" maxlength="1000" placeholder="https://…"></div>'+
 '<div><label for="acUiFile">Or upload a cover image (up to 3 MB)</label><input id="acUiFile" type="file" class="input" accept="image/png,image/jpeg,image/webp,image/gif"></div>'+
 '<p class="ac-ui-help">Design settings affect headings, buttons, image and accent color, not the task workflow. Uploaded covers are public images. Only published designs appear for contributors.</p>'+
 '<div class="ac-ui-actions"><button id="acUiSave" class="btn btn-secondary">Save draft</button><button id="acUiPublish" class="btn btn-primary">Publish design</button><button id="acUiRestore" class="btn btn-secondary">Restore published</button></div>'+
 '<div class="ac-ui-editor-note" id="acUiMsg" aria-live="polite"></div></div>'+
 '<div><div class="card lab-card"><h3>Live design preview · Draft</h3><p class="ac-ui-help">Edit the fields to preview immediately. Nothing changes for contributors until Publish.</p>'+
 '<div class="ac-ui-preview" id="acUiDesign"><div class="ac-ui-cover" id="acUiCover"><b id="acUiPreviewBadge"></b></div><div class="ac-ui-preview-body"><h3 id="acUiPreviewHeadline"></h3><p id="acUiPreviewSubtitle"></p><button id="acUiPreviewButton" disabled></button></div></div></div>'+
 '<div class="card lab-card" style="margin-top:12px"><h3>Current published project interface</h3><p class="ac-ui-help">Open the actual project page below. The live page shows only the published design.</p><button id="acUiLiveBtn" type="button" class="btn btn-secondary">Open live project preview</button><div id="acUiIframe" class="ac-ui-preview-iframe"></div></div></div></div>';
 main.append(panel);document.head.insertAdjacentHTML('beforeend',css);
 b.onclick=()=>showUi();
 for(const id of ['acUiHeadline','acUiSubtitle','acUiBadge','acUiButton','acUiAccent','acUiImage'])$(id).addEventListener('input',()=>{try{preview();message('')}catch(e){message(e.message)}});
 const swatches=$('acUiSwatches');for(const col of colors){const x=document.createElement('button');x.type='button';x.style.background=col;x.title=col;x.onclick=()=>{$('acUiAccent').value=col;preview()};swatches.append(x)}
 $('acUiCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('acUiCode').textContent);message('Project reference copied to clipboard.')}catch(e){message('Select the project reference above to copy it.')}};
 $('acUiSave').onclick=()=>void save(false);$('acUiPublish').onclick=()=>void save(true);
 $('acUiRestore').onclick=()=>{fill(stored?.published||{});message('Published design restored in the editor. Save draft to retain it.')};
 $('acUiFile').onchange=()=>void upload();
 $('acUiLiveBtn').onclick=()=>{const host=$('acUiIframe');host.textContent='';const frame=document.createElement('iframe');frame.title='Published project interface';frame.loading='lazy';frame.src=P===94?'/voice-studio':'/workspace?project='+P;host.append(frame);host.style.display='block';$('acUiLiveBtn').textContent='Refresh live preview'};
 return true;
}
function showUi(){
 document.querySelectorAll('.lab-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view==='interface'));
 document.querySelectorAll('.lab-view').forEach(p=>p.classList.toggle('active',p.id==='view-interface'));
 history.replaceState(null,'','/admin/project-lab?project='+P+'#interface');
}
async function load(){
 const {data,error}=await db.from('project_lab').select('id,project_name,description,project_type,project_code').eq('id',P).single();
 if(error)throw error;project=data;$('acUiCode').textContent=data.project_code;
 const second=await db.from('project_ui_settings').select('*').eq('project_id',P).maybeSingle();
 if(second.error)throw second.error;
 stored=second.data||{draft:{},published:{}};
 fill(Object.keys(stored.draft||{}).length?stored.draft:stored.published);
 $('acUiState').textContent=stored.published_at?'Published · draft editable':'Not published';
 const sub=$('topSub');
 if(sub){
  const format=()=>{const txt=sub.textContent||'';if(txt.includes('#'+P))sub.textContent=txt.replace('#'+P,data.project_code)};
  format();new MutationObserver(format).observe(sub,{childList:true,subtree:true,characterData:true});
 }
 if(location.hash==='#interface')showUi();
}
async function save(publish){
 if(busy)return;let cfg;
 try{cfg=collect()}catch(e){message(e.message);return}
 busy=true;$('acUiSave').disabled=$('acUiPublish').disabled=true;message('Saving design…');
 try{
  const {data:{user}}=await db.auth.getUser();if(!user)throw Error('Sign in required');
  // On initial insert, define both draft and published explicitly; updates preserve the other version.
  const v={project_id:P,draft:cfg,updated_at:new Date().toISOString(),updated_by:user.id};
  if(publish){v.published=cfg;v.published_at=new Date().toISOString()}
  const query=stored?.project_id?db.from('project_ui_settings').update(v).eq('project_id',P):db.from('project_ui_settings').insert({...v,published:publish?cfg:{}});const {data,error}=await query.select().single();
  if(error)throw error;stored=data;
  $('acUiState').textContent=publish?'Published':'Draft saved';
  message(publish?'Design published. Reload project pages to view changes.':'Draft saved. Contributors still see the published design.');
 }catch(e){message('Save failed: '+e.message)}
 finally{busy=false;$('acUiSave').disabled=$('acUiPublish').disabled=false}
}
async function upload(){
 const file=$('acUiFile').files?.[0];if(!file)return;
 const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[file.type];
 if(!ext||file.size>3145728){message('Only PNG, JPEG, WebP or GIF images under 3 MB are supported.');return}
 message('Uploading cover image…');
 const path=P+'/cover-'+Date.now()+'.'+ext;
 const {error}=await db.storage.from('project-ui-assets').upload(path,file,{contentType:file.type,upsert:false});
 if(error){message('Upload failed: '+error.message);return}
 const url=db.storage.from('project-ui-assets').getPublicUrl(path).data.publicUrl;
 $('acUiImage').value=url;preview();
 message('Image uploaded. Publish design to show it to contributors.');
}
async function start(){
 if(!P)return;
 for(let i=0;i<110;i++){
  if(window.__adatacoreProjectAccess?.allowed&&$('view-settings')&&$('topTitle'))break;
  await new Promise(done=>setTimeout(done,150));
 }
 if(!window.__adatacoreProjectAccess?.is_super_admin||!$('view-settings'))return;
 if(!initUi())return;
 try{await load()}catch(e){message('UI editor unavailable: '+e.message)}
}
start();
})();