(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TranscriptionModel=factory()})(typeof window==='undefined'?this:window,function(){
 'use strict';
 const colors=['#318feb','#9965f4','#2b9d8b','#d58c29','#d56d99','#607bce'];
 function time(ms,precision=true){ms=Math.max(0,Math.round(Number(ms)||0));return String(Math.floor(ms/60000)).padStart(2,'0')+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+(precision?'.'+String(ms%1000).padStart(3,'0'):'')}
 function parseTime(value){const x=String(value).trim();if(/^\d+(\.\d{1,3})?$/.test(x))return Math.round(Number(x)*1000);const m=x.match(/^(\d+):([0-5]?\d)(?:\.(\d{1,3}))?$/);return m?Number(m[1])*60000+Number(m[2])*1000+Number((m[3]||'').padEnd(3,'0')):NaN}
 function lint(segments,duration,speakers){
  const ids=new Set(speakers.map(s=>s.id)),ordered=[...segments].sort((a,b)=>a.start_ms-b.start_ms||a.end_ms-b.end_ms),previousBySpeaker=new Map();
  return segments.map(s=>{
   const errors=[],warnings=[],text=String(s.transcript||''),trimmed=text.trim(),span=Number(s.end_ms)-Number(s.start_ms);
   if(!ids.has(s.speaker_id))errors.push('Choose a speaker');
   if(!Number.isInteger(s.start_ms)||!Number.isInteger(s.end_ms)||s.start_ms<0||s.end_ms<=s.start_ms)errors.push('End must be after start');
   if(duration&&s.end_ms>duration)errors.push('Ends after audio');
   if(!trimmed)errors.push('Transcript is empty');
   if(segments.some(t=>t.id!==s.id&&t.speaker_id===s.speaker_id&&t.start_ms<s.end_ms&&s.start_ms<t.end_ms))errors.push('Overlaps the same speaker');
   if(segments.some(t=>t.id!==s.id&&t.start_ms===s.start_ms&&t.end_ms===s.end_ms&&String(t.transcript||'').trim()===trimmed))errors.push('Duplicate segment');
   if(span>30000)warnings.push('Long segment: check for pauses');
   if(span>0&&span<120)warnings.push('Very short segment: verify timing');
   if(/\s{2,}/.test(text))warnings.push('Repeated spaces');
   if(text!==trimmed&&trimmed)warnings.push('Leading or trailing spaces');
   if(/[\t\r]/.test(text))warnings.push('Unexpected tab or carriage return');
   if(span>0&&trimmed.length/(span/1000)>32)warnings.push('Dense text for segment duration');
   const prev=[...ordered].filter(t=>t.id!==s.id&&t.speaker_id===s.speaker_id&&t.end_ms<=s.start_ms).sort((a,b)=>b.end_ms-a.end_ms)[0];
   if(prev){const gap=s.start_ms-prev.end_ms;if(gap>1000&&gap<15000)warnings.push(`Gap over 1s from previous ${time(gap,false)}`)}
   return {id:s.id,errors,warnings};
  })
 }
 function split(segments,id,at,newId,textOffset){const out=structuredClone(segments),i=out.findIndex(s=>s.id===id),s=out[i];if(!s||at<=s.start_ms||at>=s.end_ms)throw Error('Move the playhead inside the selected segment.');const offset=Number.isInteger(textOffset)?textOffset:Math.round(s.transcript.length*(at-s.start_ms)/(s.end_ms-s.start_ms));let cut=offset;if(!Number.isInteger(textOffset)){const left=s.transcript.lastIndexOf(' ',offset),right=s.transcript.indexOf(' ',offset);cut=left<0?(right<0?offset:right):right<0?left:offset-left<right-offset?left:right;}const second={...s,id:newId,start_ms:at,transcript:s.transcript.slice(cut).trimStart()};s.end_ms=at;s.transcript=s.transcript.slice(0,cut).trimEnd();out.splice(i+1,0,second);return out}
 function merge(segments,id){const out=structuredClone(segments),i=out.findIndex(s=>s.id===id),s=out[i];if(!s)throw Error('Select a segment.');const next=out.filter(t=>t.speaker_id===s.speaker_id&&t.start_ms>=s.end_ms&&t.id!==s.id).sort((a,b)=>a.start_ms-b.start_ms)[0];if(!next)throw Error('There is no following segment for this speaker.');s.end_ms=next.end_ms;s.transcript=[s.transcript,next.transcript].filter(Boolean).join(' ');return out.filter(t=>t.id!==next.id)}
 function subtitleTime(ms,vtt){const h=Math.floor(ms/3600000);return String(h).padStart(2,'0')+':'+time(ms%3600000).replace('.',vtt?'.':',')}
 function subtitles(segments,speakers,vtt=false){const names=new Map(speakers.map(s=>[s.id,s.label]));return(vtt?'WEBVTT\n\n':'')+[...segments].sort((a,b)=>a.start_ms-b.start_ms).map((s,i)=>`${i+1}\n${subtitleTime(s.start_ms,vtt)} --> ${subtitleTime(s.end_ms,vtt)}\n${names.get(s.speaker_id)||'Speaker'}: ${s.transcript.replace(/\r?\n/g,' ')}\n`).join('\n')}
 return{colors,time,parseTime,lint,split,merge,subtitles};
});
