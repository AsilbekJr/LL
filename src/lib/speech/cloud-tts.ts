/**
 * Server speech (Gemini TTS via /api/tts) for devices whose own speech engine
 * fails. Audio is cached in memory and in the Cache Storage, so each phrase
 * is generated once per device.
 */

const CACHE = "ll-tts-v1";
const memory = new Map<string, string>(); // text -> object URL
let current: HTMLAudioElement | null = null;

const cacheKey = (text: string) => new Request(`/__tts-cache/${encodeURIComponent(text)}`);

async function audioUrl(text: string): Promise<string> {
  const hit = memory.get(text);
  if (hit) return hit;
  let blob: Blob | null = null;
  const store = typeof caches !== "undefined" ? await caches.open(CACHE).catch(() => null) : null;
  const cached = await store?.match(cacheKey(text)).catch(() => undefined);
  if (cached) blob = await cached.blob();
  if (!blob) {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`cloud-${res.status}`);
    blob = await res.blob();
    void store
      ?.put(cacheKey(text), new Response(blob, { headers: { "Content-Type": blob.type } }))
      .catch(() => undefined);
  }
  const url = URL.createObjectURL(blob);
  memory.set(text, url);
  return url;
}

export async function speakCloud(
  text: string,
  rate = 1,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const url = await audioUrl(text.trim());
    stopCloud();
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

export function stopCloud(): void {
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
