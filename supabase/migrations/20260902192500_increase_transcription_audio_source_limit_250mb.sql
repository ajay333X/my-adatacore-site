-- Raise only the source upload ceiling. Smart Split generated chunks remain speech-optimized and bounded separately.
update storage.buckets
set file_size_limit=262144000
where id='transcription_audio';
