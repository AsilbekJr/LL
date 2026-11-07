/**
 * Shared (client + server) naming of cached speech audio in Supabase Storage:
 * bucket "tts", path v1/<voice>/<sha256 of the normalised text>.mp3.
 * The same phrase is generated once and then served from the CDN to everyone.
 */
export const TTS_BUCKET = "tts";
export const TTS_VOICE = "Kore";
const VERSION = "v1";

export function normalizeSpeechText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export async function ttsObjectPath(text: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeSpeechText(text));
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${VERSION}/${TTS_VOICE.toLowerCase()}/${hex}.mp3`;
}

export function ttsPublicUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${TTS_BUCKET}/${path}`;
}
