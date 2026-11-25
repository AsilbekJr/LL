/**
 * Writes context sentences for newly added words in the background: a small
 * module-level queue (2 at a time, one retry), so it keeps going after the
 * add page navigates away. Best effort — a word without sentences is simply
 * reviewed the usual way.
 */
const CONCURRENCY = 2;
const queue: string[] = [];
const queued = new Set<string>();
let running = 0;

async function generate(itemId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/context-sentences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
      signal: AbortSignal.timeout(35_000),
    });
    // 404 = AI off or item gone, 400 = bad id: retrying will not help.
    return res.ok || res.status === 404 || res.status === 400;
  } catch {
    return false;
  }
}

function pump() {
  while (running < CONCURRENCY && queue.length) {
    const id = queue.shift()!;
    running++;
    void (async () => {
      const ok = await generate(id);
      if (!ok) await new Promise((r) => setTimeout(r, 4_000)).then(() => generate(id));
      running--;
      queued.delete(id);
      pump();
    })();
  }
}

export function queueContextSentences(itemIds: string[]): void {
  for (const id of itemIds) {
    if (queued.has(id)) continue;
    queued.add(id);
    queue.push(id);
  }
  pump();
}
