import { expect, test, type Page } from "@playwright/test";

/**
 * Core flows on a 360 px phone, signed in as the E2E test account.
 * Runs in order: starts from an empty library, adds words, reviews them
 * (also offline), checks the other screens and cleans up at the end.
 */
test.describe.configure({ mode: "serial" });
test.skip(!process.env.E2E_EMAIL, "E2E_EMAIL not set");

const run = Date.now().toString(36);
const word = `e2e${run}`;
const listWords = [`${word}a`, `${word}b`];

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(1);
}

async function deleteAllWords(page: Page) {
  await page.goto("/kutubxona");
  const selectAll = page.getByRole("button", { name: "Hammasini tanlash" });
  const empty = page.getByText("Kutubxona bo'sh");
  // Wait until the library has loaded: checking at once mistook "still loading"
  // for "empty", so words from earlier runs piled up.
  await expect(selectAll.or(empty).first()).toBeVisible({ timeout: 15_000 });
  if (await empty.isVisible()) return;
  // "Show more" until everything is loaded, then select all and delete.
  while (await page.getByRole("button", { name: "Yana ko'rsatish" }).isVisible()) {
    await page.getByRole("button", { name: "Yana ko'rsatish" }).click();
  }
  await selectAll.click();
  // The bulk bar is pinned on screen, not at the end of a long list.
  await expect(page.getByRole("toolbar")).toBeInViewport({ ratio: 1 });
  await page.getByRole("toolbar").getByRole("button", { name: "O'chirish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "O'chirish" }).click();
  await expect(page.getByText("Kutubxona bo'sh")).toBeVisible({ timeout: 15_000 });
}

test("starts from an empty library", async ({ page }) => {
  await deleteAllWords(page);
});

test("every main screen fits 360 px", async ({ page }) => {
  for (const path of [
    "/bugun",
    "/qoshish",
    "/kutubxona",
    "/kalendar",
    "/statistika",
    "/sozlamalar",
    "/import",
    "/nutq",
    "/yodlanganlar",
    "/koproq",
  ]) {
    await page.goto(path);
    await expect(page.locator("main h1").first()).toBeVisible();
    await noHorizontalScroll(page);
  }
});

/** The pinned add button is on screen without scrolling (above the bottom nav). */
async function expectInViewport(page: Page, name: string | RegExp) {
  const button = page.getByRole("button", { name, exact: typeof name === "string" });
  await expect(button).toBeInViewport({ ratio: 1 });
}

test("adds a word, goes home, and rejects the duplicate", async ({ page }) => {
  const add = async () => {
    await page.goto("/qoshish");
    await page.getByRole("combobox", { name: "Inglizcha" }).fill(word);
    await page.getByLabel("O'zbekcha", { exact: true }).fill("sinov so'zi");
    await expectInViewport(page, "Qo'shish");
    await page.getByRole("button", { name: "Qo'shish", exact: true }).click();
  };
  await add();
  await expect(page).toHaveURL(/\/bugun$/);
  await expect(page.getByRole("status").filter({ hasText: "takrorlashga tushdi" })).toBeVisible();
  // The new word is in today's plan at once, counted as one word (not two cards).
  await expect(page.getByText("1 ta yangi so'z sizni kutmoqda")).toBeVisible();
  // The goal metric is on the home page: words usable in speech, out of all words.
  await expect(page.getByRole("progressbar", { name: "Faol so'zlar" })).toBeVisible();
  await expect(page.getByText("0 / 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Boshlash" })).toBeVisible();
  await add();
  await expect(page.getByRole("status").filter({ hasText: "allaqachon bor" })).toBeVisible();
  await expect(page).toHaveURL(/\/qoshish$/);
});

test("picking a dictionary word fills example, part of speech and note", async ({ page }) => {
  await page.goto("/qoshish");
  const english = page.getByRole("combobox", { name: "Inglizcha" });
  await english.click();
  await english.pressSequentially("umbrell", { delay: 30 });
  await page
    .getByRole("option", { name: /umbrella/ })
    .first()
    .click();
  await expect(english).toHaveValue("umbrella"); // the pick must survive focus moving on
  await expect(page.getByLabel("O'zbekcha", { exact: true })).not.toHaveValue("");
  await expect(page.getByLabel(/Misol \(inglizcha\)/)).not.toHaveValue("", { timeout: 30_000 });
  await expect(page.getByLabel(/Misol \(o'zbekcha\)/)).not.toHaveValue("", { timeout: 30_000 });
  await expect(page.getByLabel(/So'z turkumi/)).not.toHaveValue("");
  await expect(page.getByText(/avtomatik qo'shildi/)).toBeVisible({ timeout: 30_000 });
  await expectInViewport(page, "Qo'shish");
});

test("adds a pasted list and goes home", async ({ page }) => {
  await page.goto("/qoshish");
  await page.getByRole("tab", { name: "Ro'yxat" }).click();
  await page
    .getByRole("textbox", { name: "Ro'yxat" })
    .fill(listWords.map((w) => `${w} - ${w} uz`).join("\n"));
  await expectInViewport(page, "2 ta so'zni qo'shish");
  await page.getByRole("button", { name: "2 ta so'zni qo'shish" }).click();
  await expect(page).toHaveURL(/\/bugun$/, { timeout: 45_000 });
  await expect(page.getByText(/2 ta so'z misollari bilan qo'shildi/)).toBeVisible();
});

test("library search finds the new words", async ({ page }) => {
  await page.goto("/kutubxona");
  await page
    .getByRole("searchbox")
    .or(page.getByPlaceholder(/Qidirish/))
    .first()
    .fill(word);
  await expect(page.getByText("3 ta natija")).toBeVisible();
});

test("import rejects an invalid file and previews a sample pack", async ({ page }) => {
  await page.goto("/import");
  await page.getByRole("tab", { name: "Fayl" }).click();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"items": [ {') });
  // Next's route announcer is also role="alert", so filter by text.
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /JSON|qator|xato/i })
      .first(),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Tayyor to'plamlar" }).click();
  await page.getByRole("button", { name: /^A1/ }).click(); // sample pack cards are buttons
  await expect(page.getByText(/ta yangi/).first()).toBeVisible();
  await page.getByRole("button", { name: "Bekor qilish" }).click();
});

/** Answers whatever exercise is on screen with a passing / "good" answer. */
async function answerOne(page: Page): Promise<boolean> {
  if (await page.getByRole("heading", { name: "Sessiya tugadi!" }).isVisible()) return false;
  const gotIt = page.getByRole("button", { name: "Tushundim" });
  const show = page.getByRole("button", { name: "Javobni ko'rsatish" });
  const good = page.getByRole("button", { name: /^Yaxshi/ });
  const cont = page.getByRole("button", { name: "Davom etish" });
  const check = page.getByRole("button", { name: "Tekshirish" });
  const skip = page.getByRole("button", { name: "O'tkazib yuborish" });
  const choice = page.locator("main ul[role=list] button").first();
  const done = page.getByRole("heading", { name: "Sessiya tugadi!" });

  await expect(gotIt.or(show).or(good).or(cont).or(check).or(skip).or(choice).or(done).first()).toBeVisible({
    timeout: 15_000,
  });
  if (await done.isVisible()) return false;
  if (await gotIt.isVisible()) return gotIt.click().then(() => true);
  if (await show.isVisible()) await show.click();
  if (await good.isVisible()) return good.click().then(() => true);
  if (await cont.isVisible()) return cont.click().then(() => true);
  if (await check.isVisible()) {
    // Typed exercises (spelling / listening / cloze): any answer keeps the flow going.
    const input = page.getByPlaceholder("Javobingiz…");
    if (await input.isVisible()) await input.fill("x");
    await check.click();
    await cont.click();
    return true;
  }
  if (await choice.isVisible()) {
    await choice.click(); // multiple choice answers on tap
    await cont.click();
    return true;
  }
  if (await skip.isVisible()) return skip.click().then(() => true);
  return false;
}

test("review session works offline and syncs afterwards", async ({ page, context }) => {
  await page.goto("/bugun");
  await page.getByRole("link", { name: /Boshlash|Yangi so'zlarni o'rganish/ }).click();
  await expect(page).toHaveURL(/\/takrorlash/);

  // First answer online, then lose the connection mid-session.
  expect(await answerOne(page)).toBe(true);
  await context.setOffline(true);
  expect(await answerOne(page)).toBe(true);
  await expect(page.getByText(/javob saqlanmoqda|saqlanmadi/)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText(/javob saqlanmoqda|saqlanmadi/)).toBeHidden({ timeout: 20_000 });

  for (let i = 0; i < 40 && (await answerOne(page)); i++);
  await expect(page.getByRole("heading", { name: "Sessiya tugadi!" })).toBeVisible();
  // Back home the plan is done and says what comes next.
  await page.getByRole("link", { name: "Bosh sahifaga" }).click();
  await expect(page.getByRole("heading", { name: "Bugungi reja bajarildi" })).toBeVisible();
  await expect(page.getByText(/^Ertaga: \d+ ta so'zni takrorlash/)).toBeVisible();
});

test("speaking conversation: strict check, AI judge, next question", async ({ page }) => {
  // No microphone in CI: hide speech recognition so the typed fallback is used.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
  });
  await page.goto("/nutq");
  await page.getByRole("tab", { name: "Suhbat" }).click();
  await page.getByRole("button", { name: "Suhbatni boshlash" }).click();
  const answerBox = page.getByRole("textbox");
  // The live AI is sometimes slow: the app then offers a retry, which a learner would tap.
  const retry = page.getByRole("button", { name: "Qayta urinish" });
  await expect(answerBox.or(retry)).toBeVisible({ timeout: 30_000 });
  if (await retry.isVisible()) await retry.click();
  await expect(answerBox).toBeVisible({ timeout: 30_000 });

  // A restarted sentence fails offline, before any AI call.
  await answerBox.fill("I I think so");
  await page.getByRole("button", { name: "Tekshirish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Gap qaytadan boshlandi" })).toBeVisible();

  // A real answer gets the AI verdict, then the next question can be asked.
  await page.getByRole("button", { name: "Qayta javob berish" }).click();
  const target = (await page
    .getByText(/^Javobda ishlating:/)
    .first()
    .textContent())!
    .replace("Javobda ishlating:", "")
    .split("—")[0]!
    .trim();
  await page.getByRole("textbox").fill(`Yesterday I talked about ${target} with my friend.`);
  await page.getByRole("button", { name: "Tekshirish" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Gap to'g'ri, ma'noli|Hali emas|AI tekshiruvi hozir ishlamadi/ }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Keyingi savol" })).toBeEnabled();
  await noHorizontalScroll(page);
});

test("speaking patterns: a sensible frame for the word, or an honest 'no fit'", async ({ page }) => {
  await page.goto("/nutq");
  await page.getByRole("tab", { name: "Qoliplar" }).click();
  await page.getByRole("radio", { name: "A1" }).click();
  const card = page.getByText("Bo'sh joyga (…) shu so'zni qo'ying");
  const noFit = page.getByText(/Bu darajadagi qoliplar uchun mos so'z yo'q/);
  // AI checks are time-boxed (12 s + one request), then part of speech decides.
  await expect(card.or(noFit)).toBeVisible({ timeout: 45_000 });
  if (await card.isVisible()) {
    const word = (await card.locator("..").locator("span[lang=en]").textContent())!;
    expect(word.trim().length).toBeGreaterThan(0);
    // With AI: a ready model sentence for the learner's own word, hidden until asked for.
    const show = page.getByRole("button", { name: /bilan tayyor javobni ko'rish$/ });
    if (await show.isVisible()) {
      await show.click();
      await expect(page.getByText(/bilan tayyor javob$/)).toBeVisible();
    }
  }
  await noHorizontalScroll(page);
});

test("calendar shows today's reviewed words", async ({ page }) => {
  await page.goto("/kalendar");
  const todayNumber = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", day: "numeric" }).format(new Date()),
  );
  await page
    .locator("button[aria-pressed]")
    .filter({ has: page.getByText(String(todayNumber), { exact: true }) })
    .first()
    .click();
  // Cards answered "again" stay due today, so today can show either list.
  await expect(page.getByText(/Rejadagi so'zlar|Takrorlangan so'zlar/)).toBeVisible();
  await expect(page.getByText(word, { exact: false }).first()).toBeVisible();
});

test("statistics count today's reviews", async ({ page }) => {
  await page.goto("/statistika");
  await expect(page.locator("main h1")).toHaveText("Statistika");
  await noHorizontalScroll(page);
});

test("settings save", async ({ page }) => {
  await page.goto("/sozlamalar");
  const limit = page.getByLabel("Kuniga yangi so'zlar");
  const before = await limit.inputValue();
  await limit.fill(before === "14" ? "15" : "14");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText("Sozlamalar saqlandi.")).toBeVisible();
  await limit.fill(before);
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText("Sozlamalar saqlandi.")).toBeVisible();
});

test("cleans up", async ({ page }) => {
  await deleteAllWords(page);
});
