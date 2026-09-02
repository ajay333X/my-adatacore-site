(()=>{
  'use strict';
  if(window.__adatacoreLongAudioIntake)return;
  window.__adatacoreLongAudioIntake=true;
  if(!window.supabase?.createClient)return;

  const dialog=document.getElementById('uploadDialog');
  const filesInput=document.getElementById('audioFiles');
  const confirm=document.getElementById('uploadConfirm');
  const folderInput=document.getElementById('uploadFolder');
  const results=document.getElementById('uploadResults');
  if(!dialog||!filesInput||!confirm||!folderInput||!results)return;

  const originalUploadHandler=confirm.onclick;
  const db=supabase.createClient('https://llmhyezgcnbognmmsnzq.supabase.co','sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml');
  const MAX_SOURCE_BYTES=262144000;
  const MAX_KEEP_BYTES=262144000;
  const MAX_CHUNK_BYTES=52428800;
  const MAX_SOURCE_MS=14400000;
  const OUTPUT_RATE=16000;
  const MAX_CHUNK_SECONDS=740;
  let processing=false;
  let previewToken=0;

  const style=document.createElement('style');
  style.textContent=`
    .tx-long-audio{margin:16px 0 0;padding:14px;border:1px solid #dfe4ec;border-radius:13px;background:#f8fafc}
    .tx-long-audio h4{margin:0;font-size:12px;color:#1e293b}.tx-long-audio>p{margin:5px 0 12px}
    .tx-long-mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
    .tx-long-mode{display:flex;gap:9px;align-items:flex-start;padding:11px;border:1px solid #dfe4ec;border-radius:11px;background:white;cursor:pointer}
    .tx-long-mode:has(input:checked){border-color:#8b5cf6;box-shadow:0 0 0 2px rgba(139,92,246,.08)}
    .tx-long-mode input{margin-top:2px}.tx-long-mode strong{display:block;font-size:11px}.tx-long-mode span{display:block;margin-top:3px;font-size:9px;line-height:1.45;color:#667085}
    .tx-split-options{margin-top:11px;padding-top:11px;border-top:1px solid #e4e7ec}.tx-split-options[hidden]{display:none!important}
    .tx-split-row{display:grid;grid-template-columns:minmax(160px,.7fr) 1fr;gap:12px;align-items:end}
    .tx-split-quick{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.tx-split-quick button{padding:5px 8px;border-radius:999px;font-size:9px}
    .tx-smart-boundary{display:flex;gap:8px;align-items:flex-start;padding:9px 10px;border:1px solid #e4e7ec;border-radius:10px;background:white;font-size:10px;line-height:1.45}
    .tx-smart-boundary input{margin-top:2px}.tx-long-preview{margin-top:10px;padding:9px 10px;border-radius:9px;background:#f2f4f7;color:#475467;font-size:9px;line-height:1.5}
    .tx-long-progress{margin-top:7px}.tx-long-progress strong{font-size:10px}.tx-long-progress small{display:block;margin-top:3px;color:#667085}
    @media(max-width:720px){.tx-long-mode-grid,.tx-split-row{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const block=document.createElement('section');
  block.className='tx-long-audio';
  block.innerHTML=`
    <h4>Long audio handling</h4>
    <p class="small muted">Choose whether each selected file stays whole or becomes smaller transcription modules.</p>
    <div class="tx-long-mode-grid">
      <label class="tx-long-mode"><input type="radio" name="txLongAudioMode" value="keep" checked><span><strong>Keep as one audio</strong><span>One source file becomes one transcription module. Source uploads can be up to 250 MB.</span></span></label>
      <label class="tx-long-mode"><input type="radio" name="txLongAudioMode" value="split"><span><strong>Smart split into chunks</strong><span>Accepts a source file up to 250 MB locally, then uploads smaller speech-optimized chunks for easier transcription and AI drafting.</span></span></label>
    </div>
    <div id="txSplitOptions" class="tx-split-options" hidden>
      <div class="tx-split-row">
        <label>Target chunk length (minutes)<input id="txChunkMinutes" type="number" min="1" max="12" step="0.5" value="3"><div class="tx-split-quick"><button type="button" data-tx-min="1">1 min</button><button type="button" data-tx-min="2">2 min</button><button type="button" data-tx-min="3">3 min</button><button type="button" data-tx-min="5">5 min</button><button type="button" data-tx-min="10">10 min</button><button type="button" data-tx-min="12">12 min</button></div></label>
        <label class="tx-smart-boundary"><input id="txSmartBoundary" type="checkbox" checked><span><strong>Pause-aware boundary</strong><br>3 minutes is a target, not a hard cut. Adatacore searches around the boundary for a quiet pause so a sentence is less likely to be cut in the middle. If no useful pause exists, it falls back to the target boundary.</span></label>
      </div>
      <div class="small muted" style="margin-top:9px">The original long file is not uploaded in Smart Split mode. It is decoded locally in your browser and converted into 16 kHz mono WAV chunks. Each generated chunk stays below 50 MB for safer browser uploads and remains within the speech-processing design limits. Very large/high-resolution source files use more browser memory while splitting.</div>
    </div>
    <div id="txLongPreview" class="tx-long-preview">No audio selected yet.</div>`;

  const dropzone=filesInput.closest('.dropzone');
  dropzone?.insertAdjacentElement('beforebegin',block);
  document.querySelectorAll('.import-card p,.dropzone p').forEach(node=>{
    if(node.textContent.includes('Up to 50 MB per file'))node.textContent='Source audio can be up to 250 MB per file. For Groq first drafts, Smart Split is recommended because AI clips still have separate size and duration limits.';
  });

  const splitOptions=document.getElementById('txSplitOptions');
  const minutesInput=document.getElementById('txChunkMinutes');
  const smartInput=document.getElementById('txSmartBoundary');
  const preview=document.getElementById('txLongPreview');

  const mode=()=>document.querySelector('input[name="txLongAudioMode"]:checked')?.value||'keep';
  const targetMinutes=()=>Math.min(12,Math.max(1,Number(minutesInput.value)||3));
  const projectId=()=>Number(new URLSearchParams(location.search).get('project'))||null;
  const formatTime=seconds=>{seconds=Math.max(0,Math.round(seconds||0));const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`};
  const basename=name=>String(name||'Long audio').replace(/\.[^.]+$/,'').slice(0,150);

  function setBusy(on){
    processing=on;confirm.disabled=on;filesInput.disabled=on;folderInput.disabled=on;
    block.querySelectorAll('input,button').forEach(node=>node.disabled=on);
    if(on)confirm.textContent='Preparing long audio…';else updateModeUI();
  }

  function updateModeUI(){
    const split=mode()==='split';
    splitOptions.hidden=!split;
    confirm.textContent=split?'Smart split & add modules':'Upload and add modules';
    renderPreview();
  }

  function readDuration(file){
    return new Promise((resolve,reject)=>{
      const audio=new Audio(),url=URL.createObjectURL(file);
      let done=false;
      const finish=(fn,value)=>{if(done)return;done=true;clearTimeout(timer);audio.removeAttribute('src');try{audio.load()}catch(_){}URL.revokeObjectURL(url);fn(value)};
      const timer=setTimeout(()=>finish(reject,Error('Could not read audio duration.')),15000);
      audio.preload='metadata';
      audio.onloadedmetadata=()=>Number.isFinite(audio.duration)&&audio.duration>0?finish(resolve,audio.duration):finish(reject,Error('Could not read audio duration.'));
      audio.onerror=()=>finish(reject,Error('This browser cannot read this audio format.'));
      audio.src=url;
    });
  }

  async function renderPreview(){
    const token=++previewToken,files=[...filesInput.files];
    if(!files.length){preview.textContent='No audio selected yet.';return}
    if(mode()==='keep'){
      const oversized=files.filter(file=>file.size>MAX_KEEP_BYTES).length;
      preview.textContent=oversized?`${oversized} selected file${oversized===1?' is':'s are'} over the 250 MB keep-as-one limit.`:`${files.length} file${files.length===1?'':'s'} selected · each file will stay as one transcription module. Smart Split is recommended when you want smaller AI-friendly clips.`;
      return;
    }
    const tooLarge=files.filter(file=>file.size>MAX_SOURCE_BYTES).length;
    if(tooLarge){preview.textContent=`${tooLarge} file${tooLarge===1?' is':'s are'} over the 250 MB Smart Split source limit.`;return}
    preview.textContent='Checking durations and estimating chunks…';
    let total=0,known=0;
    for(const file of files.slice(0,20)){
      try{const seconds=await readDuration(file);if(token!==previewToken)return;known++;total+=Math.max(1,Math.ceil(seconds/(targetMinutes()*60)))}catch(_){}
    }
    if(token!==previewToken)return;
    preview.textContent=known?`${files.length} file${files.length===1?'':'s'} selected · approximately ${total}${files.length>known?'+':''} transcription modules at ${targetMinutes()} minute target${smartInput.checked?' · pause-aware boundaries on':''}. The original source stays in your browser.`:`${files.length} file${files.length===1?'':'s'} selected · chunk count will be calculated during processing.`;
  }

  function validateSource(file){
    if(!file.size||file.size>MAX_SOURCE_BYTES)throw Error('Smart Split source file must be between 1 byte and 250 MB.');
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    if(!['mp3','wav','m4a','webm','ogg','flac','aac','mp4'].includes(ext))throw Error('Use WAV, MP3, M4A, WebM, OGG, FLAC, AAC or MP4 audio.');
  }

  async function decodeFile(file){
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)throw Error('This browser does not support smart audio splitting.');
    const ctx=new AudioCtx();
    try{
      const bytes=await file.arrayBuffer();
      const buffer=await ctx.decodeAudioData(bytes.slice(0));
      if(!buffer?.duration||!Number.isFinite(buffer.duration))throw Error('Audio could not be decoded.');
      if(buffer.duration*1000>MAX_SOURCE_MS)throw Error('Audio must be under 4 hours.');
      return buffer;
    }catch(error){
      throw Error(error?.message?.includes('4 hours')?error.message:'Smart split could not decode this file. Try WAV/MP3, or choose “Keep as one audio”.');
    }finally{try{await ctx.close()}catch(_){}}
  }

  function frameEnergy(buffer,time,frameSeconds=.08){
    const sr=buffer.sampleRate,start=Math.max(0,Math.floor(time*sr)),length=Math.max(1,Math.floor(frameSeconds*sr));
    const step=Math.max(1,Math.floor(sr/3500));
    const channels=Math.min(2,buffer.numberOfChannels),arrays=[];
    for(let c=0;c<channels;c++)arrays.push(buffer.getChannelData(c));
    let sum=0,count=0;
    for(let i=start;i<Math.min(start+length,buffer.length);i+=step){
      let sample=0;for(let c=0;c<channels;c++)sample+=arrays[c][i]||0;sample/=channels;
      sum+=sample*sample;count++;
    }
    return count?Math.sqrt(sum/count):1;
  }

  function findPause(buffer,lo,hi,target){
    if(hi-lo<.5)return null;
    const frame=.08,rows=[];
    for(let t=lo;t<=hi;t+=frame)rows.push({time:t,energy:frameEnergy(buffer,t,frame)});
    if(!rows.length)return null;
    const sorted=rows.map(x=>x.energy).sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length*.5)]||0.001;
    const threshold=Math.max(.0025,median*.30);
    let best=null,start=-1;
    const consider=(from,to)=>{
      if(from<0||to<from)return;
      const run=rows.slice(from,to+1),duration=run.length*frame;if(duration<.16)return;
      const mid=run[Math.floor(run.length/2)].time,avg=run.reduce((s,x)=>s+x.energy,0)/run.length;
      const score=Math.abs(mid-target)/Math.max(1,hi-lo)-Math.min(1.2,duration)*.28+(avg/Math.max(median,.0001))*.05;
      if(!best||score<best.score)best={time:mid,score,kind:'pause',pauseSeconds:duration};
    };
    rows.forEach((row,i)=>{if(row.energy<=threshold){if(start<0)start=i}else if(start>=0){consider(start,i-1);start=-1}});if(start>=0)consider(start,rows.length-1);
    if(best)return best;
    let low=rows[0];for(const row of rows)if(row.energy<low.energy)low=row;
    if(low.energy<median*.52)return {time:low.time,score:1,kind:'low_energy',pauseSeconds:frame};
    return null;
  }

  function buildPlan(buffer,targetSeconds,pauseAware){
    const total=buffer.duration,chunks=[];
    let start=0,naturalCuts=0;
    while(total-start>.25){
      const remaining=total-start;
      if(remaining<=Math.min(MAX_CHUNK_SECONDS,targetSeconds*1.35)){
        chunks.push({start,end:total,natural:false});break;
      }
      const target=Math.min(start+targetSeconds,start+MAX_CHUNK_SECONDS);
      let end=target,natural=false;
      if(pauseAware){
        const windowSeconds=Math.min(20,Math.max(8,targetSeconds*.08));
        const earliest=Math.max(start+Math.max(20,targetSeconds*.55),target-windowSeconds);
        const latest=Math.min(total-3,start+MAX_CHUNK_SECONDS,target+windowSeconds);
        if(latest>earliest+.5){
          const pause=findPause(buffer,earliest,latest,target);
          if(pause){end=pause.time;natural=true;naturalCuts++}
        }
      }
      const tail=total-end;
      if(tail<Math.max(18,targetSeconds*.18)&&total-start<=Math.min(MAX_CHUNK_SECONDS,targetSeconds*1.35))end=total;
      if(end-start<10)end=Math.min(total,start+Math.min(targetSeconds,MAX_CHUNK_SECONDS));
      chunks.push({start,end,natural});start=end;
      if(chunks.length>500)throw Error('This file would create more than 500 chunks. Choose a longer target duration.');
    }
    return {chunks,naturalCuts};
  }

  function writeAscii(view,offset,text){for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i))}
  function encodeWavChunk(buffer,startSeconds,endSeconds){
    const outRate=Math.min(OUTPUT_RATE,buffer.sampleRate);
    const frames=Math.max(1,Math.floor((endSeconds-startSeconds)*outRate));
    const bytes=new ArrayBuffer(44+frames*2),view=new DataView(bytes);
    writeAscii(view,0,'RIFF');view.setUint32(4,36+frames*2,true);writeAscii(view,8,'WAVE');view.setUint32(12?16:16,16,true);writeAscii(view,12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,outRate,true);view.setUint32(28,outRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);writeAscii(view,36,'data');view.setUint32(40,frames*2,true);
    const pcm=new Int16Array(bytes,44,frames),srcRate=buffer.sampleRate,channels=Math.max(1,buffer.numberOfChannels),data=[];
    for(let c=0;c<channels;c++)data.push(buffer.getChannelData(c));
    const startFrame=Math.floor(startSeconds*srcRate),ratio=srcRate/outRate;
    for(let i=0;i<frames;i++){
      const idx=Math.min(buffer.length-1,startFrame+Math.floor(i*ratio));
      let sample=0;for(let c=0;c<channels;c++)sample+=data[c][idx]||0;sample/=channels;
      sample=Math.max(-1,Math.min(1,sample));pcm[i]=sample<0?Math.round(sample*32768):Math.round(sample*32767);
    }
    return new Blob([bytes],{type:'audio/wav'});
  }

  async function uploadSplitFile(file,pid){
    validateSource(file);
    const sourceSeconds=await readDuration(file);
    if(sourceSeconds*1000>MAX_SOURCE_MS)throw Error('Audio must be under 4 hours.');
    const line=document.createElement('div');line.className='file-result tx-long-progress';results.appendChild(line);
    line.innerHTML=`<strong>${file.name}</strong><small>Decoding audio locally for smart split…</small>`;
    const buffer=await decodeFile(file),targetSeconds=targetMinutes()*60,pauseAware=smartInput.checked;
    const plan=buildPlan(buffer,targetSeconds,pauseAware),group=crypto.randomUUID(),uploaded=[],payload=[];
    line.querySelector('small').textContent=`${plan.chunks.length} chunks planned · ${plan.naturalCuts} boundary${plan.naturalCuts===1?'':'ies'} moved to a natural pause.`;
    try{
      for(let i=0;i<plan.chunks.length;i++){
        const chunk=plan.chunks[i],part=i+1;
        line.querySelector('small').textContent=`Preparing part ${part} of ${plan.chunks.length} · ${formatTime(chunk.start)}–${formatTime(chunk.end)}${chunk.natural?' · natural pause':''}`;
        await new Promise(resolve=>setTimeout(resolve,0));
        const blob=encodeWavChunk(buffer,chunk.start,chunk.end);
        if(blob.size>MAX_CHUNK_BYTES)throw Error(`Part ${part} is too large after conversion. Choose a shorter chunk duration.`);
        const path=`${pid}/long/${group}/${String(part).padStart(3,'0')}.wav`;
        const {error}=await db.storage.from('transcription_audio').upload(path,blob,{contentType:'audio/wav',upsert:false});
        if(error)throw error;uploaded.push(path);
        payload.push({path,name:`${basename(file.name)} · Part ${String(part).padStart(2,'0')} of ${String(plan.chunks.length).padStart(2,'0')}`,duration_ms:Math.max(250,Math.round((chunk.end-chunk.start)*1000)),chunk_index:part,start_ms:Math.round(chunk.start*1000),end_ms:Math.round(chunk.end*1000)});
      }
      line.querySelector('small').textContent='Registering chunk modules in the transcription queue…';
      const {data,error}=await db.rpc('tx_register_split_upload_batch',{p_project_id:pid,p_upload_group_id:group,p_original_name:file.name,p_folder:folderInput.value||'Uploads',p_split_mode:pauseAware?'pause_aware':'fixed',p_chunks:payload});
      if(error)throw error;
      line.querySelector('small').textContent=`Ready · ${data?.registered||payload.length} modules · ${plan.naturalCuts} natural pause boundary${plan.naturalCuts===1?'':'ies'}.`;
      return payload.length;
    }catch(error){
      if(uploaded.length)await db.storage.from('transcription_audio').remove(uploaded).catch(()=>{});
      throw error;
    }
  }

  async function splitUpload(){
    const files=[...filesInput.files],pid=projectId();
    if(!pid)throw Error('Choose a transcription project first.');
    if(!files.length)throw Error('Choose audio files first.');
    if(files.length>20)throw Error('Smart split processes up to 20 long source files at a time.');
    results.textContent='';setBusy(true);
    let filesDone=0,modules=0,failed=0;
    try{
      for(const file of files){
        try{modules+=await uploadSplitFile(file,pid);filesDone++}
        catch(error){failed++;const line=document.createElement('div');line.className='file-result';line.style.color='#b33945';line.textContent=`${file.name} — ${error.message}`;results.appendChild(line)}
      }
      if(filesDone){
        const n=document.getElementById('notice');if(n){n.textContent=`${modules} transcription modules created from ${filesDone} long audio file${filesDone===1?'':'s'}${failed?`; ${failed} failed`:''}.`;n.className='notice '+(failed?'error':'success')}
        filesInput.value='';preview.textContent='No audio selected yet.';dialog.close();
        const active=document.querySelector('#projectList [data-project].active');if(active)active.click();else location.reload();
      }
    }finally{setBusy(false)}
  }

  confirm.onclick=function(event){
    if(mode()!=='split')return typeof originalUploadHandler==='function'?originalUploadHandler.call(this,event):undefined;
    event?.preventDefault?.();splitUpload().catch(error=>{const line=document.createElement('div');line.className='file-result';line.style.color='#b33945';line.textContent=error.message;results.appendChild(line);setBusy(false)});
  };

  block.addEventListener('change',event=>{if(event.target.name==='txLongAudioMode'||event.target===minutesInput||event.target===smartInput)updateModeUI()});
  block.addEventListener('click',event=>{const button=event.target.closest('[data-tx-min]');if(!button)return;minutesInput.value=button.dataset.txMin;updateModeUI()});
  filesInput.addEventListener('change',renderPreview);
  minutesInput.addEventListener('input',renderPreview);

  dialog.addEventListener('click',event=>{if(processing&&event.target.closest('[data-close]')){event.preventDefault();event.stopImmediatePropagation()}},true);
  window.addEventListener('beforeunload',event=>{if(processing){event.preventDefault();event.returnValue=''}});
  updateModeUI();
})();