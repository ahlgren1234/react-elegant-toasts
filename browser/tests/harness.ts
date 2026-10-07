import type { Page } from '@playwright/test';

// Shared helpers for the P-22 specs.

/** Opens a fresh harness page and waits until the stylesheet has loaded and the Toaster is mounted. */
export async function openHarness(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__retHarness !== undefined);
}
