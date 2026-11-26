"use client";

import { useSyncExternalStore } from "react";
import { useIsClient } from "./use-stored";
import { canRecognize } from "@/lib/speech/stt";

/**
 * How spoken answers are given: by voice (speech recognition) or typed
 * after saying the sentence aloud — for when the microphone mishears.
 * One choice for the whole app, remembered on this device and kept in
 * sync between open exercises.
 */
export type InputMode = "voice" | "text";

const KEY = "ll.answer.mode";
const listeners = new Set<() => void>();
let current: InputMode | null = null;

function read(): InputMode {
  try {
    return window.localStorage.getItem(KEY) === "text" ? "text" : "voice";
  } catch {
    return "voice";
  }
}

function snapshot(): InputMode {
  return (current ??= read());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    current = read();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setInputMode(mode: InputMode) {
  current = mode;
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // storage off: the choice lasts for this visit
  }
  for (const l of listeners) l();
}

export function useInputMode() {
  const mode = useSyncExternalStore(subscribe, snapshot, (): InputMode => "voice");
  // Browser-only check, done after hydration so server and client HTML match.
  const canVoice = useIsClient() && canRecognize();
  return { mode, canVoice, voice: canVoice && mode === "voice", setMode: setInputMode };
}
