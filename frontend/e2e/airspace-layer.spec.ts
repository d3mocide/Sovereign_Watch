/**
 * E2E tests for the OpenAIP Airspace Zones layer.
 *
 * Covers:
 *   - /api/airspace/zones    responds (200 or 503 when backend unavailable)
 *   - /api/airspace/history  responds with correct shape
 *   - /api/airspace/types    responds with correct shape
 *   - "AIRSPACE ZONES" toggle appears in layer controls
 *   - Toggling the layer does not crash the map
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin, openLayerPanel } from "./helpers";

test.describe("Airspace Layer — API endpoints", () => {
  test("/api/airspace/zones returns 200 or 503", async ({ page }) => {
    await loginAsAdmin(page);
    const response = await page.request.get("/api/airspace/zones");
    expect([200, 503]).toContain(response.status());
  });

  test("/api/airspace/zones body is a GeoJSON FeatureCollection on hit", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const response = await page.request.get("/api/airspace/zones");

    // Only assert shape when backend is up (503 means Redis unavailable — skip)
    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty("type", "FeatureCollection");
      expect(body).toHaveProperty("features");
      expect(Array.isArray(body.features)).toBe(true);
    }
  });

  test("/api/airspace/history accepts hours param and returns FeatureCollection", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const response = await page.request.get("/api/airspace/history?hours=24");
    expect([200, 503]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body.type).toBe("FeatureCollection");
      expect(Array.isArray(body.features)).toBe(true);
    }
  });

  test("/api/airspace/history rejects hours > 720 with 422", async ({ page }) => {
    await loginAsAdmin(page);
    const response = await page.request.get("/api/airspace/history?hours=9999");
    // 422 Unprocessable Entity (FastAPI validation) — even if backend is down it
    // should be caught at the routing layer before the DB check
    expect(response.status()).toBe(422);
  });

  test("/api/airspace/history accepts zone_type filter", async ({ page }) => {
    await loginAsAdmin(page);
    const response = await page.request.get(
      "/api/airspace/history?zone_type=DANGER",
    );
    expect([200, 503]).toContain(response.status());
  });

  test("/api/airspace/history accepts country filter", async ({ page }) => {
    await loginAsAdmin(page);
    const response = await page.request.get("/api/airspace/history?country=US");
    expect([200, 503]).toContain(response.status());
  });

  test("/api/airspace/types returns summary list on success", async ({ page }) => {
    await loginAsAdmin(page);
    const response = await page.request.get("/api/airspace/types");
    expect([200, 503]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty("types");
      expect(Array.isArray(body.types)).toBe(true);
      // Each entry should have 'type' and 'count'
      for (const entry of body.types) {
        expect(entry).toHaveProperty("type");
        expect(entry).toHaveProperty("count");
        expect(typeof entry.count).toBe("number");
      }
    }
  });
});

test.describe("Airspace Layer — UI controls", () => {
  test("layer panel contains an airspace zones control", async ({ page }) => {
    await loginAsAdmin(page);
    await openLayerPanel(page);

    // The LayerVisibilityControls renders "AIRSPACE ZONES" as a toggle label
    const airspaceControl = page.locator("text=/airspace zones/i").first();
    await expect(airspaceControl).toBeAttached({ timeout: 10_000 });
  });

  test("toggling airspace zones layer does not crash the map", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await loginAsAdmin(page);
    await openLayerPanel(page);

    // Try to find and click the airspace label; skip if not visible (CI without full UI)
    const airspaceLabel = page.locator("label:has-text('AIRSPACE ZONES')").first();
    if (await airspaceLabel.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await airspaceLabel.click();
      await page.waitForTimeout(500);
      // Toggle back
      await airspaceLabel.click();
      await page.waitForTimeout(500);
    }

    const fatalErrors = errors.filter(
      (e) =>
        !e.includes("WebGL") &&
        !e.includes("ResizeObserver") &&
        !e.includes("Non-Error promise rejection"),
    );
    expect(fatalErrors).toHaveLength(0);
  });
});
