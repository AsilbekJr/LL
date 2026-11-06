"use client";

import { useMutation } from "@tanstack/react-query";
import { aiFeedbackSchema, type AiFeedback, type AiFeedbackRequest } from "@/lib/production/feedback";

async function requestFeedback(body: AiFeedbackRequest): Promise<AiFeedback> {
  const res = await fetch("/api/ai-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ai-feedback ${res.status}`);
  const json: unknown = await res.json();
  return aiFeedbackSchema.parse((json as { feedback?: unknown }).feedback);
}

export function useAiFeedback() {
  return useMutation({ mutationFn: requestFeedback, retry: 0 });
}
