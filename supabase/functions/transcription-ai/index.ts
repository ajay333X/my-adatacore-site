import { MODEL, MAX_DURATION_MS, DraftError, providerError, boundedBytes, normalizeDraft, audioFormat } from './core.mjs';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default;
const headers = {apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json'};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function rpc(name: string, args: unknown) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {method:'POST', headers, body:JSON.stringify(args), signal:AbortSignal.timeout(10000)});
  if (!res.ok) throw new Error('Database operation failed');
  return await res.json();
}

async function processJob(job: any, token: string) {
  const args = {p_job:job.id, p_token:token};
  try {
    const key = Deno.env.get('GROQ_API_KEY')?.trim();
    if (!key) throw new DraftError('NOT_CONFIGURED', 'Add GROQ_API_KEY in Supabase Edge Function secrets.');
    const providerHeaders = {Authorization:`Bearer ${key}`};
    if (job.kind === 'check') {
      const check = await fetch(`https://api.groq.com/openai/v1/models/${MODEL}`, {headers:providerHeaders, signal:AbortSignal.timeout(15000)});
      if (!check.ok) {
        const error = await check.json().catch(() => ({}));
        throw providerError(check.status, error.error?.code, error.error?.type, error.error?.message);
      }
      await check.body?.cancel();
      await rpc('tx_ai_finish', {...args, p_result:{connection:'groq_whisper_access_verified'}});
      return;
    }
    if (!['recordings','conversation_records','transcription_audio'].includes(job.bucket) || typeof job.path !== 'string') throw new DraftError('AUDIO_MISSING', 'The audio source is unavailable.');
    if (job.duration_ms > MAX_DURATION_MS) throw new DraftError('AUDIO_TOO_LONG', 'AI drafting supports clips up to 15 minutes. Split this audio first.');
    const format = audioFormat(job.path);
    const path = job.path.split('/').map(encodeURIComponent).join('/');
    const download = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/${job.bucket}/${path}`, {headers, signal:AbortSignal.timeout(20000)});
    if (!download.ok) throw new DraftError('AUDIO_MISSING', 'The stored audio could not be downloaded. Check the source file.');
    const bytes = await boundedBytes(download);
    const form = new FormData();
    form.append('file', new Blob([bytes], {type:format.type}), format.name);
    form.append('model', MODEL);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    form.append('temperature', '0');
    if (job.language) form.append('language', job.language);
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {method:'POST', headers:providerHeaders, body:form, signal:AbortSignal.timeout(95000)});
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw providerError(response.status, error.error?.code, error.error?.type, error.error?.message);
    }
    const result = normalizeDraft(await response.json(), job.duration_ms);
    await rpc('tx_ai_finish', {...args, p_result:result});
  } catch (error) {
    const safe = error instanceof DraftError ? error : new DraftError('PROCESSING_FAILED', 'Processing stopped or timed out. Retry the draft manually.');
    try { await rpc('tx_ai_finish', {...args, p_error_code:safe.code, p_error_message:safe.message}); }
    catch { console.error('AI job result could not be persisted; dispatcher will expire the lease.'); }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return Response.json({error:'Method not allowed'}, {status:405});
  try {
    const bytes = await boundedBytes(req, 1024);
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!uuidPattern.test(body.job_id || '') || !uuidPattern.test(body.token || '')) return Response.json({error:'Unauthorized'}, {status:401});
    const job = await rpc('tx_ai_claim', {p_job:body.job_id, p_token:body.token});
    if (!job) return Response.json({error:'Unauthorized or expired job'}, {status:401});
    EdgeRuntime.waitUntil(processJob(job, body.token));
    return Response.json({accepted:true}, {status:202});
  } catch { return Response.json({error:'Invalid request or unavailable worker'}, {status:400}); }
});
