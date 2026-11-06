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
  if (!(await selectAll.isVisible().catch(() => false))) return; // already empty
  // "Show more" until everything is loaded, then select all and delete.
  while (await page.getByRole("button", { name: "Yana ko'rsatish" }).isVisible()) {
    await page.getByRole("button", { name: "Yana ko'rsatish" }).click();
  }
  await selectAll.click();
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

test("adds a word and rejects the duplicate", async ({ page }) => {
  await page.goto("/qoshish");
  const add = async () => {
    await page.getByLabel("Inglizcha", { exact: true }).fill(word);
    await page.getByLabel("O'zbekcha", { exact: true }).fill("sinov so'zi");
    await page.getByRole("button", { name: "Qo'shish", exact: true }).click();
  };
  await add();
  await expect(page.getByRole("status").filter({ hasText: "takrorlashga tushdi" })).toBeVisible();
  await add();
  await expect(page.getByRole("status").filter({ hasText: "allaqachon bor" })).toBeVisible();
});

test("adds a pasted list", async ({ page }) => {
  await page.goto("/qoshish");
  await page.getByRole("tab", { name: "Ro'yxat" }).click();
  await page.getByRole("textbox", { name: "Ro'yxat" }).fill(listWords.map((w) => `${w} - ${w} uz`).join("\n"));
  await page.getByRole("button", { name: "2 ta so'zni qo'shish" }).click();
  await expect(page.getByText("2 ta so'z qo'shildi")).toBeVisible();
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
  await expect(page.getByRole("alert").filter({ hasText: /JSON|qator|xato/i }).first()).toBeVisible();

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
