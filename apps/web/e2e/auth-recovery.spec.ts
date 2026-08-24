import { test, expect } from "@playwright/test";

/**
 * What happens when an operator acts without a session.
 *
 * Acting used to fail twice over: the action threw an unhandled AuthError that
 * raised the Next.js error overlay across the console, and the toast said the
 * step had been "marcado localmente" with no way to fix it. A copilot question
 * was simply dropped, so the operator had to retype it after signing in.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("acknowledge while signed out prompts a login instead of throwing", async ({ page }) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto("/");
  await page.locator("#cr-username").waitFor({ state: "visible", timeout: 15_000 });
  // Dismiss the auto-raised prompt: we want the one the action itself raises.
  await page.getByRole("dialog").getByRole("button", { name: /^(Cerrar|Close)$/ }).click();
  await expect(page.locator("#cr-username")).toBeHidden();

  await page.locator("#driver-nav-alerts").click();
  await page.getByRole("button", { name: /Reconocer/i }).first().click();

  // The action needs a session, so the console offers one.
  await expect(page.locator("#cr-username")).toBeVisible({ timeout: 15_000 });
  expect(pageErrors, `unhandled errors: ${pageErrors.join(" | ")}`).toEqual([]);
});

test("a copilot question survives the login it triggers", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.locator("#cr-username").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("dialog").getByRole("button", { name: /^(Cerrar|Close)$/ }).click();

  await page.locator("#driver-nav-ask").click();
  const box = page.getByPlaceholder(/Escribe tu consulta|Ask about the current situation/i);
  await box.fill("¿Cuántas alertas activas hay?");
  await box.press("Enter");

  await expect(page.locator("#cr-username")).toBeVisible({ timeout: 20_000 });
  await page.locator("#cr-username").fill("coer_lima");
  await page.locator("#cr-password").fill("demo1234");
  await page.getByRole("button", { name: /^Ingresar$/ }).click();

  // Held question is resent automatically: no retyping, no second send.
  const panel = page.getByLabel(/Consultar copiloto IA|AI copilot/i);
  await expect(panel).toContainText(/EMERGENCIA|ALERTA|AVISO|NORMAL|alertas activas/i, {
    timeout: 90_000,
  });
});
