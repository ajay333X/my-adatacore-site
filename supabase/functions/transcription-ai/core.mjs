export const MODEL = 'gpt-4o-transcribe-diarize';
export const MAX_BYTES = 24000000;
export const MAX_DURATION_MS = 900000;

export class DraftError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function providerError(status, code = '', type = '', message = '') {
  const detail = `${code} ${type} ${message}`.toLowerCase();
  if (status === 401) return new DraftError('PROVIDER_AUTH', 'The OpenAI API key is invalid or expired. Update the server secret.');
  if (status === 403) return new DraftError('PROVIDER_ACCESS', 'This API key does not have access to the transcription model. Check its permissions.');
  if (status === 429 && (detail.includes('insufficient_quota') || /\b(quota|billing|credits?)\b/.test(detail))) {
    return new DraftError('PROVIDER_QUOTA', 'OpenAI API billing or project quota is blocking transcription. Add API credit or raise the project billing/usage limit, then retry.');
  }
  if (status === 429) return new DraftError('PROVIDER_RATE_LIMIT', 'OpenAI is rate limiting transcription requests. Retry after the provider limit resets.');
  if (status === 400 || status === 413 || status === 422) return new DraftError('UNSUPPORTED_AUDIO', 'The provider could not process this audio. Try a shorter WAV or MP3 clip.');
  return new DraftError('PROVIDER_ERROR', 'The transcription provider is unavailable. Retry later; the previous request may have been charged.');
}

export async function boundedBytes(response, limit = MAX_BYTES) {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new DraftError('AUDIO_TOO_LARGE', 'AI drafting supports files up to 24 MB. Compress or split this audio first.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new DraftError('AUDIO_MISSING', 'The audio download was empty.');
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) { await reader.cancel(); throw new DraftError('AUDIO_TOO_LARGE', 'AI drafting supports files up to 24 MB. Compress or split this audio first.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!length) throw new DraftError('AUDIO_MISSING', 'The audio download was empty.');
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export function normalizeDraft(response, knownDuration = 0, uuid = () => crypto.randomUUID()) {
  if (!Array.isArray(response.segments) || response.segments.length > 3000) throw new DraftError('INVALID_DRAFT', 'The AI result did not contain usable segments.');
  const speakerMap = new Map();
  const speakers = [];
  const segments = [];
  for (const row of response.segments) {
    if (typeof row.text !== 'string' || !row.text.trim()) continue;
    if (row.text.length > 20000 || !Number.isFinite(row.start) || !Number.isFinite(row.end) || row.start < 0 || row.end <= row.start) throw new DraftError('INVALID_DRAFT', 'The AI returned invalid segment timing or text.');
    const label = String(row.speaker ?? 'unknown');
    if (!speakerMap.has(label)) {
      if (speakers.length >= 12) throw new DraftError('TOO_MANY_SPEAKERS', 'The AI detected more than 12 speakers. Split this recording into smaller clips.');
      const id = 'speaker-' + (speakers.length + 1);
      speakerMap.set(label, id);
      // Speaker diarization does not establish physical channel identity.
      speakers.push({id, label: 'Speaker ' + (speakers.length + 1), channel: 0});
    }
    const start_ms = Math.round(row.start * 1000), end_ms = Math.round(row.end * 1000);
    if (end_ms <= start_ms) throw new DraftError('INVALID_DRAFT', 'The AI returned a zero-length segment.');
    segments.push({id: uuid(), speaker_id: speakerMap.get(label), start_ms, end_ms, transcript: row.text.trim()});
  }
  if (!segments.length) throw new DraftError('NO_SPEECH', 'No speech was detected. Listen to the recording and transcribe manually if needed.');
  const lastEnd = Math.max(...segments.map(s => s.end_ms));
  const providerDuration = Number.isFinite(response.duration) && response.duration > 0 ? Math.round(response.duration * 1000) : 0;
  const duration_ms = Math.max(providerDuration || knownDuration || lastEnd, lastEnd);
  if (duration_ms > MAX_DURATION_MS) throw new DraftError('AUDIO_TOO_LONG', 'AI drafting supports clips up to 15 minutes. Split this recording first.');
  segments.sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms);
  return {segments, speakers, duration_ms};
}

export function audioFormat(path) {
  const ext = path.split('.').pop().toLowerCase();
  const types = {mp3:'audio/mpeg', mp4:'audio/mp4', mpeg:'audio/mpeg', mpga:'audio/mpeg', m4a:'audio/mp4', wav:'audio/wav', webm:'audio/webm', ogg:'audio/ogg', flac:'audio/flac'};
  if (!types[ext]) throw new DraftError('UNSUPPORTED_AUDIO', 'Convert this recording to WAV, MP3, M4A, WebM, OGG or FLAC first.');
  return {name: 'audio.' + ext, type: types[ext]};
}
