import { expect, test } from "@playwright/test";

test.describe("App shell (unauthenticated)", () => {
  test("protected pages redirect to /login", async ({ page }) => {
    await page.goto("/bugun");
    await expect(page).toHaveURL(/\/login\?next=%2Fbugun/);
    await expect(page.getByRole("heading", { name: "Kirish" })).toBeVisible();
  });

  test("login form validates input in Uzbek", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Kirish" }).click();
    await expect(page.getByText("To'g'ri email kiriting")).toBeVisible();
  });

  test("no horizontal scroll at 360px", async ({ page }) => {
    await page.goto("/login");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("web app manifest is served", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const json = (await res.json()) as { short_name: string; start_url: string };
    expect(json.short_name).toBe("LL");
    expect(json.start_url).toBe("/bugun");
  });
});
