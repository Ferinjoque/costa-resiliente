import { test, expect } from "@playwright/test";

/**
 * Signed out, the console is a read-only view. It used to poll the decision log,
 * the proposals queue and the notification deliveries anyway, filling the
 * browser console with 401s and failing silently when an export was clicked.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("no authenticated requests fire without a session", async ({ page }) => {
  test.setTimeout(90_000);
  const unauthorised: string[] = [];
  page.on("response", (res) => {
    if (res.status() === 401) unauthorised.push(res.url().replace(/^https?:\/\/[^/]+/, ""));
  });

  await page.goto("/");
  await page.locator("canvas.maplibregl-canvas").waitFor({ state: "visible", timeout: 30_000 });

  // Nothing to dismiss: with the authenticated queries gated there is no 401 to
  // trigger the modal, so arriving signed out no longer throws a login prompt at
  // the operator.
  await expect(page.locator("#cr-username")).toBeHidden();

  // Long enough for the 30s and 60s pollers to have fired at least once had
  // they been running.
  await page.waitForTimeout(35_000);

  expect(unauthorised, `401s while signed out: ${unauthorised.join(", ")}`).toEqual([]);
});

test("session-only panels route to the login instead of opening empty", async ({ page }) => {
  await page.goto("/");
  await page.locator("canvas.maplibregl-canvas").waitFor({ state: "visible", timeout: 30_000 });

  // Locked, and its tooltip says so.
  const log = page.locator("#driver-nav-log");
  await expect(log).toHaveAttribute("title", /inicia sesión|sign in/i);

  // Clicking asks for a session rather than opening a panel with nothing in it.
  await log.click();
  await expect(page.locator("#cr-username")).toBeVisible({ timeout: 15_000 });
});
