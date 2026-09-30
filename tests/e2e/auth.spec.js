// Mode Supabase (simulé) : connexion, mot de passe, double authentification, déconnexion.
import { test, expect, mockSupabase, login, EMAIL, TOTP } from "./fixtures.js";

test.afterEach(async ({ errors }) => {
  expect(errors).toEqual([]);
});

const openMenu = (page) => page.getByRole("button", { name: "Plus d'options" }).click();

test("mauvais mot de passe : message clair, pas d'accès", async ({ page }) => {
  await mockSupabase(page);
  await login(page, "faux");
  await expect(page.locator("#loginErr")).toHaveText("E-mail ou mot de passe incorrect.");
  await expect(page.locator("#app")).toBeHidden();
});

test("connexion puis chargement du planning", async ({ page }) => {
  const s = await mockSupabase(page, {
    items: [
      {
        id: "a1",
        title: "Depuis la base",
        kind: "task",
        start_date: "2026-09-30",
        recur: "daily",
        cat: "vert",
        done: {},
        skipped: {},
      },
    ],
  });
  await login(page);
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#board")).toContainText("Depuis la base");
  await openMenu(page);
  await expect(page.locator("#m-who")).toHaveText(`Connecté : ${EMAIL}`);
  await expect(page.getByRole("menuitem", { name: "Double authentification" })).toBeVisible();
  // Une seule vérification 2FA à la connexion : un seul appel à /user.
  expect(s.log.filter((r) => r.path === "/auth/v1/user").length).toBe(1);
});

test("changement de mot de passe : validations, refus serveur, puis succès", async ({ page }) => {
  const s = await mockSupabase(page, { samePasswordOnce: true });
  await login(page);
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Changer le mot de passe" }).click();

  const pw1 = page.getByLabel("Nouveau mot de passe");
  const pw2 = page.getByLabel("Confirmation");
  const save = page.getByRole("button", { name: "Changer", exact: true });

  await pw1.fill("court");
  await pw2.fill("court");
  await save.click();
  await expect(page.locator("#pwErr")).toContainText("12 caractères minimum");

  await pw1.fill("Un-mot-de-passe-solide-1");
  await pw2.fill("Un-mot-de-passe-different");
  await save.click();
  await expect(page.locator("#pwErr")).toHaveText("Les deux saisies ne sont pas identiques.");

  await pw2.fill("Un-mot-de-passe-solide-1");
  await save.click();
  await expect(page.locator("#pwErr")).toHaveText("Le nouveau mot de passe doit être différent de l'actuel.");

  await save.click();
  await expect(page.locator("#pwScrim")).toBeHidden();
  await expect(page.locator("#bar")).toContainText("Mot de passe changé");
  expect(s.log.some((r) => r.path === "/auth/v1/logout" && r.search === "?scope=others")).toBe(true);
});

test("activation puis désactivation de la double authentification", async ({ page }) => {
  const s = await mockSupabase(page);
  await login(page);
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Double authentification" }).click();
  await expect(page.locator(".mfa-state")).toHaveText("Désactivée");

  await page.getByRole("button", { name: "Activer" }).click();
  const qr = page.getByAltText("QR code à scanner avec ton application d'authentification");
  await expect(qr).toBeVisible();
  expect(await qr.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0); // autorisé par la CSP (data:)
  await expect(page.locator(".mfa-secret")).toHaveText("JBSWY3DPEHPK3PXP");

  const code = page.locator("#mfa-code");
  await code.fill("000000");
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page.locator("#mfaErr")).toContainText("Code incorrect ou expiré");

  await code.fill("123 456"); // collé tel qu'affiché par Aegis
  await code.press("Enter");
  await expect(page.locator(".mfa-state")).toHaveText("Active");
  expect(s.log.some((r) => r.path === "/auth/v1/logout" && r.search === "?scope=others")).toBe(true);

  const off = page.getByRole("button", { name: "Désactiver" });
  await off.click();
  await page.getByRole("button", { name: "Confirmer la désactivation" }).click();
  await expect(page.locator(".mfa-state")).toHaveText("Désactivée");
  expect(s.log.some((r) => r.method === "DELETE" && r.path === "/auth/v1/factors/factor-1")).toBe(true);
});

test("2FA active : code exigé, aucune donnée demandée avant", async ({ page }) => {
  const s = await mockSupabase(page, { factors: [{ id: "f9", factor_type: "totp", status: "verified" }] });
  await login(page);
  await expect(page.locator("#codeForm")).toBeVisible();
  await expect(page.locator("#app")).toBeHidden();
  expect(s.log.filter((r) => r.path.startsWith("/rest/"))).toEqual([]);

  const code = page.getByLabel("Code", { exact: true });
  await code.fill("12");
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page.locator("#codeErr")).toHaveText("Entre les 6 chiffres affichés par ton application.");

  await code.fill("999999");
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page.locator("#codeErr")).toContainText("Code incorrect ou expiré");

  await code.fill(TOTP);
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page.locator("#app")).toBeVisible();
  await expect.poll(() => s.log.some((r) => r.path === "/rest/v1/items")).toBe(true);
});

test("2FA active : se déconnecter depuis l'étape du code", async ({ page }) => {
  await mockSupabase(page, { factors: [{ id: "f9", factor_type: "totp", status: "verified" }] });
  await login(page);
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.locator("#loginForm")).toBeVisible();
});

test("la déconnexion ferme la session sur tous les appareils", async ({ page }) => {
  const s = await mockSupabase(page);
  await login(page);
  await expect(page.locator("#app")).toBeVisible();
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Se déconnecter (tous les appareils)" }).click();
  await expect(page.locator("#loginForm")).toBeVisible();
  expect(s.log.some((r) => r.path === "/auth/v1/logout" && r.search === "?scope=global")).toBe(true);
});

test("session conservée au rechargement", async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await expect(page.locator("#app")).toBeVisible();
  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#login")).toBeHidden();
});

test("refuse de démarrer avec une clé secrète dans config.js", async ({ page }) => {
  const s = await mockSupabase(page, { key: "sb_secret_ne_jamais_publier" });
  await page.goto("/");
  await expect(page.locator("#bar")).toContainText("clé secrète");
  expect(s.log).toEqual([]);
});
