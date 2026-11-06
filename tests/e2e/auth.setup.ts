import { expect, test as setup } from "@playwright/test";

export const AUTH_FILE = "playwright/.auth/user.json";

/**
 * Logs in once with the dedicated E2E account and stores the session for
 * the authenticated tests. Credentials come from E2E_EMAIL / E2E_PASSWORD
 * (a separate test user — never the real learning account).
 */
setup("log in", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  setup.skip(!email || !password, "E2E_EMAIL / E2E_PASSWORD not set");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Parol").fill(password!);
  await page.getByRole("button", { name: "Kirish" }).click();
  await expect(page).toHaveURL(/\/bugun/);
  await page.context().storageState({ path: AUTH_FILE });
});
