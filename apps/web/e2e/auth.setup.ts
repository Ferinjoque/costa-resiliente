import { test as setup, expect } from "@playwright/test";

const STATE = "e2e/.auth/coer.json";

/**
 * Signs in once and saves the session for every other spec.
 *
 * The API rate-limits login to 10 attempts per IP per 60 s (auth.py), which is
 * correct for a public emergency console and which a suite that logs in per test
 * trips immediately: the form then silently resets and every downstream
 * assertion fails for the wrong reason.
 */
setup("authenticate as COER Lima", async ({ page }) => {
  await page.goto("/");

  // The modal no longer opens by itself: it is raised from the rail's login
  // button. On a cold Next.js dev server that button is server-rendered and
  // clickable a beat before React attaches its handler, so a single click can
  // land on inert markup, silently do nothing, and fail the whole suite at
  // setup. Click until the modal actually appears rather than assuming the
  // first one took.
  const user = page.locator("#cr-username");
  const trigger = page.getByRole("button", { name: /^(Iniciar sesión|Log in)$/ }).first();
  await expect(trigger).toBeVisible();

  await expect(async () => {
    if (!(await user.isVisible())) {
      await trigger.click();
    }
    await expect(user).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  await page.locator("#cr-username").fill("coer_lima");
  await page.locator("#cr-password").fill("demo1234");
  await page.getByRole("button", { name: /^(Ingresar|Log in)$/ }).click();

  await expect(page.locator("#cr-username")).toBeHidden({ timeout: 20_000 });
  await expect(
    page.getByRole("button", { name: /Cerrar sesión|Log out/i }).first(),
  ).toBeVisible({ timeout: 10_000 });

  await page.context().storageState({ path: STATE });
});
