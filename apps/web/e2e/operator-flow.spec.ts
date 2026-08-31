import { test, expect, type Page } from "@playwright/test";

/**
 * Walks the COER Lima duty officer's decision sequence against the real stack:
 * set context → check the map → act on alerts → query the copilot → review the
 * log. These are the surfaces a judge touches, so a failure here matters more
 * than any unit assertion.
 *
 * Requires `docker compose up -d` and a seeded scenario:
 *   TOKEN=$(curl -s -X POST localhost:8000/api/v1/auth/token \
 *     -d "username=coer_lima&password=demo1234" | jq -r .access_token)
 *   curl -X POST localhost:8000/api/v1/health/seed -H "Authorization: Bearer $TOKEN"
 */

const nav = (page: Page, id: string) => page.locator(`#driver-nav-${id}`);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(nav(page, "alerts")).toBeVisible();
});

test("app shell renders in Spanish without a client-side crash", async ({ page }) => {
  await expect(page).toHaveTitle(/Costa Resiliente/i);
  await expect(page.locator("body")).not.toContainText("Application error");
  await expect(page.locator("body")).not.toContainText("client-side exception");
  await expect(page.locator("body")).toContainText(/Alertas/);
});

test("the map canvas mounts", async ({ page }) => {
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 30_000 });
});

test("operational HUD reports a SINAGERD level and an alert count", async ({ page }) => {
  // The HUD is the duty officer's at-a-glance state; an empty one means the
  // health endpoint or its query broke.
  await expect(page.locator("body")).toContainText(/EMERGENCIA|ALERTA|AVISO|NORMAL/);
  await expect(page.locator("body")).toContainText(/alertas/i);
});

test("alerts panel lists the seeded scenario with response actions", async ({ page }) => {
  await nav(page, "alerts").click();

  await expect(page.getByText(/Lluvia intensa|Riesgo crítico de huayco/i).first())
    .toBeVisible({ timeout: 20_000 });
  // Every alert card must offer the SINAGERD actions, otherwise the feed is a
  // read-only list and the operator cannot act.
  await expect(page.getByRole("button", { name: /Reconocer/i }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Escalar/i }).first()).toBeVisible();
});

test("copilot answers a Spanish question with grounded data, not raw JSON", async ({ page }) => {
  // Quick-mode answers in a couple of seconds; the full-LLM path is bounded by
  // the agent's 25 s wall-clock budget, so this is generous even on cold CPU
  // inference.
  test.setTimeout(150_000);
  await nav(page, "ask").click();

  const box = page.getByPlaceholder(/Escribe tu consulta|Ask about the current situation/i);
  await expect(box).toBeVisible();
  await box.fill("¿Cuántas alertas activas hay?");
  await box.press("Enter");

  // Scope the assertion to the copilot panel: "alerta" also appears in the nav
  // rail, so asserting on <body> would pass without any answer at all.
  const body = page.getByLabel(/Consultar copiloto IA|AI copilot/i);
  await expect(body).toContainText(/EMERGENCIA|ALERTA|AVISO|NORMAL|alertas activas/i, {
    timeout: 120_000,
  });
  // Regression guard for the 2026-08-23 leak, where a free-form question was
  // answered with `Ronaldo\n{"name": "get_active_alerts", ...}`.
  await expect(body).not.toContainText('{"name":');
  await expect(body).not.toContainText('"arguments"');
});

test("decision log panel offers the EDAN-Perú exports", async ({ page }) => {
  await nav(page, "log").click();
  // The export buttons are icon-only, so the assertion goes through their
  // accessible names rather than visible text.
  await expect(page.getByRole("button", { name: /Exportar CSV|Export CSV/i }))
    .toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Exportar informe PDF|Export PDF report/i }))
    .toBeVisible();
});

test("the rail shows the signed-in operator identity", async ({ page }) => {
  // Session comes from e2e/auth.setup.ts. Every action lands in an append-only
  // audit trail, so the console must always show who is signed in.
  await expect(page.getByRole("button", { name: /Cerrar sesión|Log out/i }).first())
    .toBeVisible();
  await expect(page.locator("body")).toContainText(/coer_lima|COER/i);
});

test("locale toggle switches the shell to English", async ({ page }) => {
  await page.getByRole("button", { name: /^English$/ }).first().click();
  await expect(page.locator("body")).toContainText(/Alerts/);
});

test("no console errors during the core flow", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  for (const panel of ["alerts", "ask", "log"]) {
    await nav(page, panel).click();
    await page.waitForTimeout(700);
  }

  // Tile/network noise from an offline basemap is not a code defect; React and
  // JS runtime failures are.
  const real = errors.filter(
    (e) => !/favicon|tile|pmtiles|Failed to fetch|net::ERR|manifest|401/i.test(e),
  );
  expect(real, `console errors: ${real.join(" | ")}`).toEqual([]);
});

test("signing out does not bring the login prompt back", async ({ page }) => {
  // Background queries poll continuously and every one of them answers 401 once
  // the operator signs out. The prompt used to reappear seconds later, on a
  // loop, which is what a duty officer would experience as the console nagging
  // them.
  test.setTimeout(60_000);

  await page.getByRole("button", { name: /Cerrar sesión|Sign out/i }).first().click();
  await page.getByRole("button", { name: /^(Salir|Sign out)$/ }).click();

  await expect(page.getByRole("button", { name: /^(Iniciar sesión|Log in)$/ }).first())
    .toBeVisible();

  // Long enough for several refetch cycles to answer 401.
  await page.waitForTimeout(20_000);
  await expect(page.locator("#cr-username")).toBeHidden();
});

test("the login modal can be dismissed with its close button", async ({ page }) => {
  await page.getByRole("button", { name: /Cerrar sesión|Sign out/i }).first().click();
  await page.getByRole("button", { name: /^(Salir|Sign out)$/ }).click();
  await page.getByRole("button", { name: /^(Iniciar sesión|Log in)$/ }).first().click();
  await expect(page.locator("#cr-username")).toBeVisible();

  await page.getByRole("dialog").getByRole("button", { name: /^(Cerrar|Close)$/ }).click();
  await expect(page.locator("#cr-username")).toBeHidden();
});

test("hovering a rail item does not shift the alert badge", async ({ page }) => {
  // The badge width tracks the live active-alert count, so a count that ticks
  // from 9 to 10 mid-test widens it by a digit and reads as a hover shift. The
  // count is pinned here so the assertion measures layout and nothing else.
  // Match on the exact pathname: a "**/api/v1/alerts?**" glob misses the
  // no-query-string call the app actually makes, and a looser "alerts**" glob
  // would swallow /alerts/stream and /alerts/decision-log too.
  await page.route(
    (url) => url.pathname.replace(/\/$/, "").endsWith("/api/v1/alerts"),
    async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const rows = Array.isArray(body) ? body : (body?.items ?? []);
      const pinned = rows.slice(0, 9).map((row: Record<string, unknown>) => ({
        ...row, status: "active",
      }));
      await route.fulfill({
        response,
        body: JSON.stringify(Array.isArray(body) ? pinned : { ...body, items: pinned }),
      });
    },
  );
  await page.reload();

  const badge = page.locator("#driver-nav-alerts span").filter({ hasText: /^\d+$/ }).first();
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText("9");
  const before = await badge.boundingBox();

  await page.locator("#driver-nav-map").hover();
  await page.waitForTimeout(300);
  await page.locator("#driver-nav-alerts").hover();
  await page.waitForTimeout(300);

  // Guard the premise: if the count changed anyway the box comparison is void.
  await expect(badge).toHaveText("9");
  const after = await badge.boundingBox();
  expect(before, "badge should have a box before hover").not.toBeNull();
  expect(after, "badge should have a box after hover").not.toBeNull();
  expect(Math.abs((after!.x) - (before!.x)), "badge moved horizontally on hover").toBeLessThanOrEqual(1);
});

test("the scale bar sits beside the zoom buttons, clear of the panels", async ({ page }) => {
  // It used to render bottom-left, where it tucked under the Scenario panel and
  // overlapped the "Vista 3D" row.
  await page.locator("canvas.maplibregl-canvas").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1500);

  const scale = await page.locator(".maplibregl-ctrl-scale").boundingBox();
  const zoom = await page.locator(".maplibregl-ctrl-group").first().boundingBox();
  const viewport = page.viewportSize();
  expect(scale, "scale control missing").not.toBeNull();
  expect(zoom, "zoom control missing").not.toBeNull();
  expect(viewport).not.toBeNull();

  // Right-hand side of the map, not tucked under the left rail or panels.
  expect(scale!.x, "scale drifted back to the left half").toBeGreaterThan(viewport!.width / 2);
  // Immediately left of the zoom buttons, not stacked above them.
  expect(scale!.x + scale!.width, "scale overlaps the zoom buttons")
    .toBeLessThanOrEqual(zoom!.x + 1);
  // Bottom edges line up.
  expect(
    Math.abs((scale!.y + scale!.height) - (zoom!.y + zoom!.height)),
    "scale and zoom bottoms are not aligned",
  ).toBeLessThanOrEqual(4);
});
