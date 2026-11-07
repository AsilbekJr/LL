-- Shared cache of generated speech (MP3). Public read so the CDN serves it;
-- signed-in users may add new files (via /api/tts) but never change or
-- delete existing ones. Paths are SHA-256 hashes of the phrase.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tts', 'tts', true, 1048576, array['audio/mpeg'])
on conflict (id) do nothing;

create policy tts_insert_authenticated on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tts' and name ~ '^v1/[a-z]+/[0-9a-f]{64}\.mp3$');
