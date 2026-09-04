(()=>{
  'use strict';
  if(window.__adatacoreWorkspaceGreeting)return;
  window.__adatacoreWorkspaceGreeting=true;

  const GREETINGS={
    morning:[
      ['Good morning, {name}.','How are you doing today? Here’s what’s ready for you.'],
      ['Morning, {name}.','Hope your day is off to a good start. Your workspace is ready.'],
      ['Hello, {name} — good morning.','Let’s see what’s waiting for you today.'],
      ['Good morning, {name}.','A fresh day, a clear workspace. Here’s what’s next.']
    ],
    afternoon:[
      ['Good afternoon, {name}.','How’s your day going? Here’s what’s ready for you.'],
      ['Hey {name}, good afternoon.','Ready for your next assignment?'],
      ['Hello, {name}.','Hope your day is going well. Here’s what’s next.'],
      ['Good afternoon, {name}.','Welcome back. Your current work is right here.']
    ],
    evening:[
      ['Good evening, {name}.','How are you doing? Here’s what’s waiting for you.'],
      ['Welcome back, {name}.','Here’s a quick look at what’s ready for you.'],
      ['Hey {name}, good evening.','Hope your day went well. Let’s see what’s next.'],
      ['Good evening, {name}.','Your assignments and recent activity are ready below.']
    ],
    night:[
      ['Welcome back, {name}.','Here’s what’s waiting for you in your workspace.'],
      ['Hello, {name}.','Still checking in? Your latest work is right below.'],
      ['Hi {name}.','Here’s a quick look at what’s ready for you.'],
      ['Good evening, {name}.','Take a look at your next assignments when you’re ready.']
    ]
  };

  const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
  const firstName=value=>{
    const clean=String(value||'').trim();
    if(!clean||/^user$/i.test(clean))return '';
    return clean.split(/\s+/)[0];
  };
  const periodForHour=h=>h>=5&&h<12?'morning':h>=12&&h<17?'afternoon':h>=17&&h<22?'evening':'night';
  const isOverview=()=>!location.hash||location.hash==='#overview';

  function choose(name){
    const now=new Date(),period=periodForHour(now.getHours()),slot=Math.floor(now.getHours()/3);
    const day=`${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
    const list=GREETINGS[period];
    const idx=hash(`${name}|${day}|${slot}|adatacore-greeting`)%list.length;
    return list[idx].map(v=>v.replace('{name}',name));
  }

  function apply(){
    if(!isOverview())return;
    const heading=document.getElementById('viewHeading'),sub=document.getElementById('viewSub');
    if(!heading||!sub)return;
    const name=firstName(document.getElementById('name')?.textContent);
    if(!name)return;
    const [title,subtitle]=choose(name);
    if(heading.textContent!==title)heading.textContent=title;
    if(sub.textContent!==subtitle)sub.textContent=subtitle;
  }

  apply();
  window.addEventListener('hashchange',()=>setTimeout(apply,0));
  window.addEventListener('focus',apply);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)apply()});

  const observer=new MutationObserver(()=>apply());
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  setTimeout(apply,150);
  setTimeout(apply,600);
  setTimeout(apply,1500);
})();