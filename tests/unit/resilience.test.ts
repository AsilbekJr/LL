import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const persistAnswer = vi.fn();
vi.mock("@/lib/session/api", () => ({ persistAnswer: (...a: unknown[]) => persistAnswer(...a) }));

const { DbWriteError, isPermanentWriteError } = await import("@/lib/supabase/write-error");
const { enqueue, flushOutbox, pendingCount } = await import("@/lib/offline/outbox");
const { isStaleBuildError } = await import("@/lib/app/stale-build");
const { aiModels } = await import("@/lib/ai/config");
const { GeminiError, geminiJsonFallback } = await import("@/lib/ai/gemini");

/* eslint-disable @typescript-eslint/no-explicit-any -- minimal fake payloads */
const answer = (id: string) => ({ clientId: id, outcome: { card: { id } } }) as any;
const sb = {} as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("write errors", () => {
  it("treats integrity and data errors as permanent", () => {
    expect(isPermanentWriteError(new DbWriteError({ message: "fk", code: "23503" }))).toBe(true);
    expect(isPermanentWriteError(new DbWriteError({ message: "bad uuid", code: "22P02" }))).toBe(true);
  });

  it("keeps network, auth and server errors retryable", () => {
    expect(isPermanentWriteError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isPermanentWriteError(new DbWriteError({ message: "JWT expired", code: "PGRST301" }))).toBe(false);
    expect(isPermanentWriteError(new DbWriteError({ message: "rls", code: "42501" }))).toBe(false);
    expect(isPermanentWriteError(new DbWriteError({ message: "x" }))).toBe(false);
  });
});

describe("outbox never gets stuck", () => {
  beforeEach(async () => {
    persistAnswer.mockReset();
    persistAnswer.mockResolvedValue(undefined);
    await flushOutbox(sb); // drain anything left by a previous test
    persistAnswer.mockReset();
  });

  it("skips an answer the database rejects for good and sends the rest", async () => {
    await enqueue(answer("deleted-card"));
    await enqueue(answer("ok-card"));
    persistAnswer.mockImplementation(async (_sb, w: { clientId: string }) => {
      if (w.clientId === "deleted-card") throw new DbWriteError({ message: "fk", code: "23503" });
    });
    expect(await flushOutbox(sb)).toBe(true);
    expect(persistAnswer).toHaveBeenCalledTimes(2);
    expect(await pendingCount()).toBe(0);
  });

  it("keeps answers queued on a temporary failure", async () => {
    await enqueue(answer("a"));
    persistAnswer.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await flushOutbox(sb)).toBe(false);
    expect(await pendingCount()).toBe(1);
    persistAnswer.mockResolvedValue(undefined);
    expect(await flushOutbox(sb)).toBe(true);
    expect(await pendingCount()).toBe(0);
  });
});

describe("stale build detection", () => {
  it("recognises missing chunks after a deploy", () => {
    const chunk = new Error("Loading chunk 123 failed.");
    chunk.name = "ChunkLoadError";
    expect(isStaleBuildError(chunk)).toBe(true);
    expect(isStaleBuildError(new TypeError("Failed to fetch dynamically imported module: /x.js"))).toBe(true);
    expect(isStaleBuildError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleBuildError("ChunkLoadError")).toBe(false);
  });
});

describe("AI model fallback", () => {
  it("has -latest aliases after the pinned model, and AI_MODEL replaces the list", () => {
    vi.stubEnv("AI_MODEL", "");
    const list = aiModels("gemini");
    expect(list[0]).toBe("gemini-3.5-flash-lite");
    expect(list).toContain("gemini-flash-lite-latest");
    vi.stubEnv("AI_MODEL", "a, b");
    expect(aiModels("gemini")).toEqual(["a", "b"]);
  });

  it("moves on when a model is retired (404) or over quota (429)", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.includes("/old:")) return new Response("", { status: 404 });
        if (url.includes("/busy:")) return new Response("", { status: 429 });
        return Response.json({
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"ok":true}' }] } }],
        });
      }),
    );
    const out = await geminiJsonFallback(["old", "busy", "good"], { system: "s", user: "u", schema: {} });
    expect(out).toBe('{"ok":true}');
    expect(calls).toHaveLength(3);
  });

  it("moves on when a model hangs, instead of failing the whole request", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: { signal: AbortSignal }) => {
        if (url.includes("/slow:")) {
          // Never answers: only the abort ends it.
          return new Promise((_, reject) =>
            init.signal.addEventListener("abort", () => reject(init.signal.reason)),
          );
        }
        return Promise.resolve(
          Response.json({
            candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"ok":true}' }] } }],
          }),
        );
      }),
    );
    const out = await geminiJsonFallback(["slow", "good"], {
      system: "s",
      user: "u",
      schema: {},
      signal: AbortSignal.timeout(5_000),
      attemptTimeoutMs: 50,
    });
    expect(out).toBe('{"ok":true}');
  });

  it("does not retry other models when the key is missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      geminiJsonFallback(["a", "b"], { system: "s", user: "u", schema: {} }),
    ).rejects.toBeInstanceOf(GeminiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
