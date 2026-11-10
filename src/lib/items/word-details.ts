import { z } from "zod";

/**
 * Request/response for POST /api/word-details: Gemini fills what the
 * built-in dictionary and sentence bank could not (an Uzbek translation of
 * the example, a short Uzbek usage note, a part of speech).
 */
export const WORD_DETAILS_MAX = 20;

export const wordDetailsRequestSchema = z.object({
  words: z
    .array(
      z.object({
        english: z.string().trim().min(1).max(120),
        uzbek: z.string().trim().max(200).default(""),
        level: z.string().max(4).optional(),
        part_of_speech: z.string().trim().max(60).optional(),
        /** A bank sentence to keep and translate, when it fits the meaning. */
        example_en: z.string().trim().max(300).optional(),
      }),
    )
    .min(1)
    .max(WORD_DETAILS_MAX),
});
export type WordDetailsRequest = z.infer<typeof wordDetailsRequestSchema>;

export const wordDetailSchema = z.object({
  english: z.string(),
  /** Uzbek translation and CEFR level: only used when the learner gave no meaning. */
  uzbek: z.string().max(200).default(""),
  level: z.string().max(4).default(""),
  part_of_speech: z.string().max(60),
  example_en: z.string().max(300),
  example_uz: z.string().max(400),
  notes: z.string().max(300),
});
export type WordDetail = z.infer<typeof wordDetailSchema>;

export const wordDetailsResponseSchema = z.object({ items: z.array(wordDetailSchema) });

export const WORD_DETAILS_JSON_SCHEMA = {
  type: "object",
  required: ["items"],
  properties: {
    items: {
      type: "array",
      description: "One item per input word, same order.",
      items: {
        type: "object",
        required: ["english", "uzbek", "level", "part_of_speech", "example_en", "example_uz", "notes"],
        properties: {
          english: { type: "string", description: "The input word or phrase, exactly as given." },
          uzbek: {
            type: "string",
            description:
              "The given Uzbek meaning unchanged; if none was given, the most common Uzbek translation (Latin script): 1–3 words, at most two meanings separated by a comma.",
          },
          level: { type: "string", description: "CEFR level of the word: A1, A2, B1, B2, C1 or C2." },
          part_of_speech: {
            type: "string",
            description:
              "English part of speech in lower case: noun, verb, adjective, adverb, phrasal verb, idiom, phrase…",
          },
          example_en: { type: "string", description: "One natural English example sentence using it." },
          example_uz: {
            type: "string",
            description: "Natural Uzbek (Latin script) translation of example_en.",
          },
          notes: { type: "string", description: "One short usage note in Uzbek (Latin script)." },
        },
      },
    },
  },
} as const;

export const WORD_DETAILS_SYSTEM = `You prepare vocabulary cards for an Uzbek-speaking learner of English.
For every input word or phrase return:
- uzbek: if uzbek_meaning is given, repeat it unchanged. If it is null, give the most common everyday Uzbek
  translation in Latin script: short (1–3 words), dictionary form (verbs end in -moq), at most two meanings
  separated by a comma. If the input is not a real English word or phrase (a typo, random letters), return "".
- level: the CEFR level of the word in that meaning (A1…C2).
- part_of_speech: keep the given one if present, otherwise the part of speech for the given Uzbek meaning.
- example_en: if an example is given AND it uses the word in the given Uzbek meaning, return it unchanged.
  Otherwise write ONE new, natural, everyday sentence (max 12 words) that uses the word in exactly that
  meaning, at the given CEFR level or easier. Use the word in a form a learner will recognise.
- example_uz: a natural, fluent Uzbek translation of example_en in Latin script (o', g', sh, ch; no Cyrillic).
- notes: ONE short practical tip in Uzbek Latin script, max 110 characters: a common collocation, a typical
  preposition, a confusing look-alike, or formal/informal register. Do not just repeat the translation.
  English words inside the note are fine. Use correct Uzbek grammar terms: fe'l (verb), ot (noun),
  sifat (adjective), ravish (adverb), predlog (preposition), ibora (phrase).
Return the items in the same order as the input. Never add or skip items.`;

export function wordDetailsUserMessage(words: WordDetailsRequest["words"]): string {
  return [
    "<words>",
    ...words.map((w, i) =>
      JSON.stringify({
        n: i + 1,
        english: w.english,
        uzbek_meaning: w.uzbek || null,
        level: w.level || null,
        part_of_speech: w.part_of_speech || null,
        example: w.example_en || null,
      }),
    ),
    "</words>",
  ].join("\n");
}
