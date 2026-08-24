import { test, expect } from "@playwright/test";

/**
 * Mobile surfaces are a different component tree, not a narrower desktop: the
 * left rail is `hidden sm:flex` and navigation moves into a bottom tab bar, with
 * SituationBrief replacing the desktop HUD. A COEL coordinator in the field is a
 * real user, so these get their own coverage.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("bottom tab bar replaces the desktop rail", async ({ page }) => {
  const tabs = page.getByRole("navigation", { name: /Navegación|Navigation/ });
  await expect(tabs).toBeVisible();
  await expect(page.locator("aside[aria-label*='Navegación principal']")).toBeHidden();
});

test("map fills the viewport without horizontal overflow", async ({ page }) => {
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 30_000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  // A duty officer scrolling sideways to read an alert is a broken layout.
  expect(overflow).toBeLessThanOrEqual(1);
});

test("alerts are reachable from the bottom bar", async ({ page }) => {
  const tabs = page.getByRole("navigation", { name: /Navegación|Navigation/ });
  await tabs.getByRole("button", { name: /Alertas|Alerts/i }).click();

  // Above the fold on a phone: the panel header, the live indicator and the
  // population-at-risk callout — the numbers a COEL coordinator needs first.
  await expect(page.getByText(/EN VIVO|LIVE/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/personas en zona inundada|people in flooded/i).first())
    .toBeVisible();

  // The alert cards themselves live further down this bottom sheet's own scroll
  // container; their rendering is covered by the desktop spec. What matters on a
  // phone is that the sheet opens with the decision-critical numbers first.
  await expect(page.getByText(/Activas|Active/i).first()).toBeVisible();
});

test("no console errors on mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const tabs = page.getByRole("navigation", { name: /Navegación|Navigation/ });
  await tabs.getByRole("button", { name: /Alertas|Alerts/i }).click();
  await page.waitForTimeout(1000);

  const real = errors.filter(
    (e) => !/favicon|tile|pmtiles|Failed to fetch|net::ERR|manifest|401/i.test(e),
  );
  expect(real, `console errors: ${real.join(" | ")}`).toEqual([]);
});
