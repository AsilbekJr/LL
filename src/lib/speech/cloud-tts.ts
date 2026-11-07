import { normalizeSpeechText, ttsObjectPath, ttsPublicUrl } from "./tts-key";

/**
 * Server speech for devices whose own speech engine fails. Lookup order:
 * memory -> Cache Storage (this device) -> shared CDN copy (Supabase Storage)
 * -> generate via /api/tts (Gemini TTS, stored for everyone). Only the newest
 * request plays, and identical requests share one download.
 */

const CACHE = "ll-tts-v2";
const memory = new Map<string, string>(); // text -> object URL
const inflight = new Map<string, Promise<string>>();
let current: HTMLAudioElement | null = null;
let playId = 0;

const cacheKey = (text: string) => new Request(`/__tts-cache/${encodeURIComponent(text)}`);

export class CloudSpeechError extends Error {}

async function download(text: string): Promise<Blob> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (base) {
    try {
      const cdn = await fetch(ttsPublicUrl(base, await ttsObjectPath(text)));
      if (cdn.ok && cdn.headers.get("Content-Type")?.startsWith("audio/")) return await cdn.blob();
    } catch {
      // offline or blocked: try generating
    }
  }
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new CloudSpeechError(`cloud-${res.status}`);
  return res.blob();
}

function audioUrl(raw: string): Promise<string> {
  const text = normalizeSpeechText(raw);
  const hit = memory.get(text);
  if (hit) return Promise.resolve(hit);
  let p = inflight.get(text);
  if (!p) {
    p = (async () => {
      const store = typeof caches !== "undefined" ? await caches.open(CACHE).catch(() => null) : null;
      const cached = await store?.match(cacheKey(text)).catch(() => undefined);
      let blob = cached ? await cached.blob() : null;
      if (!blob) {
        blob = await download(text);
        void store
          ?.put(
            cacheKey(text),
            new Response(blob, { headers: { "Content-Type": blob.type || "audio/mpeg" } }),
          )
          .catch(() => undefined);
      }
      const url = URL.createObjectURL(blob);
      memory.set(text, url);
      return url;
    })().finally(() => inflight.delete(text));
    inflight.set(text, p);
  }
  return p;
}

export async function speakCloud(
  text: string,
  rate = 1,
): Promise<{ ok: true } | { ok: false; error: string }> {
  stopCloud();
  const id = ++playId;
  try {
    const url = await audioUrl(text);
    // A newer tap (or a stop) happened while downloading: stay silent.
    if (id !== playId) return { ok: true };
    const audio = new Audio(url);
    audio.playbackRate = Math.min(2, Math.max(0.5, rate));
    current = audio;
    return await new Promise((resolve) => {
      const done = (r: { ok: true } | { ok: false; error: string }) => {
        if (current === audio) current = null;
        resolve(r);
      };
      audio.onended = () => done({ ok: true });
      audio.onpause = () => done({ ok: true });
      audio.onerror = () => done({ ok: false, error: "cloud-audio" });
      audio
        .play()
        .catch((e: unknown) => done({ ok: false, error: e instanceof Error ? e.name : "cloud-play" }));
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "cloud" };
  }
}

/** Download upcoming phrases in the background (one at a time) so taps play instantly. */
export async function prefetchCloud(texts: string[]): Promise<void> {
  for (const t of texts) {
    if (!t.trim()) continue;
    try {
      await audioUrl(t);
    } catch {
      return; // rate limited / offline: stop prefetching
    }
  }
}

export function stopCloud(): void {
  playId++;
  if (current) {
    const a = current;
    current = null;
    a.pause();
  }
}

// ---- which engine this device should use -----------------------------------

const KEY = "ll.tts.engine";
const RETRY_LOCAL_MS = 7 * 24 * 3600_000;

/** True when this device's own engine failed recently (re-checked weekly). */
export function preferCloud(): boolean {
  try {
    const v = window.localStorage.getItem(KEY);
    return v !== null && Date.now() - Number(v) < RETRY_LOCAL_MS;
  } catch {
    return false;
  }
}

export function markLocalBroken(): void {
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // private mode: just use the cloud this time
  }
}

/** Forget that the device engine failed (e.g. after installing Google speech). */
export function resetEngineChoice(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
