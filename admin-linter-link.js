(()=>{'use strict';if(window.__acAdminLinterNav)return;window.__acAdminLinterNav=true;
function mount(){
 const access=window.__adatacoreAdminAccess;
 if(!access?.allowed)return;
 const sidebar=document.querySelector('.sidebar');if(!sidebar)return;
 if(sidebar.querySelector('#adminLinterLibraryLink'))return;
 const after=sidebar.querySelector('#transcriptionLabV2Nav')||sidebar.querySelector('[data-tab="projects"]');
 if(!after)return;
 const link=document.createElement('a');link.id='adminLinterLibraryLink';link.className='nav-link';link.href='/admin/linters';
 link.textContent='Linter Library';link.title='Reusable quality rules and project assignments';after.insertAdjacentElement('afterend',link);
}
let tries=0;const timer=setInterval(()=>{mount();if(++tries>60||document.getElementById('adminLinterLibraryLink'))clearInterval(timer)},150);
})();