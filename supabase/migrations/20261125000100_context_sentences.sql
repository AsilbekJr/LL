-- Gap orqali yodlash: every new word gets 5 sentences in different everyday
-- situations ({situation, en, uz, form}). Reviews ask for one of them (a
-- different one each time): first as a cloze, later as a full translation.
alter table public.items
  add column if not exists context_sentences jsonb not null default '[]'::jsonb;

alter table public.items drop constraint if exists items_context_sentences_check;
alter table public.items
  add constraint items_context_sentences_check check (
    jsonb_typeof(context_sentences) = 'array'
    and jsonb_array_length(context_sentences) <= 8
    and pg_column_size(context_sentences) <= 16000
  );

-- New review method: translating a context sentence (UZ -> EN).
alter table public.review_logs drop constraint if exists review_logs_method_check;
alter table public.review_logs
  add constraint review_logs_method_check check (method in (
    'encounter', 'recognition', 'recall', 'spelling', 'listening',
    'cloze', 'word_order', 'writing', 'speaking', 'shadowing', 'drill', 'sentence'));
