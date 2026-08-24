import { test as setup, expect } from "@playwright/test";

const STATE = "e2e/.auth/coer.json";

/**
 * Signs in once and saves the session for every other spec.
 *
 * The API rate-limits login to 10 attempts per IP per 60 s (auth.py), which is
 * correct for a public emergency console and which a suite that logs in per test
 * trips immediately — the form then silently resets and every downstream
 * assertion fails for the wrong reason.
 */
setup("authenticate as COER Lima", async ({ page }) => {
  await page.goto("/");

  // The app raises the login modal by itself for an unauthenticated visitor.
  // Its backdrop covers the rail, so clicking "Iniciar sesión" underneath just
  // times out on an intercepted pointer event.
  const user = page.locator("#cr-username");
  const autoOpened = await user
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (!autoOpened) {
    await page.getByRole("button", { name: /^(Iniciar sesión|Log in)$/ }).first().click();
    await expect(user).toBeVisible();
  }

  await page.locator("#cr-username").fill("coer_lima");
  await page.locator("#cr-password").fill("demo1234");
  await page.getByRole("button", { name: /^(Ingresar|Log in)$/ }).click();

  await expect(page.locator("#cr-username")).toBeHidden({ timeout: 20_000 });
  await expect(
    page.getByRole("button", { name: /Cerrar sesión|Log out/i }).first(),
  ).toBeVisible({ timeout: 10_000 });

  await page.context().storageState({ path: STATE });
});
