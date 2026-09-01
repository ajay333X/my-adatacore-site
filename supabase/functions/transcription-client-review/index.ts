import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const CORS={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store'
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:CORS});
const hex=async(input:string)=>{const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('')};
const wordCount=(segments:any[])=>segments.reduce((n,s)=>n+String(s?.transcript||'').trim().split(/\s+/u).filter(Boolean).length,0);

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
  if(!['GET','POST'].includes(req.method))return json({error:'Method not allowed'},405);
  try{
    const url=new URL(req.url),singleToken=(url.searchParams.get('token')||'').trim(),bundleToken=(url.searchParams.get('bundle')||'').trim(),bundleItem=(url.searchParams.get('item')||'').trim();
    const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    let share:any=null;

    if(bundleToken){
      if(bundleToken.length<32||bundleToken.length>256||!/^[0-9a-f-]{36}$/i.test(bundleItem))return json({error:'This review link is invalid.'},401);
      const bundleHash=await hex(bundleToken);
      const {data:bundle,error:bundleErr}=await supabase.from('transcription_client_bundles').select('id,active,expires_at').eq('token_hash',bundleHash).maybeSingle();
      if(bundleErr)throw bundleErr;
      if(!bundle||!bundle.active||new Date(bundle.expires_at).getTime()<=Date.now())return json({error:'This review collection has expired or is no longer active.'},401);
      const {data:bi,error:biErr}=await supabase.from('transcription_client_bundle_items').select('share_id,item_id').eq('bundle_id',bundle.id).eq('item_id',bundleItem).maybeSingle();
      if(biErr)throw biErr;
      if(!bi)return json({error:'This task is not part of the shared review collection.'},404);
      const {data:s,error:sErr}=await supabase.from('transcription_client_shares').select('id,item_id,active,expires_at').eq('id',bi.share_id).maybeSingle();
      if(sErr)throw sErr;share=s;
    }else{
      if(singleToken.length<32||singleToken.length>256)return json({error:'This review link is invalid.'},401);
      const tokenHash=await hex(singleToken);
      const {data:s,error:shareErr}=await supabase.from('transcription_client_shares').select('id,item_id,active,expires_at').eq('token_hash',tokenHash).maybeSingle();
      if(shareErr)throw shareErr;share=s;
    }

    if(!share||!share.active||new Date(share.expires_at).getTime()<=Date.now())return json({error:'This review link has expired or is no longer active.'},401);
    const {data:item,error:itemErr}=await supabase.from('transcription_audio_items').select('id,transcription_project_id,display_name,duration_ms,duration_seconds,status,submitted_at,storage_bucket,recording_path,speakers,submitted_segments,task_id').eq('id',share.item_id).single();
    if(itemErr||!item||!item.submitted_at)return json({error:'Submitted transcription not found.'},404);
    const [{data:project},{data:task},{data:allShares}]=await Promise.all([
      supabase.from('project_lab').select('id,project_name').eq('id',item.transcription_project_id).maybeSingle(),
      item.task_id?supabase.from('tasks').select('public_task_id').eq('id',item.task_id).maybeSingle():Promise.resolve({data:null}),
      supabase.from('transcription_client_shares').select('id').eq('item_id',item.id)
    ] as any);
    const shareIds=(allShares||[]).map((s:any)=>s.id);

    if(req.method==='POST'){
      let body:any={};try{body=await req.json()}catch{return json({error:'Invalid request.'},400)}
      const action=String(body.action||'');
      if(action==='comment'){
        const author=String(body.author_name||'').trim().slice(0,100),note=String(body.note||'').trim().slice(0,2000),durationMs=Number(item.duration_ms||0)||Number(item.duration_seconds||0)*1000,timestamp=Math.max(0,Math.min(Math.round(Number(body.timestamp_ms)||0),Math.max(0,durationMs||14400000)));
        if(!author||!note)return json({error:'Add your name and a note.'},400);
        const {count}=await supabase.from('transcription_client_comments').select('id',{count:'exact',head:true}).eq('share_id',share.id);if(Number(count||0)>=500)return json({error:'This review link has reached its comment limit.'},429);
        const {error}=await supabase.from('transcription_client_comments').insert({share_id:share.id,timestamp_ms:timestamp,author_name:author,note});if(error)throw error;
      }else if(action==='rating'){
        const rating=Math.round(Number(body.clarity_rating)),name=String(body.reviewer_name||'').trim().slice(0,100)||null;if(rating<1||rating>5)return json({error:'Choose an audio clarity rating from 1 to 5.'},400);
        const {count}=await supabase.from('transcription_client_ratings').select('id',{count:'exact',head:true}).eq('share_id',share.id);if(Number(count||0)>=100)return json({error:'This review link has reached its rating limit.'},429);
        const {error}=await supabase.from('transcription_client_ratings').insert({share_id:share.id,reviewer_name:name,clarity_rating:rating});if(error)throw error;
      }else if(action==='decision'){
        const name=String(body.reviewer_name||'').trim().slice(0,100),decision=String(body.decision||''),note=String(body.note||'').trim().slice(0,2000)||null;
        if(!name)return json({error:'Add your name before submitting a decision.'},400);
        if(!['approved','changes_requested'].includes(decision))return json({error:'Choose Approve or Request changes.'},400);
        if(decision==='changes_requested'&&!note)return json({error:'Add a note describing the requested changes.'},400);
        const {count}=await supabase.from('transcription_client_decisions').select('id',{count:'exact',head:true}).eq('share_id',share.id);if(Number(count||0)>=100)return json({error:'This review link has reached its decision history limit.'},429);
        const {error}=await supabase.from('transcription_client_decisions').insert({share_id:share.id,reviewer_name:name,decision,note});if(error)throw error;
      }else return json({error:'Unknown review action.'},400);
    }

    const [{data:comments,error:commentsErr},{data:ratings,error:ratingsErr},{data:decisions,error:decisionsErr},{data:signed,error:signedErr}]=await Promise.all([
      shareIds.length?supabase.from('transcription_client_comments').select('id,timestamp_ms,author_name,note,created_at').in('share_id',shareIds).order('timestamp_ms',{ascending:true}).order('created_at',{ascending:true}):Promise.resolve({data:[]}),
      shareIds.length?supabase.from('transcription_client_ratings').select('id,reviewer_name,clarity_rating,created_at').in('share_id',shareIds).order('created_at',{ascending:true}):Promise.resolve({data:[]}),
      shareIds.length?supabase.from('transcription_client_decisions').select('id,reviewer_name,decision,note,created_at').in('share_id',shareIds).order('created_at',{ascending:true}):Promise.resolve({data:[]}),
      supabase.storage.from(item.storage_bucket).createSignedUrl(item.recording_path,7200)
    ] as any);
    if(commentsErr)throw commentsErr;if(ratingsErr)throw ratingsErr;if(decisionsErr)throw decisionsErr;if(signedErr)throw signedErr;
    const segments=Array.isArray(item.submitted_segments)?item.submitted_segments:[],ratingValues=(ratings||[]).map((r:any)=>Number(r.clarity_rating)).filter((v:number)=>Number.isFinite(v)),avg=ratingValues.length?Math.round((ratingValues.reduce((a:number,b:number)=>a+b,0)/ratingValues.length)*100)/100:null,durationMs=Number(item.duration_ms||0)||Number(item.duration_seconds||0)*1000,decisionRows=decisions||[],latestDecision=decisionRows.length?decisionRows[decisionRows.length-1]:null;
    return json({project:{name:project?.project_name||'Transcription review'},task:{id:task?.public_task_id||null},item:{id:item.id,display_name:item.display_name||'Audio',duration_ms:durationMs,status:item.status,submitted_at:item.submitted_at,speakers:Array.isArray(item.speakers)?item.speakers:[],segments},audio_url:signed?.signedUrl||null,feedback:{comments:comments||[],ratings:ratings||[],decisions:decisionRows,latest_decision:latestDecision,average_clarity:avg,comment_count:(comments||[]).length,rating_count:ratingValues.length,decision_count:decisionRows.length},stats:{word_count:wordCount(segments),segment_count:segments.length,duration_ms:durationMs}});
  }catch(e){console.error(e);return json({error:'The client review could not be loaded.'},500)}
});
