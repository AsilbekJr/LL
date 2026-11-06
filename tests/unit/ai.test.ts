import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { aiFeedbackEnabled, aiModel, aiProvider } = await import("@/lib/ai/config");
const { GeminiError, geminiJson } = await import("@/lib/ai/gemini");
const { AI_FEEDBACK_JSON_SCHEMA } = await import("@/lib/production/feedback");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ai config", () => {
  it("prefers Gemini when its key is set", () => {
    vi.stubEnv("GEMINI_API_KEY", "g");
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    vi.stubEnv("AI_PROVIDER", "");
    expect(aiProvider()).toBe("gemini");
    expect(aiModel("gemini")).toBe("gemini-3.5-flash-lite");
  });

  it("honours AI_PROVIDER and needs that provider's key", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    vi.stubEnv("AI_PROVIDER", "gemini");
    expect(aiProvider()).toBeNull();
    vi.stubEnv("AI_PROVIDER", "anthropic");
    expect(aiProvider()).toBe("anthropic");
  });

  it("is off unless explicitly enabled", () => {
    vi.stubEnv("GEMINI_API_KEY", "g");
    vi.stubEnv("AI_FEEDBACK_ENABLED", "false");
    expect(aiFeedbackEnabled()).toBe(false);
    vi.stubEnv("AI_FEEDBACK_ENABLED", "true");
    expect(aiFeedbackEnabled()).toBe(true);
  });
});

describe("geminiJson", () => {
  const call = () =>
    geminiJson({
      model: "gemini-3.5-flash-lite",
      system: "sys",
      user: "hi",
      schema: AI_FEEDBACK_JSON_SCHEMA,
    });

  it("sends the key in a header, JSON schema without additionalProperties, minimal thinking", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret");
    const fetchMock = vi.fn(async () =>
      Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":1}' }] }, finishReason: "STOP" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(call()).resolves.toBe('{"ok":1}');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    );
    expect(url).not.toContain("secret");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret");
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe("sys");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(JSON.stringify(body.generationConfig.responseJsonSchema)).not.toContain("additionalProperties");
    expect(body.generationConfig.responseJsonSchema.required).toContain("word_used_correctly");
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "MINIMAL" });
  });

  it("maps failures", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 429 })),
    );
    await expect(call()).rejects.toMatchObject({ kind: "rate_limited" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad key", { status: 403 })),
    );
    await expect(call()).rejects.toMatchObject({ kind: "misconfigured" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] })),
    );
    await expect(call()).rejects.toBeInstanceOf(GeminiError);
  });

  it("fails fast without a key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(call()).rejects.toMatchObject({ kind: "misconfigured" });
  });
});
