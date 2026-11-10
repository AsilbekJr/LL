/**
 * Text shared into the app ("Ulashish → LL" on the phone) → the word or
 * phrase to add. Browsers share a selection as `text`, often with the page
 * address appended or in `url`, and the page title in `title`.
 */
const URL_RE = /https?:\/\/\S+/gi;
const QUOTES = /^["'“”‘’«»„\s]+|["'“”‘’«»„\s]+$/g;
const MAX_LENGTH = 500;
/** Up to this many words it is a word or phrase, so closing punctuation is noise. */
const PHRASE_WORDS = 4;

function clean(raw: string | null | undefined): string {
  let s = (raw ?? "").replace(URL_RE, " ").replace(/\s+/g, " ").trim();
  s = s.replace(QUOTES, "");
  if (s.split(" ").length <= PHRASE_WORDS) s = s.replace(/[.,;:!?…]+$/, "").replace(QUOTES, "");
  return s.slice(0, MAX_LENGTH).trim();
}

/** The selection wins; the title is only a fallback (a shared page without a selection). */
export function sharedWord(params: { text?: string | null; title?: string | null }): string {
  return clean(params.text) || clean(params.title);
}
