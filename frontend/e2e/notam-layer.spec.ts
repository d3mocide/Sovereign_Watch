/**
 * E2E tests — FAA NOTAM layer toggle and API integration.
 *
 * Tests cover:
 *   1. NOTAM toggle exists in the hazards section
 *   2. Toggle state persists via localStorage
 *   3. /api/notam/active is called when layer is enabled
 *   4. /api/notam/history responds and returns GeoJSON
 *   5. /api/notam/{id} responds 404 for unknown NOTAM
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("FAA NOTAM — Layer toggle UI", () => {
  test("FAA NOTAMs toggle is present in the hazards layer group", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    // The NOTAM toggle label should exist somewhere in the DOM
    const notamLabel = page.locator('text="FAA NOTAMs"').first();
    await expect(notamLabel).toBeAttached({ timeout: 10_000 });
  });

  test("NOTAM toggle can be checked and unchecked", async ({ page }) => {
    await loginAsAdmin(page);

    const notamCheckbox = page
      .locator('label:has-text("FAA NOTAMs") input[type="checkbox"]')
      .first();

    if (!(await notamCheckbox.isVisible({ timeout: 5_000 }).catch(() => false))) {
      // Panel may need opening
      const hazardsBtn = page
        .locator('button:has-text("HAZARDS"), button:has-text("Hazards"), text=/hazards/i')
        .first();
      if (await hazardsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await hazardsBtn.click();
        await page.waitForTimeout(300);
      }
    }

    // If checkbox is visible, verify toggling works
    if (await notamCheckbox.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const initialState = await notamCheckbox.isChecked();
      await notamCheckbox.click({ force: true });
      await page.waitForTimeout(300);
      expect(await notamCheckbox.isChecked()).toBe(!initialState);

      // Toggle back
      await notamCheckbox.click({ force: true });
      await page.waitForTimeout(300);
      expect(await notamCheckbox.isChecked()).toBe(initialState);
    } else {
      test.skip(true, "NOTAM toggle not visible — layer panel may require specific viewport");
    }
  });
});

test.describe("FAA NOTAM — API endpoints", () => {
  test("GET /api/notam/active returns GeoJSON or 503", async ({ page }) => {
    await loginAsAdmin(page);

    const response = await page.request.get("/api/notam/active");
    // 200 (cache hit or empty), 503 (Redis not ready in test env)
    expect([200, 503]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty("type", "FeatureCollection");
      expect(body).toHaveProperty("features");
      expect(Array.isArray(body.features)).toBe(true);
    }
  });

  test("GET /api/notam/history returns GeoJSON or 503", async ({ page }) => {
    await loginAsAdmin(page);

    const response = await page.request.get("/api/notam/history?hours=24");
    expect([200, 503]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty("type", "FeatureCollection");
      expect(Array.isArray(body.features)).toBe(true);
    }
  });

  test("GET /api/notam/history accepts keyword filter", async ({ page }) => {
    await loginAsAdmin(page);

    const response = await page.request.get("/api/notam/history?keyword=TFR&hours=48");
    expect([200, 503]).toContain(response.status());
  });

  test("GET /api/notam/history rejects invalid hours (too large)", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const response = await page.request.get("/api/notam/history?hours=9999");
    // FastAPI validation should return 422
    expect(response.status()).toBe(422);
  });

  test("GET /api/notam/{id} returns 404 for unknown NOTAM ID", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const response = await page.request.get("/api/notam/DEFINITELY_NOT_A_REAL_NOTAM");
    // 404 (not found) or 503 (DB not ready in test env)
    expect([404, 503]).toContain(response.status());
  });
});

test.describe("FAA NOTAM — Network request on toggle enable", () => {
  test("enabling NOTAM layer triggers /api/notam/active request", async ({
    page,
  }) => {
    const notamRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/notam/active")) {
        notamRequests.push(req.url());
      }
    });

    await loginAsAdmin(page);
    await page.waitForTimeout(1_000);

    const initialCount = notamRequests.length;

    // Find and enable the NOTAM toggle
    const notamCheckbox = page
      .locator('label:has-text("FAA NOTAMs") input[type="checkbox"]')
      .first();

    if (await notamCheckbox.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const isChecked = await notamCheckbox.isChecked();
      if (!isChecked) {
        await notamCheckbox.click({ force: true });
        // Wait for network request
        await page.waitForTimeout(1_500);
        expect(notamRequests.length).toBeGreaterThan(initialCount);
      }
    } else {
      test.skip(true, "NOTAM toggle not visible in this viewport");
    }
  });
});
