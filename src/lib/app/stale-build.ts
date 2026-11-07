/**
 * After a new deploy, a tab (or the installed PWA) that is still running the
 * old build asks for JS chunks that no longer exist. That is not a bug in
 * the page: one reload fetches the new build. Guarded so a real, repeating
 * error can never cause a reload loop.
 */
const KEY = "ll.stale-reload-at";
const MIN_GAP_MS = 60_000;

export function isStaleBuildError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const text = `${error.name} ${error.message}`;
  return /ChunkLoadError|Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to find Server Action/i.test(
    text,
  );
}

/** Reload once for a stale-build error. Returns true when a reload was started. */
export function reloadForStaleBuild(error: unknown): boolean {
  if (typeof window === "undefined" || !isStaleBuildError(error)) return false;
  try {
    const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < MIN_GAP_MS) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
