import type { CefrLevel } from "@/lib/supabase/database.types";
import { expandedTokens, usesTerm, wordTokens } from "@/lib/text/usage";
import { wordClass, type WordClass } from "@/lib/vocab/dictionary";

/**
 * Speaking patterns: a fixed frame ("I'm going to ___ this weekend") plus one
 * word from the learner's library. Saying the frame with many different words
 * makes the structure automatic — the core of speaking fluency.
 */
export type PatternSlot = Exclude<WordClass, "adverb" | "other"> | "any";

export interface SpeakingPattern {
  id: string;
  level: CefrLevel;
  /** The frame; `___` marks where the learner's word goes. */
  en: string;
  /** What the frame means / when to use it. */
  uz: string;
  /** Chunks that must be heard (contractions spelled out; `|` separates alternatives). */
  keys: string[];
  slot: PatternSlot;
  example: string;
}

const P = (
  id: string,
  level: CefrLevel,
  slot: PatternSlot,
  en: string,
  uz: string,
  keys: string[],
  example: string,
): SpeakingPattern => ({ id, level, slot, en, uz, keys, example });

export const PATTERNS: SpeakingPattern[] = [
  // A1 — basic statements and requests
  P(
    "a1-like",
    "A1",
    "noun",
    "I like ___.",
    "Men ___ni yoqtiraman.",
    ["i like"],
    "I like coffee in the morning.",
  ),
  P(
    "a1-want",
    "A1",
    "verb",
    "I want to ___.",
    "Men ___ni xohlayman.",
    ["want to"],
    "I want to travel next year.",
  ),
  P(
    "a1-can-have",
    "A1",
    "noun",
    "Can I have ___, please?",
    "Iltimos, menga ___ bering (so'rash).",
    ["can i have"],
    "Can I have some water, please?",
  ),
  P(
    "a1-there-is",
    "A1",
    "noun",
    "There is a ___ near my house.",
    "Uyim yaqinida ___ bor.",
    ["there is|there are", "near my house"],
    "There is a park near my house.",
  ),
  P(
    "a1-usually",
    "A1",
    "verb",
    "I usually ___ in the morning.",
    "Men odatda ertalab ___.",
    ["usually", "in the morning"],
    "I usually drink tea in the morning.",
  ),
  P(
    "a1-favorite",
    "A1",
    "noun",
    "My favorite ___ is …",
    "Mening sevimli ___im — …",
    ["my favorite|my favourite"],
    "My favorite food is plov.",
  ),
  P(
    "a1-dont-like",
    "A1",
    "noun",
    "I don't like ___.",
    "Men ___ni yoqtirmayman.",
    ["do not like"],
    "I don't like cold weather.",
  ),
  P(
    "a1-how-much",
    "A1",
    "noun",
    "How much is the ___?",
    "___ qancha turadi?",
    ["how much"],
    "How much is the ticket?",
  ),
  P("a1-have", "A1", "noun", "I have a ___.", "Mening ___im bor.", ["i have"], "I have a big family."),
  P(
    "a1-can",
    "A1",
    "verb",
    "I can ___ very well.",
    "Men ___ni juda yaxshi uddalayman.",
    ["i can", "very well"],
    "I can swim very well.",
  ),

  // A2 — plans, past habits, experience
  P(
    "a2-going-to",
    "A2",
    "verb",
    "I'm going to ___ this weekend.",
    "Bu dam olish kunlari ___moqchiman (reja).",
    ["going to", "this weekend"],
    "I'm going to visit my grandparents this weekend.",
  ),
  P(
    "a2-used-to",
    "A2",
    "verb",
    "I used to ___ when I was a child.",
    "Bolaligimda ___ardim (endi yo'q).",
    ["used to", "when i was"],
    "I used to play football when I was a child.",
  ),
  P(
    "a2-have-never",
    "A2",
    "verb",
    "I have never ___.",
    "Men hech qachon ___maganman (tajriba).",
    ["have never"],
    "I have never seen the sea.",
  ),
  P(
    "a2-too",
    "A2",
    "adjective",
    "It's too ___ for me.",
    "Bu men uchun juda ___ (ortiqcha).",
    ["too", "for me"],
    "This jacket is too expensive for me.",
  ),
  P(
    "a2-than",
    "A2",
    "adjective",
    "It's more ___ than …",
    "Bu …dan ko'ra ___roq (taqqoslash).",
    ["than"],
    "Tashkent is bigger than Samarkand.",
  ),
  P(
    "a2-need-to",
    "A2",
    "verb",
    "I need to ___ before …",
    "…dan oldin ___ishim kerak.",
    ["need to", "before"],
    "I need to finish this before dinner.",
  ),
  P(
    "a2-could-you",
    "A2",
    "verb",
    "Could you ___, please?",
    "Iltimos, ___a olasizmi? (muloyim so'rov)",
    ["could you", "please"],
    "Could you open the window, please?",
  ),
  P(
    "a2-was-when",
    "A2",
    "verb",
    "I was ___ing when …",
    "… paytda men ___ayotgan edim.",
    ["i was", "when"],
    "I was cooking when you called.",
  ),
  P(
    "a2-important",
    "A2",
    "noun",
    "I think ___ is important because …",
    "Menimcha, ___ muhim, chunki …",
    ["i think", "important because"],
    "I think sleep is important because it gives us energy.",
  ),
  P(
    "a2-ever",
    "A2",
    "verb",
    "Have you ever ___?",
    "Hech ___ganmisiz?",
    ["have you ever"],
    "Have you ever tried sushi?",
  ),

  // B1 — duration, conditions, opinions
  P(
    "b1-been-for",
    "B1",
    "verb",
    "I've been ___ing for …",
    "… dan beri ___yapman (davomiylik).",
    ["have been", "for|since"],
    "I've been learning English for two years.",
  ),
  P(
    "b1-if-would",
    "B1",
    "verb",
    "If I had more time, I would ___.",
    "Ko'proq vaqtim bo'lganda, ___ardim.",
    ["if i had", "would"],
    "If I had more time, I would read more books.",
  ),
  P(
    "b1-thinking-about",
    "B1",
    "verb",
    "I'm thinking about ___ing.",
    "___ish haqida o'ylayapman.",
    ["thinking about|thinking of"],
    "I'm thinking about changing my job.",
  ),
  P(
    "b1-depends",
    "B1",
    "noun",
    "It depends on ___.",
    "Bu ___ga bog'liq.",
    ["depends on"],
    "It depends on the weather.",
  ),
  P(
    "b1-not-used-to",
    "B1",
    "any",
    "I'm not used to ___.",
    "Men ___ga o'rganmaganman.",
    ["not used to"],
    "I'm not used to waking up so early.",
  ),
  P(
    "b1-rather",
    "B1",
    "verb",
    "I'd rather ___ than …",
    "…dan ko'ra ___ni afzal ko'raman.",
    ["would rather|had rather", "than"],
    "I'd rather walk than take the bus.",
  ),
  P(
    "b1-looking-forward",
    "B1",
    "any",
    "I'm looking forward to ___.",
    "___ni intiqlik bilan kutyapman.",
    ["looking forward to"],
    "I'm looking forward to the holidays.",
  ),
  P(
    "b1-as-far-as",
    "B1",
    "any",
    "As far as I know, ___ …",
    "Bilishimcha, ___ …",
    ["as far as i know"],
    "As far as I know, the museum is closed today.",
  ),
  P(
    "b1-main-reason",
    "B1",
    "noun",
    "The main reason is ___.",
    "Asosiy sabab — ___.",
    ["the main reason"],
    "The main reason is the price.",
  ),
  P(
    "b1-that-i",
    "B1",
    "noun",
    "The ___ that I … was …",
    "Men …gan ___ … edi (ergash gap).",
    ["that i"],
    "The book that I read last week was amazing.",
  ),

  // B2 — regrets, contrast, arguments
  P(
    "b2-would-have",
    "B2",
    "verb",
    "If I had known, I would have ___.",
    "Bilganimda, ___gan bo'lardim (o'tgan afsus).",
    ["if i had known", "would have"],
    "If I had known, I would have helped you.",
  ),
  P(
    "b2-wish-could",
    "B2",
    "verb",
    "I wish I could ___.",
    "Qani endi ___a olsam.",
    ["i wish i could"],
    "I wish I could speak French.",
  ),
  P(
    "b2-not-only",
    "B2",
    "any",
    "Not only … but also ___.",
    "Nafaqat …, balki ___ ham.",
    ["not only", "but also"],
    "She is not only smart but also very kind.",
  ),
  P(
    "b2-worth",
    "B2",
    "verb",
    "It's worth ___ing.",
    "___ishga arziydi.",
    ["worth"],
    "This film is worth watching.",
  ),
  P(
    "b2-despite",
    "B2",
    "noun",
    "Despite the ___, …",
    "___ga qaramay, …",
    ["despite|in spite of"],
    "Despite the rain, we went for a walk.",
  ),
  P(
    "b2-what-i-really",
    "B2",
    "verb",
    "What I really ___ is …",
    "Menga aslida kerak/yoqadigani — …",
    ["what i really"],
    "What I really need is a long holiday.",
  ),
  P(
    "b2-in-favor",
    "B2",
    "noun",
    "I'm in favor of ___ because …",
    "Men ___ tarafdoriman, chunki …",
    ["in favor of|in favour of", "because"],
    "I'm in favor of online lessons because they save time.",
  ),
  P(
    "b2-other-hand",
    "B2",
    "any",
    "On the one hand …, on the other hand ___.",
    "Bir tomondan …, boshqa tomondan ___.",
    ["on the one hand", "on the other hand"],
    "On the one hand it's cheap, on the other hand it's slow.",
  ),
  P(
    "b2-said-to-be",
    "B2",
    "noun",
    "___ is said to be …",
    "Aytishlaricha, ___ …",
    ["is said to be|are said to be"],
    "This restaurant is said to be the best in town.",
  ),
  P(
    "b2-by-the-time",
    "B2",
    "verb",
    "By the time I …, they had already ___.",
    "Men …gunimcha, ular allaqachon ___gan edi.",
    ["by the time", "had already"],
    "By the time I arrived, they had already left.",
  ),

  // C1 — advanced discourse
  P(
    "c1-had-i-known",
    "C1",
    "any",
    "Had I known about ___, I would have …",
    "___ haqida bilganimda, …gan bo'lardim (inversiya).",
    ["had i known", "would have"],
    "Had I known about the traffic, I would have left earlier.",
  ),
  P(
    "c1-goes-without",
    "C1",
    "any",
    "It goes without saying that ___ …",
    "___ ekanini aytmasa ham bo'ladi.",
    ["goes without saying"],
    "It goes without saying that health comes first.",
  ),
  P(
    "c1-strikes-me",
    "C1",
    "noun",
    "What strikes me most about ___ is …",
    "___ning eng hayratlanarli tomoni — …",
    ["what strikes me"],
    "What strikes me most about this city is its history.",
  ),
  P(
    "c1-no-denying",
    "C1",
    "any",
    "There's no denying that ___ …",
    "___ ekanini inkor etib bo'lmaydi.",
    ["no denying"],
    "There's no denying that technology has changed our lives.",
  ),
  P(
    "c1-cant-help",
    "C1",
    "verb",
    "I can't help ___ing.",
    "___may ilojim yo'q (beixtiyor).",
    ["can not help"],
    "I can't help laughing when I see him.",
  ),
  P(
    "c1-the-more",
    "C1",
    "verb",
    "The more I ___, the more …",
    "Qancha ko'p ___sam, shuncha …",
    ["the more i", "the more"],
    "The more I practice, the more confident I feel.",
  ),
  P(
    "c1-key-role",
    "C1",
    "noun",
    "___ plays a key role in …",
    "___ …da muhim rol o'ynaydi.",
    ["key role|important role|crucial role"],
    "Education plays a key role in development.",
  ),
  P(
    "c1-rarely",
    "C1",
    "any",
    "Rarely have I seen such ___.",
    "Bunday ___ni kamdan-kam ko'rganman (inversiya).",
    ["rarely have i"],
    "Rarely have I seen such a beautiful sunset.",
  ),
  P(
    "c1-be-that",
    "C1",
    "any",
    "Be that as it may, ___ …",
    "Shunday bo'lsa ham, ___ …",
    ["be that as it may"],
    "Be that as it may, we still need a plan.",
  ),
  P(
    "c1-high-time",
    "C1",
    "verb",
    "It's high time we ___.",
    "___ish vaqti allaqachon keldi.",
    ["high time"],
    "It's high time we started saving money.",
  ),

  // C2 — formal, literary structures
  P(
    "c2-were-it-not",
    "C2",
    "noun",
    "Were it not for ___, …",
    "___ bo'lmaganida, …",
    ["were it not for|if it were not for"],
    "Were it not for your help, I would have failed.",
  ),
  P(
    "c2-little-did",
    "C2",
    "any",
    "Little did I know that ___ …",
    "___ ekanini xayolimga ham keltirmagandim.",
    ["little did i know"],
    "Little did I know that this trip would change my life.",
  ),
  P(
    "c2-far-from",
    "C2",
    "adjective",
    "Far from being ___, it was …",
    "___ bo'lish u yoqda tursin, u … edi.",
    ["far from being"],
    "Far from being boring, the lecture was fascinating.",
  ),
  P(
    "c2-notwithstanding",
    "C2",
    "noun",
    "Notwithstanding the ___, …",
    "___ga qaramasdan, … (rasmiy).",
    ["notwithstanding"],
    "Notwithstanding the difficulties, the project succeeded.",
  ),
  P(
    "c2-so-was-it",
    "C2",
    "adjective",
    "So ___ was it that …",
    "Shunchalik ___ ediki, …",
    ["was it that"],
    "So cold was it that the river froze.",
  ),
  P(
    "c2-not-so-much",
    "C2",
    "any",
    "It's not so much ___ as …",
    "Gap ___da emas, balki …da.",
    ["not so much", "as"],
    "It's not so much the money as the time.",
  ),
  P(
    "c2-no-sooner",
    "C2",
    "any",
    "No sooner had I … than ___ …",
    "…ishim bilanoq ___ …",
    ["no sooner had", "than"],
    "No sooner had I arrived than it started raining.",
  ),
  P(
    "c2-under-no",
    "C2",
    "verb",
    "Under no circumstances should you ___.",
    "Hech qanday holatda ___mang.",
    ["under no circumstances"],
    "Under no circumstances should you share your password.",
  ),
  P(
    "c2-for-all-its",
    "C2",
    "noun",
    "For all its ___, …",
    "Barcha ___lariga qaramay, …",
    ["for all its|for all their|for all his|for all her"],
    "For all its faults, it is a great city.",
  ),
  P(
    "c2-intents",
    "C2",
    "any",
    "To all intents and purposes, ___ …",
    "Amalda, deyarli ___ …",
    ["intents and purposes"],
    "To all intents and purposes, the decision is final.",
  ),
];

/** Whether a library item fits a pattern's slot (sentences never do). */
export function fitsSlot(
  slot: PatternSlot,
  item: { type: string; english: string; part_of_speech?: string | null },
): boolean {
  if (item.type === "sentence") return false;
  if (slot === "any") return true;
  if (item.type === "phrase") return false;
  const pos = item.part_of_speech?.trim();
  if (!pos) return false;
  return wordClass(pos.toLowerCase()) === slot;
}

const padded = (tokens: string[]) => ` ${tokens.join(" ")} `;

/** One required chunk (with `|` alternatives) heard in the transcript? */
export function hasKey(transcript: string, key: string): boolean {
  const said = padded(expandedTokens(transcript));
  return key.split("|").some((alt) => said.includes(padded(expandedTokens(alt))));
}

export interface PatternCheck {
  keys: boolean[];
  used: boolean;
  wordCount: number;
  passed: boolean;
}

/** Passed = every frame chunk heard + the target word used + at least 4 words. */
export function checkPattern(transcript: string, pattern: SpeakingPattern, target: string): PatternCheck {
  const keys = pattern.keys.map((k) => hasKey(transcript, k));
  const used = usesTerm(transcript, target);
  const wordCount = wordTokens(transcript).length;
  return { keys, used, wordCount, passed: keys.every(Boolean) && used && wordCount >= 4 };
}

/** Pick a pattern of `level` and a library item that fits it. */
export function pickPattern<
  T extends { id: string; type: string; english: string; part_of_speech?: string | null },
>(
  level: CefrLevel,
  items: T[],
  random: () => number,
  avoid?: string,
): { pattern: SpeakingPattern; item: T } | null {
  const patterns = PATTERNS.filter((p) => p.level === level && p.id !== avoid);
  const options = patterns
    .map((pattern) => ({ pattern, fits: items.filter((i) => fitsSlot(pattern.slot, i)) }))
    .filter((o) => o.fits.length > 0);
  if (!options.length) return null;
  const o = options[Math.floor(random() * options.length)]!;
  return { pattern: o.pattern, item: o.fits[Math.floor(random() * o.fits.length)]! };
}
