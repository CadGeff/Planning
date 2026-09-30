// Application installable : après une première visite, elle s'ouvre sans réseau.
import { test, expect } from "./fixtures.js";

test.use({ serviceWorkers: "allow" });

test("s'ouvre hors connexion grâce au service worker", async ({ page, context }) => {
  await page.goto("/#demo");
  await expect(page.locator(".ev").first()).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator(".ev").first()).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".ev").first()).toBeVisible();
  await context.setOffline(false);
});
