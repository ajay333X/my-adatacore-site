# Audio Dataset Studio (Admin)
Internal, super-admin-only Indian language speech dataset intake and annotation tool.

## Access
Adatacore Admin → **Audio Dataset Studio**, or `/admin/audio-dataset-studio`.

## Current workflow
1. Paste up to 60 Wikimedia Commons, Internet Archive, or YouTube reference URLs.
2. Supported Commons / Internet Archive sources are inspected through their official public metadata APIs. Source creator, licensing, and the original URL are retained.
3. Before downloading a source, the admin reviews the license and explicitly confirms the intended reuse rights. Only eligible CC BY, CC BY-SA, CC0 and public-domain-style sources have automatic download enabled. Non-commercial / no-derivatives and unverified terms are blocked for automatic download.
4. Direct YouTube downloading and arbitrary-host downloading are deliberately **not** implemented. Such URLs remain as reference records; upload a locally held audio file only where an authorized copy is available.
5. Open the Clip Editor, select 15–120 seconds (default 60), preview, and generate a mono 16 kHz PCM WAV clip locally. The original stays unchanged. Suggested ranges are based on audio energy; they do **not** identify conversations or speakers with AI.
6. Use **Generate AI draft** on any saved clip (Supabase Edge Function `dataset-studio`; requires existing `GROQ_API_KEY` secret). Correct the transcript and listen before marking human verified.
7. Download individual WAV clips and an attributed JSON / CSV **manifest**. The manifest is not an audio ZIP archive. Clip paths remain in a private bucket, and no customer-facing public publishing is performed automatically.

## Isolation & security
- Tables: `dataset_studio_sources`, `dataset_studio_clips`; storage bucket: `adatacore-dataset-studio` (private).
- Public tables and storage objects use super-admin-only RLS; browser includes only the public Supabase key.
- The Edge Function checks a live authenticated user, active account, and `super_admin` staff role on every request.
- Backend URL fetching is restricted to approved source domains, HTTPS and 25MB; redirects are host-checked and source licensing must be eligible.
- Existing contributor queues, client deliveries and transcription projects are unchanged.

## Known limitations (v1)
- A conversational segment is not guaranteed by energy-based selection. Listen before saving.
- Audio decoding depends on browser support (MP3/WAV is most reliable).
- Large source files are not supported; the source download limit is 25 MB.
- YouTube has no automatic extraction. Use a permitted file upload when you hold authorization.
- AI drafts are not verified ground truth. Provider configuration and quota can prevent transcription.
- Batch imports run sequential inspection requests in the active browser tab.
- No dataset ZIP with binary audio or customer-facing publication until a separate review/release step.

## Verification
- HTML and JS files were checked for essential elements and JavaScript syntax.
- Database tables are RLS-enabled, bucket is private, Supabase security advisor reported no dataset-studio-specific issues.
- The Edge Function was deployed and reported ACTIVE; feature branch Vercel preview built READY.
- A fully authenticated end-to-end browser run with user-selected licensed media is still required before calling it production-proven.
