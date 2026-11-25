"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { canRecognize, listen, type Listener, type SttError } from "@/lib/speech/stt";
import { uz } from "@/lib/i18n/uz";

// ---------- a recorder that survives pauses ---------------------------------

/**
 * Speech recognition for a long talk. Mobile browsers end recognition after
 * a short silence; this keeps listening (and keeps the text) until the
 * learner presses stop or the time is up.
 */
export function useLongRecorder(maxSeconds: number) {
  const [supported] = useState(() => canRecognize());
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<SttError | null>(null);
  const committed = useRef("");
  const want = useRef(false);
  const listener = useRef<Listener | null>(null);
  const elapsedBefore = useRef(0);
  const startedAt = useRef(0);
  const emptyRestarts = useRef(0);
  const spawnRef = useRef<() => void>(() => undefined);
  /** Bumped by reset(): a listener from before it is ignored when it ends. */
  const generation = useRef(0);

  const join = (a: string, b: string) => `${a} ${b}`.trim();

  const finish = useCallback((err?: SttError) => {
    want.current = false;
    elapsedBefore.current += Date.now() - startedAt.current;
    setSeconds(Math.floor(elapsedBefore.current / 1000));
    setRecording(false);
    if (err && err !== "no-speech") setError(err);
  }, []);

  // Kept in a ref (set after render) so a listener can restart itself.
  useEffect(() => {
    spawnRef.current = () => {
      const began = Date.now();
      const gen = generation.current;
      let heard = false;
      listener.current = listen({
        onText: (s) => {
          if (gen !== generation.current) return;
          heard = true;
          setText(join(committed.current, s));
        },
        onEnd: (final, err) => {
          if (gen !== generation.current) return;
          committed.current = join(committed.current, final);
          setText(committed.current);
          if (!want.current) return finish(err);
          // A recognizer that keeps ending at once without hearing anything: give up.
          emptyRestarts.current = !heard && Date.now() - began < 500 ? emptyRestarts.current + 1 : 0;
          if ((err === undefined || err === "no-speech") && emptyRestarts.current < 3) spawnRef.current();
          else finish(err);
        },
      });
    };
  });

  const start = useCallback(() => {
    if (!supported) return;
    setError(null);
    want.current = true;
    emptyRestarts.current = 0;
    startedAt.current = Date.now();
    setRecording(true);
    spawnRef.current();
  }, [supported]);

  const stop = useCallback(() => {
    want.current = false;
    if (listener.current) listener.current.stop();
    else finish();
  }, [finish]);

  const reset = useCallback(() => {
    generation.current++;
    want.current = false;
    listener.current?.abort();
    listener.current = null;
    committed.current = "";
    elapsedBefore.current = 0;
    setText("");
    setSeconds(0);
    setRecording(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      const s = Math.floor((elapsedBefore.current + Date.now() - startedAt.current) / 1000);
      setSeconds(s);
      if (s >= maxSeconds) stop();
    }, 250);
    return () => clearInterval(id);
  }, [recording, maxSeconds, stop]);

  useEffect(
    () => () => {
      want.current = false;
      listener.current?.abort();
    },
    [],
  );

  return { supported, text, recording, seconds, error, start, stop, reset };
}

export function sttError(error: SttError | null): string | null {
  if (error === "not-allowed") return uz.production.sttDenied;
  if (error === "unsupported") return uz.production.sttUnsupported;
  if (error) return uz.production.sttNoSpeech;
  return null;
}
