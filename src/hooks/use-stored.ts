"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Device settings kept in localStorage, read WITHOUT hydration mismatches:
 * the server (and the first client render) see `null`, then the stored
 * value arrives. Writes notify every component using the same key, and
 * other tabs through the "storage" event.
 */
const listeners = new Map<string, Set<() => void>>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // storage off: the value lasts until reload only through the listeners below
  }
  for (const l of listeners.get(key) ?? []) l();
}

export function useStored(key: string): [string | null, (value: string | null) => void] {
  const subscribe = useCallback(
    (listener: () => void) => {
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) listener();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        set.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const set = useCallback((v: string | null) => writeStored(key, v), [key]);
  return [value, set];
}

const noSubscribe = () => () => undefined;

/** false on the server and during hydration, true afterwards — for browser-only UI. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}
