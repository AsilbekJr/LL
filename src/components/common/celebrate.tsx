"use client";

import { useEffect } from "react";
import { celebrate, feedback } from "@/lib/feedback/feedback";

/** Plays the "done" sound (and confetti) once when it appears. Renders nothing. */
export function CelebrateOnMount({ confetti = "small" }: { confetti?: "small" | "big" | false }) {
  useEffect(() => {
    feedback("complete");
    if (confetti) void celebrate(confetti);
  }, [confetti]);
  return null;
}
