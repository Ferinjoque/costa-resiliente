import { test, expect, type Page } from "@playwright/test";

/**
 * 3D idle rotation must continue from wherever the operator left the camera.
 *
 * The rotation loop used to cache the bearing in a local when it started and
 * write `cached + 0.08` on every tick. Any camera move made during the pause was
 * therefore discarded on the next tick and the map snapped back to the bearing
 * held from before the interaction. On screen that reads as the camera
 * teleporting to a default position a few seconds after you stop touching it,
 * which is what a duty officer sees after framing a quebrada and letting go.
 *
 * Interaction is driven from the keyboard rather than by dragging the canvas.
 * MapLibre treats both as user input and stamps the same originalEvent the
 * rotation loop watches, but dragging a WebGL surface under a headless GPU is
 * slow enough to consume the whole test budget before any assertion runs.
 */

const PAUSE_MS = 4000;
const ROTATE_DEG_PER_FRAME = 0.08;

type Camera = { bearing: number; pitch: number; lng: number; lat: number; zoom: number };

async function camera(page: Page): Promise<Camera> {
  return page.evaluate(() => {
    const map = (window as unknown as { __crMap?: {
      getBearing(): number; getPitch(): number; getZoom(): number;
      getCenter(): { lng: number; lat: number };
    } }).__crMap;
    if (!map) throw new Error("map handle missing");
    const c = map.getCenter();
    return {
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      lng: c.lng,
      lat: c.lat,
      zoom: map.getZoom(),
    };
  });
}

/** Shortest signed distance between two compass bearings, in degrees. */
function bearingDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

async function enable3D(page: Page) {
  await page.goto("/");
  await page.locator("canvas.maplibregl-canvas").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1200);

  const toggle = page.getByRole("switch", { name: /Vista 3D|3D view/i }).first();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  // The entry ease runs 2s and rotation starts ~100ms after it.
  await page.waitForTimeout(3200);
  expect((await camera(page)).pitch, "3D never engaged").toBeGreaterThan(30);
  return toggle;
}

/**
 * Rotate the camera the way an operator would, then report where they left it.
 * Shift+Arrow is MapLibre's keyboard rotate.
 */
async function operatorRotates(page: Page): Promise<Camera> {
  await page.locator("canvas.maplibregl-canvas").focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.waitForTimeout(800);
  return camera(page);
}

test.describe("3D idle rotation", () => {
  test.describe.configure({ mode: "serial" });

  test("resumes from the bearing the operator left, not a default one", async ({ page }) => {
    test.setTimeout(90_000);
    const toggle = await enable3D(page);

    const left = await operatorRotates(page);
    expect(Math.abs(left.bearing), "keyboard rotate did not move the camera").toBeGreaterThan(5);

    await page.waitForTimeout(PAUSE_MS + 2000);
    const resumed = await camera(page);

    // Still in 3D: a collapsed pitch would mean the view exited rather than
    // rotated, and the bearing check below could then pass for the wrong reason.
    expect(resumed.pitch, "view dropped out of 3D").toBeGreaterThan(30);
    expect(await toggle.getAttribute("aria-checked"), "3D toggle flipped itself off").toBe("true");

    const drift = bearingDelta(left.bearing, resumed.bearing);
    const where =
      `left at ${left.bearing.toFixed(1)}deg, resumed at ${resumed.bearing.toFixed(1)}deg`;

    // Rotation only ever advances, and 2s of it at 0.08deg per frame is a few
    // degrees. The regression jumped tens of degrees back to the pre-interaction
    // bearing, so a large or negative delta is the teleport returning.
    expect(drift, `camera did not keep rotating: ${where}`).toBeGreaterThan(0);
    expect(drift, `camera teleported away from where it was left: ${where}`)
      .toBeLessThan(ROTATE_DEG_PER_FRAME * 30 * 4);
  });

  test("keeps the centre and zoom the operator chose", async ({ page }) => {
    test.setTimeout(90_000);
    await enable3D(page);

    await page.locator("canvas.maplibregl-canvas").focus();
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(900);
    const left = await camera(page);

    await page.waitForTimeout(PAUSE_MS + 2000);
    const resumed = await camera(page);

    // Idle rotation changes bearing only; centre and zoom must survive it.
    expect(Math.abs(resumed.lng - left.lng), "centre longitude moved").toBeLessThan(0.05);
    expect(Math.abs(resumed.lat - left.lat), "centre latitude moved").toBeLessThan(0.05);
    expect(Math.abs(resumed.zoom - left.zoom), "zoom changed").toBeLessThan(0.2);
  });

  test("holds still while the operator is interacting", async ({ page }) => {
    test.setTimeout(90_000);
    await enable3D(page);

    const left = await operatorRotates(page);
    // Well inside the 4s pause: the camera must not have drifted yet.
    await page.waitForTimeout(1000);
    const during = await camera(page);

    expect(
      Math.abs(bearingDelta(left.bearing, during.bearing)),
      "camera rotated during the interaction pause",
    ).toBeLessThan(1.5);
  });
});
