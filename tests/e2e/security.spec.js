// Protections côté navigateur : en-têtes HTTP, CSP, anti-clickjacking.
import { test, expect } from "./fixtures.js";

test("en-têtes de sécurité envoyés avec la page", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("script-src 'self'");
  expect(h["content-security-policy"]).not.toContain("unsafe-inline");
  expect(h["content-security-policy"]).not.toContain("unsafe-eval");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["cross-origin-opener-policy"]).toBe("same-origin");
});

test("la CSP de la page reprend celle de l'en-tête", async ({ page, request }) => {
  await page.goto("/#demo");
  const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  const header = (await request.get("/")).headers()["content-security-policy"];
  expect(header).toBe(`${meta}; frame-ancestors 'none'`);
});

test("aucune violation de CSP pendant l'utilisation", async ({ page, errors }) => {
  await page.goto("/#demo");
  await expect(page.locator(".ev").first()).toBeVisible();
  await page.locator(".ev").first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Plus d'options" }).click();
  await page.getByRole("menuitemradio", { name: "Sombre" }).click();
  expect(errors).toEqual([]);
});

test("un script injecté dans la page n'est pas exécuté", async ({ page }) => {
  await page.goto("/#demo");
  const blocked = await page.evaluate(
    () =>
      new Promise((resolve) => {
        document.addEventListener("securitypolicyviolation", (e) => resolve(e.effectiveDirective), { once: true });
        const s = document.createElement("script");
        s.textContent = "window.__injected = true";
        document.body.append(s);
        setTimeout(() => resolve(window.__injected ? "exécuté" : "rien"), 1000);
      }),
  );
  expect(blocked).toBe("script-src-elem");
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
});

test("un attribut style injecté est bloqué", async ({ page }) => {
  await page.goto("/#demo");
  const directive = await page.evaluate(
    () =>
      new Promise((resolve) => {
        document.addEventListener("securitypolicyviolation", (e) => resolve(e.effectiveDirective), { once: true });
        const d = document.createElement("div");
        d.innerHTML = '<p style="color:red">x</p>';
        document.body.append(d);
        setTimeout(() => resolve("aucune"), 1000);
      }),
  );
  expect(directive).toBe("style-src-attr");
});

test("un autre site ne peut pas afficher l'application dans un cadre", async ({ page }) => {
  await page.goto("http://localhost:4174/");
  const frame = page.frameLocator("#victim");
  await page.waitForTimeout(1000);
  await expect(frame.locator(".ev")).toHaveCount(0);
});
