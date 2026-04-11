/**
 * Shared E2E test helpers and Page Object Models for Sovereign Watch.
 */

import type { Page } from "@playwright/test";

// ── Auth helper ───────────────────────────────────────────────────────────────

/**
 * Log in with the default admin credentials.
 * Waits for the main map view to be ready before returning.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/");

  // Fill login form if it appears (may already be authed in dev via cookie)
  const usernameInput = page.locator('input[name="username"], input[type="text"]').first();
  if (await usernameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await usernameInput.fill("admin");
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await passwordInput.fill("admin");
    await page.keyboard.press("Enter");
  }

  // Wait for the map canvas to be present — indicates successful login + app load
  await page.waitForSelector("canvas", { timeout: 20_000 });
}

// ── Layer toggle helpers ──────────────────────────────────────────────────────

/**
 * Open the layer visibility panel if it isn't already open.
 */
export async function openLayerPanel(page: Page): Promise<void> {
  // The layer panel button typically has a "Layers" aria-label or contains the Layers icon
  const panel = page.locator('[data-testid="layer-visibility-controls"]');
  if (!(await panel.isVisible({ timeout: 2_000 }).catch(() => false))) {
    await page.locator('button[aria-label="Layers"], button:has([data-lucide="layers"])').first().click();
    await page.waitForTimeout(300);
  }
}

/**
 * Toggle a named layer checkbox by its label text.
 * Returns the new checked state.
 */
export async function toggleLayer(page: Page, labelText: string): Promise<boolean> {
  const label = page.locator(`label:has-text("${labelText}")`).first();
  await label.click();
  await page.waitForTimeout(200);
  const checkbox = label.locator('input[type="checkbox"]');
  return checkbox.isChecked();
}

// ── Mission area helpers ──────────────────────────────────────────────────────

/**
 * Set the mission area via the mission config panel.
 * Assumes the panel is reachable from the main nav.
 */
export async function setMissionArea(
  page: Page,
  lat: number,
  lon: number,
  radiusNm: number = 150,
): Promise<void> {
  // Open mission config (exact selector depends on UI — adjust to match real component)
  const configBtn = page
    .locator('button:has-text("Mission"), button[aria-label*="mission" i]')
    .first();
  if (await configBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await configBtn.click();
  }

  await page.fill('input[name="lat"], input[placeholder*="lat" i]', String(lat));
  await page.fill('input[name="lon"], input[placeholder*="lon" i]', String(lon));

  const radiusInput = page.locator('input[name="radius"], input[placeholder*="radius" i]');
  if (await radiusInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await radiusInput.fill(String(radiusNm));
  }

  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
}
