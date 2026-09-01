import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const CORS={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods':'GET,OPTIONS',
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store'
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:CORS});
const hex=async(input:string)=>{const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('')};
const wordCount=(segments:any[])=>segments.reduce((n,s)=>n+String(s?.transcript||'').trim().split(/\s+/u).filter(Boolean).length,0);

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
  if(req.method!=='GET')return json({error:'Method not allowed'},405);
  try{
    const url=new URL(req.url),token=(url.searchParams.get('token')||'').trim();
    if(token.length<32||token.length>256)return json({error:'This review collection link is invalid.'},401);
    const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}}),tokenHash=await hex(token);
    const {data:bundle,error:bundleErr}=await supabase.from('transcription_client_bundles').select('id,transcription_project_id,title,active,expires_at,created_at').eq('token_hash',tokenHash).maybeSingle();
    if(bundleErr)throw bundleErr;
    if(!bundle||!bundle.active||new Date(bundle.expires_at).getTime()<=Date.now())return json({error:'This review collection has expired or is no longer active.'},401);
    const {data:links,error:linksErr}=await supabase.from('transcription_client_bundle_items').select('item_id,share_id,position').eq('bundle_id',bundle.id).order('position',{ascending:true});
    if(linksErr)throw linksErr;
    const ids=(links||[]).map((x:any)=>x.item_id),shareIds=(links||[]).map((x:any)=>x.share_id).filter(Boolean);
    if(!ids.length)return json({error:'This review collection is empty.'},404);
    const [{data:project},{data:items,error:itemsErr},{data:decisions,error:decisionErr}]=await Promise.all([
      supabase.from('project_lab').select('id,project_name').eq('id',bundle.transcription_project_id).maybeSingle(),
      supabase.from('transcription_audio_items').select('id,display_name,duration_ms,duration_seconds,status,submitted_at,storage_bucket,recording_path,submitted_segments,task_id,source_project_title,source_folder').in('id',ids),
      shareIds.length?supabase.from('transcription_client_decisions').select('id,share_id,reviewer_name,decision,note,created_at').in('share_id',shareIds).order('created_at',{ascending:true}):Promise.resolve({data:[]})
    ] as any);
    if(itemsErr)throw itemsErr;if(decisionErr)throw decisionErr;
    const taskIds=(items||[]).map((x:any)=>x.task_id).filter(Boolean),taskMap=new Map<number,string>();
    if(taskIds.length){const {data:tasks,error:taskErr}=await supabase.from('tasks').select('id,public_task_id').in('id',taskIds);if(taskErr)throw taskErr;(tasks||[]).forEach((t:any)=>taskMap.set(Number(t.id),t.public_task_id));}
    const itemMap=new Map((items||[]).map((x:any)=>[x.id,x])),decisionMap=new Map<string,any>();
    (decisions||[]).forEach((d:any)=>decisionMap.set(String(d.share_id),{id:d.id,reviewer_name:d.reviewer_name,decision:d.decision,note:d.note,created_at:d.created_at}));
    const rows=await Promise.all((links||[]).map(async(link:any)=>{
      const item:any=itemMap.get(link.item_id);if(!item)return null;
      const {data:signed,error:signedErr}=await supabase.storage.from(item.storage_bucket).createSignedUrl(item.recording_path,7200);if(signedErr)throw signedErr;
      const segments=Array.isArray(item.submitted_segments)?item.submitted_segments:[],durationMs=Number(item.duration_ms||0)||Number(item.duration_seconds||0)*1000;
      return {position:link.position,item_id:item.id,task_id:taskMap.get(Number(item.task_id))||null,display_name:item.display_name||'Audio',source_project_title:item.source_project_title||null,source_folder:item.source_folder||null,duration_ms:durationMs,status:item.status,submitted_at:item.submitted_at,segment_count:segments.length,word_count:wordCount(segments),audio_url:signed?.signedUrl||null,client_decision:decisionMap.get(String(link.share_id))||null};
    }));
    const clean=rows.filter(Boolean),totalMs=clean.reduce((n:any,x:any)=>n+Number(x.duration_ms||0),0),totalWords=clean.reduce((n:any,x:any)=>n+Number(x.word_count||0),0),reviewed=clean.filter((x:any)=>x.client_decision),approved=clean.filter((x:any)=>x.client_decision?.decision==='approved'),changes=clean.filter((x:any)=>x.client_decision?.decision==='changes_requested');
    return json({bundle:{id:bundle.id,title:bundle.title||project?.project_name||'Client review collection',expires_at:bundle.expires_at,created_at:bundle.created_at},project:{id:project?.id||bundle.transcription_project_id,name:project?.project_name||'Transcription'},items:clean,stats:{task_count:clean.length,total_duration_ms:totalMs,total_word_count:totalWords,reviewed_count:reviewed.length,approved_count:approved.length,changes_requested_count:changes.length,remaining_count:Math.max(0,clean.length-reviewed.length)}});
  }catch(e){console.error(e);return json({error:'The review collection could not be loaded.'},500)}
});
