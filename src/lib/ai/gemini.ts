import "server-only";

/**
 * Minimal Gemini API client (REST generateContent, JSON output). No SDK:
 * one request shape is all we need, and it keeps the server bundle small.
 */

export class GeminiError extends Error {
  constructor(
    readonly kind: "rate_limited" | "misconfigured" | "refused" | "truncated" | "upstream",
    message: string,
  ) {
    super(message);
  }
}

/** Gemini's schema dialect is a JSON Schema subset; drop keywords it may reject. */
function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (schema && typeof schema === "object") {
    return Object.fromEntries(
      Object.entries(schema)
        .filter(([k]) => k !== "additionalProperties")
        .map(([k, v]) => [k, toGeminiSchema(v)]),
    );
  }
  return schema;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

export async function geminiJson(opts: {
  model: string;
  system: string;
  user: string;
  schema: unknown;
  signal?: AbortSignal;
  maxOutputTokens?: number;
}): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new GeminiError("misconfigured", "GEMINI_API_KEY is not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: opts.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: opts.user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: toGeminiSchema(opts.schema),
          maxOutputTokens: opts.maxOutputTokens ?? 2048,
          // Short, well-specified task: minimal thinking keeps it fast (Flash-Lite supports MINIMAL).
          ...(opts.model.includes("flash-lite") ? { thinkingConfig: { thinkingLevel: "MINIMAL" } } : {}),
        },
      }),
    },
  );

  if (res.status === 429) throw new GeminiError("rate_limited", "Gemini rate limit");
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    const body = await res.text().catch(() => "");
    // A bad key and an invalid request both come back here; log the reason, never the key.
    throw new GeminiError("misconfigured", `Gemini ${res.status}: ${body.slice(0, 300)}`);
  }
  if (!res.ok) throw new GeminiError("upstream", `Gemini HTTP ${res.status}`);

  const data = (await res.json()) as GeminiResponse;
  if (data.promptFeedback?.blockReason) throw new GeminiError("refused", data.promptFeedback.blockReason);
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") throw new GeminiError("truncated", "max tokens");
  if (
    candidate?.finishReason &&
    ["SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST"].includes(candidate.finishReason)
  ) {
    throw new GeminiError("refused", candidate.finishReason);
  }
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  if (!text.trim()) throw new GeminiError("upstream", "empty response");
  return text;
}

/** Text-to-speech: returns WAV bytes (24 kHz mono 16-bit) from a Gemini TTS model. */
export async function geminiSpeech(opts: {
  model: string;
  text: string;
  voice: string;
  signal?: AbortSignal;
}): Promise<{ audio: Buffer; mimeType: string }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new GeminiError("misconfigured", "GEMINI_API_KEY is not set");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: opts.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: opts.text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice } } },
        },
      }),
    },
  );
  if (res.status === 429) throw new GeminiError("rate_limited", "Gemini TTS rate limit");
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    const body = await res.text().catch(() => "");
    throw new GeminiError("misconfigured", `Gemini TTS ${res.status}: ${body.slice(0, 300)}`);
  }
  if (!res.ok) throw new GeminiError("upstream", `Gemini TTS HTTP ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
  };
  const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!inline?.data) throw new GeminiError("upstream", "no audio in response");
  return { audio: Buffer.from(inline.data, "base64"), mimeType: inline.mimeType || "audio/wav" };
}
