import { wordSimilarity } from "@/lib/text/usage";
import { findRestart } from "./judge";

/** Close enough to the corrected sentence, said in one go. */
export const FIX_PASS = 0.85;

export function fixPassed(said: string, target: string): { passed: boolean; similarity: number } {
  const similarity = wordSimilarity(said, target);
  return { passed: similarity >= FIX_PASS && !findRestart(said), similarity };
}
