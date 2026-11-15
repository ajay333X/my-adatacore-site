/* Keeps the final lines of the Solo script visible above the floating recording dock. */
(function(){
 'use strict';
 const dock=document.getElementById('recordDock');
 const body=document.getElementById('scriptBody');
 if(!dock||!body)return;
 function adjust(){
  const height=Math.ceil(dock.getBoundingClientRect().height||0);
  const gap=Math.max(32,height+24);
  document.documentElement.style.setProperty('--vs-solo-dock-height',height+'px');
  body.style.scrollPaddingBottom=gap+'px';
 }
 if(typeof ResizeObserver!=='undefined'){const ro=new ResizeObserver(adjust);ro.observe(dock);}
 window.addEventListener('resize',adjust,{passive:true});
 adjust();
})();
