import { z } from "zod";
import { validateLadder } from "@/lib/srs/ladder";

/** "1, 3, 7, 12" → [1, 3, 7, 12] (throws a readable message when invalid). */
export function parseLadder(input: string): number[] {
  const parts = input
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n)))
    throw new Error("Faqat butun sonlar kiriting (masalan: 1, 3, 7, 12)");
  try {
    validateLadder(nums);
  } catch {
    throw new Error("Zinapoya 2–30 ta, o'sib boruvchi musbat sondan iborat bo'lishi kerak");
  }
  return nums;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Normalize "8:00" / "08:00:00" → "08:00"; null when invalid. */
export function normalizeTime(t: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim());
  if (!m) return null;
  const hh = m[1]!.padStart(2, "0");
  const out = `${hh}:${m[2]}`;
  return TIME_RE.test(out) ? out : null;
}

export const MAX_REMINDERS = 4;

/** A whole number typed in a form field; blank is an error, not 0. */
const intField = () =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" ? String(v) : v.trim()))
    .pipe(z.string().min(1, "Qiymat kiriting"))
    .transform(Number)
    .pipe(z.number().int("Butun son kiriting"));

export const settingsFormSchema = z
  .object({
    daily_new_limit: intField().pipe(z.number().min(0, "0 dan kam bo'lmasin").max(500, "Ko'pi bilan 500")),
    daily_review_limit: intField().pipe(z.number().min(1, "Kamida 1").max(2000, "Ko'pi bilan 2000")),
    ladder: z.string().transform((v, ctx) => {
      try {
        return parseLadder(v);
      } catch (e) {
        ctx.addIssue({ code: "custom", message: (e as Error).message });
        return z.NEVER;
      }
    }),
    srs_mode: z.enum(["ladder", "fsrs"]),
    direction_mode: z.enum(["random", "en_uz", "uz_en", "both"]),
    overdue_penalty: z.boolean(),
    production_gate_steps: intField().pipe(z.number().min(0).max(30)),
    maintenance_days: intField().pipe(z.number().min(30, "Kamida 30 kun").max(3650, "Ko'pi bilan 3650 kun")),
    tts_rate: z.coerce.number().min(0.5).max(2),
    tts_voice: z
      .string()
      .nullish()
      .transform((v) => (v ? v : null)),
    timezone: z.string().refine(isValidTimeZone, "Noto'g'ri vaqt zonasi"),
    reminder_times: z.array(z.string()).transform((list, ctx) => {
      const out: string[] = [];
      for (const t of list) {
        if (!t.trim()) continue;
        const n = normalizeTime(t);
        if (!n) {
          ctx.addIssue({ code: "custom", message: `Noto'g'ri vaqt: ${t}` });
          return z.NEVER;
        }
        if (!out.includes(n)) out.push(n);
      }
      if (out.length > MAX_REMINDERS) {
        ctx.addIssue({ code: "custom", message: `Ko'pi bilan ${MAX_REMINDERS} ta eslatma` });
        return z.NEVER;
      }
      return out.sort();
    }),
  })
  .superRefine((v, ctx) => {
    if (Array.isArray(v.ladder) && v.production_gate_steps >= v.ladder.length) {
      ctx.addIssue({
        code: "custom",
        path: ["production_gate_steps"],
        message: "Zinapoya pog'onalari sonidan kam bo'lsin",
      });
    }
  });

export type SettingsFormInput = z.input<typeof settingsFormSchema>;
export type SettingsUpdate = z.output<typeof settingsFormSchema>;
