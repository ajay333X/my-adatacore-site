(()=>{'use strict';
const trigger=document.getElementById('finderTrigger'),input=document.getElementById('participantQuery'),results=document.getElementById('finderResults'),title=document.getElementById('finderTitle'),snapshot=document.getElementById('participantSnapshot');
if(!trigger||!input||!results)return;
let timer=null,requestSeq=0,lastResults=[];
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const badge=(kind,status)=>{const s=String(status||'').toLowerCase();const cls=['active','approved','submitted','ready','in_progress'].includes(s)?'pill-green':['blocked','rejected','archived','cancelled'].includes(s)?'pill-red':'pill-brand';return `<span class="pill ${cls}">${safe(kind)}${status?' · '+safe(status):''}</span>`};
trigger.childNodes.forEach(n=>{if(n.nodeType===Node.TEXT_NODE&&n.textContent.trim())n.textContent='Global search '});
input.placeholder='Search name, email, UID, Task ID, project, or audio…';
input.setAttribute('aria-label','Global admin search');
if(title)title.textContent='Global search · Participants, tasks, projects, and transcription audio.';

function render(rows,q){lastResults=Array.isArray(rows)?rows:[];if(!lastResults.length){results.innerHTML=`<div class="finder-empty">No results for “${safe(q)}”.</div>`;return}results.innerHTML=lastResults.map((r,i)=>{const kind=String(r.kind||'result');const attrs=kind==='task'?`data-task-key="${safe(r.key)}"`:kind==='participant'?`data-global-participant="${safe(r.key)}"`:`data-global-url="${safe(r.url||'')}"`;return `<button class="finder-result ${i===0?'active':''}" ${attrs} data-global-index="${i}" type="button"><div><div class="finder-result-name">${safe(r.title||r.key)}</div><div class="finder-result-meta">${safe(r.meta||'')}</div></div>${badge(kind,r.status)}</button>`}).join('')}

async function search(q){const seq=++requestSeq;results.innerHTML='<div class="finder-empty">Searching…</div>';try{const {data,error}=await db.rpc('admin_global_search',{p_query:q,p_limit:24});if(error)throw error;if(seq!==requestSeq||input.value.trim()!==q)return;render(data,q)}catch(e){if(seq!==requestSeq)return;results.innerHTML=`<div class="finder-empty">Search unavailable: ${safe(e.message||e)}</div>`}}

input.addEventListener('input',()=>{const q=input.value.trim();clearTimeout(timer);requestSeq++;if(!q){lastResults=[];return}timer=setTimeout(()=>search(q),130)});
results.addEventListener('click',e=>{const person=e.target.closest('[data-global-participant]');if(person){e.preventDefault();e.stopImmediatePropagation();if(typeof lookupParticipant==='function')lookupParticipant(person.dataset.globalParticipant);return}const direct=e.target.closest('[data-global-url]');if(direct&&direct.dataset.globalUrl){e.preventDefault();e.stopImmediatePropagation();location.href=direct.dataset.globalUrl}},true);
input.addEventListener('keydown',e=>{if(e.key!=='Enter'||!lastResults.length)return;const first=lastResults[0];if(first.kind==='task')return;if(first.kind==='participant'){e.preventDefault();e.stopImmediatePropagation();if(typeof lookupParticipant==='function')lookupParticipant(first.key);return}if(first.url){e.preventDefault();e.stopImmediatePropagation();location.href=first.url}},true);

const originalOpen=typeof openParticipantFinder==='function'?openParticipantFinder:null;
if(originalOpen){openParticipantFinder=function(){originalOpen();lastResults=[];requestSeq++;if(title)title.textContent='Global search · Participants, tasks, projects, and transcription audio.'}}
})();
