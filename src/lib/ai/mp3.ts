import { Mp3Encoder } from "@breezystack/lamejs";

/** Read mono 16-bit PCM WAV (RIFF) → samples + sample rate. */
export function parseWav(buf: Uint8Array): { samples: Int16Array; sampleRate: number } {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number) => String.fromCharCode(buf[o]!, buf[o + 1]!, buf[o + 2]!, buf[o + 3]!);
  if (buf.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a WAV file");
  let sampleRate = 24000;
  let channels = 1;
  let bits = 16;
  let o = 12;
  while (o + 8 <= buf.length) {
    const id = tag(o);
    const size = view.getUint32(o + 4, true);
    const body = o + 8;
    if (id === "fmt ") {
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === "data") {
      if (bits !== 16) throw new Error(`unsupported WAV: ${bits}-bit`);
      const end = Math.min(buf.length, body + size);
      const frames = Math.floor((end - body) / 2 / channels);
      const samples = new Int16Array(frames);
      for (let i = 0; i < frames; i++) samples[i] = view.getInt16(body + i * 2 * channels, true); // first channel
      return { samples, sampleRate };
    }
    o = body + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

/** WAV → MP3 (mono, 48 kbps): ~10x smaller for phones on mobile data. */
export function wavToMp3(wav: Uint8Array, kbps = 48): Uint8Array {
  const { samples, sampleRate } = parseWav(wav);
  const enc = new Mp3Encoder(1, sampleRate, kbps);
  const chunks: Uint8Array[] = [];
  const BLOCK = 1152;
  for (let i = 0; i < samples.length; i += BLOCK) {
    const out = enc.encodeBuffer(samples.subarray(i, i + BLOCK));
    if (out.length) chunks.push(out);
  }
  const tail = enc.flush();
  if (tail.length) chunks.push(tail);
  const mp3 = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of chunks) {
    mp3.set(c, p);
    p += c.length;
  }
  return mp3;
}
