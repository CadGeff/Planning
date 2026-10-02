// Parcours de la démo publique (#demo) : données d'exemple dans le navigateur, aucun serveur.
import { test, expect } from "./fixtures.js";

// Mercredi 30 septembre 2026, 10 h : semaine 40, données d'exemple déterministes.
const NOW = new Date("2026-09-30T10:00:00");
const TODAY = "2026-09-30";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto("/#demo");
  await expect(page.locator(".ev").first()).toBeVisible();
});

test.afterEach(async ({ errors }) => {
  expect(errors).toEqual([]);
});

test("affiche la semaine d'exemple", async ({ page }) => {
  await expect(page.locator("#wk")).toContainText("S40");
  expect(await page.locator(".ev").count()).toBeGreaterThanOrEqual(10);
  await expect(page.locator("#legend .cat-item")).toHaveCount(5);
  await expect(page.locator("#bar")).toContainText("Tâches du jour : 0/4");
  await expect(page.locator(".col.day.today")).toHaveCount(1);
});

test("crée un créneau bloqué et le conserve après rechargement", async ({ page }) => {
  await page.getByRole("button", { name: "Ajouter un élément" }).click();
  await page.getByLabel("Intitulé").fill("Revue de code");
  await page.getByText("Créneau bloqué", { exact: true }).click();
  await page.getByLabel("Date (1re fois)").fill("2026-10-01");
  await page.getByLabel("Début").fill("14:00");
  await page.getByLabel("Fin").fill("15:30");
  await page.getByRole("button", { name: "Enregistrer" }).click();

  const ev = page.locator(".ev", { hasText: "Revue de code" });
  await expect(ev).toBeVisible();
  await expect(ev).toContainText("14:00–15:30");
  await page.reload();
  await expect(page.locator(".ev", { hasText: "Revue de code" })).toBeVisible();
});

test("refuse un créneau sans horaires", async ({ page }) => {
  await page.getByRole("button", { name: "Ajouter un élément" }).click();
  await page.getByLabel("Intitulé").fill("Sans heure");
  await page.getByText("Créneau bloqué", { exact: true }).click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator("#formErr")).toHaveText("Un créneau bloqué a besoin d'une heure de début et de fin.");
});

test("cocher une tâche du jour met à jour le compteur", async ({ page }) => {
  await page.locator(`.todo.day.today [data-toggle][data-day="${TODAY}"]`).first().click();
  await expect(page.locator("#bar")).toContainText("Tâches du jour : 1/4");
  await expect(page.locator(".todo.day.today li.done")).toHaveCount(1);
});

test("un titre contenant du HTML est affiché comme du texte", async ({ page }) => {
  const payload = `<img src=x onerror="window.__xss = 1">Piège`;
  await page.getByRole("button", { name: "Ajouter un élément" }).click();
  await page.getByLabel("Intitulé").fill(payload);
  await page.getByRole("button", { name: "Enregistrer" }).click();

  await expect(page.locator(".todo.day.today")).toContainText(payload);
  await expect(page.locator("#board img")).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test("détail d'une occurrence : retirer un seul jour d'une série", async ({ page }) => {
  const deep = page.locator(`.col.day[data-col="${TODAY}"] .ev`, { hasText: "Deep work" });
  await deep.click();
  await expect(page.getByRole("dialog")).toContainText("Chaque jour de semaine (lun → ven)");
  await page.getByRole("button", { name: "Retirer ce jour" }).click();
  await expect(deep).toHaveCount(0);
  await expect(page.locator(`.col.day[data-col="2026-10-01"] .ev`, { hasText: "Deep work" })).toHaveCount(1);
});

test("raccourcis clavier : semaine suivante puis aujourd'hui", async ({ page }) => {
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#wk")).toContainText("S41");
  await page.keyboard.press("t");
  await expect(page.locator("#wk")).toContainText("S40");
});

test("renommer une catégorie", async ({ page }) => {
  await page.getByRole("button", { name: "Renommer" }).click();
  await page.getByLabel("Nom de la catégorie bleu").fill("Boulot");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator("#legend")).toContainText("Boulot");
  await page.reload();
  await expect(page.locator("#legend")).toContainText("Boulot");
});

test("import : rejette un fichier invalide, filtre les éléments incorrects", async ({ page }) => {
  const input = page.locator("#importFile");
  await input.setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from("pas du json") });
  await expect(page.locator("#bar")).toContainText("Ce fichier n'est pas un JSON valide.");

  const data = {
    items: [
      { title: "Importé", kind: "task", start: TODAY, recur: "none", cat: "vert" },
      { title: "Créneau sans heure", kind: "block", start: TODAY },
    ],
  };
  await input.setInputFiles({
    name: "y.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.locator("#bar")).toContainText("1 élément importé, 1 ignoré (invalides).");
  await expect(page.locator(".todo.day.today")).toContainText("Importé");
});

/** Télécharge l'export depuis le menu et renvoie son contenu. */
async function exportData(page) {
  await page.getByRole("button", { name: "Plus d'options" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Exporter mon planning (JSON)" }).click(),
  ]);
  const chunks = await (await download.createReadStream()).toArray();
  return { name: download.suggestedFilename(), data: JSON.parse(Buffer.concat(chunks).toString()) };
}

const asFile = (data) => ({ name: "s.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });

test("export : télécharge tout le planning et les noms des catégories", async ({ page }) => {
  const { name, data } = await exportData(page);
  expect(name).toBe(`semainier-${TODAY}.json`);
  expect(data.app).toBe("semainier");
  expect(data.format).toBe(2);
  expect(data.items).toHaveLength(11);
  expect(data.labels.bleu).toBe("Travail");
  // La démo ne laisse aucune trace de sauvegarde sur l'appareil.
  expect(await page.evaluate(() => localStorage.getItem("semainier.lastExport"))).toBeNull();
  await page.getByRole("button", { name: "Plus d'options" }).click();
  await expect(page.locator("#m-backup")).toBeHidden();
});

test("import : réimporter sa sauvegarde ne crée aucun doublon", async ({ page }) => {
  const { data } = await exportData(page);
  const before = await page.locator(".ev").count();
  const input = page.locator("#importFile");
  await input.setInputFiles(asFile(data));
  await expect(page.locator("#bar")).toContainText("Rien à importer : tout le fichier est déjà dans ton planning.");
  expect(await page.locator(".ev").count()).toBe(before);

  data.items.push({ title: "Seul manquant", kind: "task", start: TODAY, recur: "none", cat: "vert" });
  await input.setInputFiles(asFile(data));
  await expect(page.locator("#bar")).toContainText("1 élément importé, 11 déjà présents.");
  await expect(page.locator(".todo.day.today")).toContainText("Seul manquant");
  await page.reload();
  await expect(page.locator(".todo.day.today")).toContainText("Seul manquant");
});

test("import : restaure les noms des catégories, sans écraser des noms personnalisés", async ({ page }) => {
  const input = page.locator("#importFile");
  const item = (title) => ({ title, kind: "task", start: TODAY, recur: "none", cat: "bleu" });
  await input.setInputFiles(asFile({ format: 2, labels: { bleu: "Boulot" }, items: [item("Un")] }));
  await expect(page.locator("#bar")).toContainText("1 élément importé, noms des catégories restaurés.");
  await expect(page.locator("#legend")).toContainText("Boulot");
  await page.reload();
  await expect(page.locator("#legend")).toContainText("Boulot");

  await input.setInputFiles(asFile({ format: 2, labels: { bleu: "Autre nom" }, items: [item("Deux")] }));
  await expect(page.locator("#bar")).toContainText("1 élément importé.");
  await expect(page.locator("#legend")).toContainText("Boulot");
  await expect(page.locator("#legend")).not.toContainText("Autre nom");
});

test("import : refuse un fichier de plus de 2 Mo", async ({ page }) => {
  await page.locator("#importFile").setInputFiles({
    name: "gros.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1, " "),
  });
  await expect(page.locator("#bar")).toContainText("Fichier trop volumineux (2 Mo maximum).");
});

test("thème sombre mémorisé sur l'appareil", async ({ page }) => {
  await page.getByRole("button", { name: "Plus d'options" }).click();
  await page.getByRole("menuitemradio", { name: "Sombre" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test.describe("sur mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("vue jour avec bandeau de la semaine", async ({ page }) => {
    await expect(page.locator(".col.day")).toHaveCount(1);
    await expect(page.locator("#strip button")).toHaveCount(7);
    await page.locator('#strip [data-go="2026-10-01"]').click();
    await expect(page.locator(".col.day")).toHaveAttribute("data-col", "2026-10-01");
  });
});
