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

test("sauvegarde : le menu rappelle la dernière, l'export la met à jour", async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await expect(page.locator("#app")).toBeVisible();
  await openMenu(page);
  await expect(page.locator("#m-backup")).toHaveText("Aucune sauvegarde faite depuis cet appareil.");
  await expect(page.locator("#menuBtn")).not.toHaveClass(/has-note/);
  await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Exporter mon planning (JSON)" }).click(),
  ]);
  await openMenu(page);
  await expect(page.locator("#m-backup")).toHaveText("Dernière sauvegarde : aujourd'hui.");
});

test("sauvegarde de plus de 30 jours : pastille sur le menu, levée par un export", async ({ page }) => {
  await mockSupabase(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem("semainier.lastExport"))
      localStorage.setItem("semainier.lastExport", "2026-01-01T10:00:00.000Z");
  });
  await login(page);
  const btn = page.locator("#menuBtn");
  await expect(btn).toHaveClass(/has-note/);
  await expect(btn).toHaveAttribute("aria-label", "Plus d'options (sauvegarde à refaire)");
  await btn.click();
  await expect(page.locator("#m-backup")).toHaveText(
    /^Dernière sauvegarde : il y a \d+ jours\. Pense à en refaire une\.$/,
  );
  await expect(page.locator("#m-backup")).toHaveClass(/late/);
  await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Exporter mon planning (JSON)" }).click(),
  ]);
  await expect(btn).not.toHaveClass(/has-note/);
  await expect(btn).toHaveAttribute("aria-label", "Plus d'options");
});

test("restauration sur un compte vide : éléments et noms des catégories renvoyés à la base", async ({ page }) => {
  const s = await mockSupabase(page);
  await login(page);
  await expect(page.locator("#app")).toBeVisible();
  const backup = {
    app: "semainier",
    format: 2,
    labels: { bleu: "Boulot", vert: "Sport & santé", ambre: "Admin", rose: "Rendez-vous", gris: "Perso" },
    items: [
      { id: "ancien", title: "Restauré", kind: "task", start: "2026-09-30", recur: "daily", cat: "bleu", done: {} },
      { title: "<img src=x onerror=alert(1)>", kind: "task", start: "2026-09-30", recur: "daily", cat: "vert" },
    ],
  };
  await page.locator("#importFile").setInputFiles({
    name: "semainier.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator("#bar")).toContainText("2 éléments importés, noms des catégories restaurés.");
  await expect(page.locator("#legend")).toContainText("Boulot");
  expect(s.items.map((r) => r.title)).toEqual(["Restauré", "<img src=x onerror=alert(1)>"]);
  expect(s.items[0].id).not.toBe("ancien");
  expect(s.settings.cat_labels.bleu).toBe("Boulot");
  // Le titre piégé s'affiche comme du texte : aucune balise créée.
  await expect(page.locator("#board img")).toHaveCount(0);
});

const backupFile = (data) => ({
  name: "semainier.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify(data)),
});
const oneTask = { title: "En base", kind: "task", start: "2026-09-30", recur: "daily", cat: "vert" };

test("planning non chargé : ni export ni import, pour ne pas sauvegarder du vide ni créer de doublons", async ({
  page,
}) => {
  const s = await mockSupabase(page, {
    fail: { itemsGet: 1 },
    items: [{ id: "a1", ...oneTask, start_date: oneTask.start }],
  });
  await login(page);
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#bar .status")).not.toHaveText("");
  await page.locator("#importFile").setInputFiles(backupFile({ items: [oneTask] }));
  await expect(page.locator("#bar")).toContainText("Le planning n'est pas chargé");
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Exporter mon planning (JSON)" }).click();
  await expect(page.locator("#bar")).toContainText("Le planning n'est pas chargé");
  expect(await page.evaluate(() => localStorage.getItem("semainier.lastExport"))).toBeNull();
  expect(s.log.some((r) => r.method === "POST" && r.path === "/rest/v1/items")).toBe(false);
  expect(s.items).toHaveLength(1);
});

test("import interrompu par une panne : rien d'affiché à tort, le second essai aboutit", async ({ page }) => {
  const s = await mockSupabase(page, { fail: { itemsPost: 1 } });
  await login(page);
  await expect(page.locator("#app")).toBeVisible();
  const input = page.locator("#importFile");
  await input.setInputFiles(backupFile({ items: [oneTask], labels: { bleu: "Boulot" } }));
  await expect(page.locator("#bar .status")).toHaveClass(/warn/);
  await expect(page.locator("#board")).not.toContainText("En base");
  await expect(page.locator("#legend")).not.toContainText("Boulot");
  expect(s.items).toHaveLength(0);

  await input.setInputFiles(backupFile({ items: [oneTask], labels: { bleu: "Boulot" } }));
  await expect(page.locator("#bar")).toContainText("1 élément importé, noms des catégories restaurés.");
  await expect(page.locator("#board")).toContainText("En base");
  expect(s.items).toHaveLength(1);
  expect(s.settings.cat_labels.bleu).toBe("Boulot");
});

test("sauvegarde sans élément : les noms des catégories sont quand même restaurés", async ({ page }) => {
  const s = await mockSupabase(page);
  await login(page);
  await expect(page.locator("#app")).toBeVisible();
  await page.locator("#importFile").setInputFiles(backupFile({ format: 2, items: [], labels: { bleu: "Boulot" } }));
  await expect(page.locator("#bar")).toContainText("Noms des catégories restaurés.");
  expect(s.settings.cat_labels.bleu).toBe("Boulot");
});

test("noms personnalisés en base : une sauvegarde ne les remplace pas", async ({ page }) => {
  const s = await mockSupabase(page, { settings: { cat_labels: { bleu: "Mon nom" } } });
  await login(page);
  await expect(page.locator("#legend")).toContainText("Mon nom");
  await page.locator("#importFile").setInputFiles(backupFile({ items: [oneTask], labels: { bleu: "Boulot" } }));
  await expect(page.locator("#bar")).toContainText("1 élément importé.");
  await expect(page.locator("#legend")).toContainText("Mon nom");
  expect(s.settings.cat_labels.bleu).toBe("Mon nom");
});
