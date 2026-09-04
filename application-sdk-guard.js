(()=>{
  'use strict';
  if(window.supabase?.createClient) return;
  const unavailable=()=>Promise.reject(new Error('The secure application service did not load on this connection. Please refresh or try another network.'));
  const queryStub=()=>{
    const chain={
      select(){return chain;},
      eq(){return chain;},
      order:unavailable,
      single:unavailable
    };
    return chain;
  };
  window.supabase={
    createClient(){
      return {
        auth:{getSession:unavailable},
        rpc:unavailable,
        from(){return queryStub();},
        storage:{from(){return {createSignedUrl:unavailable,upload:unavailable};}}
      };
    }
  };
})();