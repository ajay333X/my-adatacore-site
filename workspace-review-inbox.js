(()=>{
'use strict';
// Authenticated contributor inbox for completed L2 review decisions.
// Does not poll reviewer data for other contributors.
const $=id=>document.getElementById(id),overview=$('view-overview'),assignments=$('view-assignments');
if(!overview||!assignments||typeof db==='undefined')return;
const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e};
const makeSection=(id)=>{
 const section=make('section','txfb-section');section.id=id;section.hidden=true;
 const heading=make('div','txfb-heading');
 heading.append(make('div','txfb-heading-copy'));
 const copy=heading.firstChild;copy.append(make('small','txfb-kicker','TRANSCRIPTION QUALITY'),make('h2','', 'Reviewer feedback'));
 const count=make('span','txfb-count');count.dataset.count='true';heading.append(count);
 section.append(heading,make('div','txfb-list'));return section;
};
const sectionOverview=makeSection('txfbOverview'),sectionAssignments=makeSection('txfbAssignments');
overview.insertBefore(sectionOverview,overview.querySelector('.overview-columns')||null);
assignments.insertBefore(sectionAssignments,$('readyTasks')||null);
let latest=[],loading=false,expanded=false;
const isUUID=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s||''));
function buildCard(r){
 const card=make('article','txfb-card');
 if(!r.seen)card.classList.add('txfb-unread');
 const head=make('div','txfb-card-head');
 const status=r.decision==='approve'?'Approved':'Corrections requested';
 const label=make('strong','txfb-status',status);
 label.dataset.decision=r.decision;
 head.append(label);
 if(!r.seen)head.append(make('span','txfb-new','New feedback'));
 const date=new Date(r.reviewed_at||'');
 if(!Number.isNaN(date.valueOf()))head.append(make('time','txfb-date',date.toLocaleDateString()));
 card.append(head);
 card.append(make('h3','',r.project_name||'Transcription review'));
 const filename=r.audio_name||'Audio transcription';
 card.append(make('small','txfb-audio',filename));
 const ratings=r.ratings||{};
 if(Number.isFinite(Number(ratings.overall))&&ratings.overall!==undefined){
  const rating=make('span','txfb-rating',ratings.overall+' / 5 overall');
  card.append(rating);
 }
 const note=make('p','txfb-message',String(r.feedback||'').trim()||'Review completed. Open the review to see what changed.');
 card.append(note);
 const foot=make('div','txfb-actions');
 if(isUUID(r.item_id)&&Number.isInteger(Number(r.history_id))&&Number(r.history_id)>0){
  const link=make('a','txfb-view','View feedback & diff →');
  const url=new URL('/transcription-v2',location.origin);
  url.searchParams.set('item',r.item_id);
  url.searchParams.set('review',String(r.history_id));
  link.href=url.pathname+url.search;
  foot.append(link);
 }
 card.append(foot);
 return card;
}
function renderOne(section,items,allowMore){
 section.hidden=!latest.length;
 if(section.hidden)return;
 const unread=latest.filter(x=>!x.seen).length;
 const count=section.querySelector('[data-count]');
 count.textContent=unread?unread+' new · '+latest.length+' total':latest.length+' reviewed';
 const list=section.querySelector('.txfb-list');list.replaceChildren();
 for(const r of items)list.append(buildCard(r));
 if(allowMore&&latest.length>4){
  const more=make('button','txfb-more',expanded?'Show fewer':'See all '+latest.length+' reviews');
  more.type='button';more.addEventListener('click',()=>{expanded=!expanded;render()});
  list.append(more);
 }
}
function render(){
 renderOne(sectionOverview,latest.slice(0,2),false);
 renderOne(sectionAssignments,expanded?latest:latest.slice(0,4),true);
}
async function refresh(){
 if(loading||document.hidden)return;
 loading=true;
 try{
  const {data,error}=await db.rpc('tx_my_review_feedback');
  if(error)throw error;
  latest=Array.isArray(data)?data:[];
  render();
 }catch(e){console.warn('Could not load transcription review inbox:',e.message)}
 finally{loading=false}
}
refresh();
window.addEventListener('focus',refresh);
window.addEventListener('txv2:feedback-read',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
setInterval(refresh,30000);
})();
