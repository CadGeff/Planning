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

test("formulaire : « Supprimer la série » pour une série, « Supprimer » pour un élément ponctuel", async ({ page }) => {
  const del = page.locator("#f-delete");
  await page.locator(`.col.day[data-col="${TODAY}"] .ev`, { hasText: "Deep work" }).click();
  await page.getByRole("button", { name: "Modifier" }).click();
  await expect(del).toHaveText("Supprimer la série");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Ajouter un élément" }).click();
  await page.getByLabel("Intitulé").fill("Rendez-vous ponctuel");
  await page.getByText("Créneau bloqué", { exact: true }).click();
  await page.getByLabel("Date (1re fois)").fill(TODAY);
  await page.getByLabel("Début").fill("14:00");
  await page.getByLabel("Fin").fill("15:00");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.locator(".ev", { hasText: "Rendez-vous ponctuel" }).click();
  await page.getByRole("button", { name: "Modifier" }).click();
  await expect(del).toHaveText("Supprimer");
});

test("légende : une durée de moins d'une heure s'affiche en minutes", async ({ page }) => {
  await page.getByRole("button", { name: "Ajouter un élément" }).click();
  await page.getByLabel("Intitulé").fill("Point rapide");
  await page.getByText("Créneau bloqué", { exact: true }).click();
  await page.getByLabel("Date (1re fois)").fill(TODAY);
  await page.getByLabel("Début").fill("16:00");
  await page.getByLabel("Fin").fill("16:30");
  await page.locator('#f-cats label[data-cat="ambre"]').click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  const admin = page.locator('#legend .cat-item[data-cat="ambre"]');
  await expect(admin.locator(".hrs")).toHaveText("30 min");
  await expect(admin).toHaveAttribute("title", "Admin : 30 min de créneaux cette semaine");
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
  await expect(page.locator(".toast").last()).toContainText("Ce fichier n'est pas un JSON valide.");

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
  await expect(page.locator(".toast").last()).toContainText("1 élément importé, 1 invalide ignoré.");
  await expect(page.locator(".todo.day.today")).toContainText("Importé");
});

/** Télécharge l'export depuis le menu et renvoie son contenu. */
async function exportData(page) {
  await page.getByRole("button", { name: "Plus d'options" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Exporter une sauvegarde" }).click(),
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
  await expect(page.locator(".toast").last()).toContainText(
    "Rien à importer : toute la sauvegarde est déjà dans ton planning.",
  );
  expect(await page.locator(".ev").count()).toBe(before);

  data.items.push({ title: "Seul manquant", kind: "task", start: TODAY, recur: "none", cat: "vert" });
  await input.setInputFiles(asFile(data));
  await expect(page.locator(".toast").last()).toContainText("1 élément importé, 11 déjà présents.");
  await expect(page.locator(".todo.day.today")).toContainText("Seul manquant");
  await page.reload();
  await expect(page.locator(".todo.day.today")).toContainText("Seul manquant");
});

test("import : restaure les noms des catégories, sans écraser des noms personnalisés", async ({ page }) => {
  const input = page.locator("#importFile");
  const item = (title) => ({ title, kind: "task", start: TODAY, recur: "none", cat: "bleu" });
  await input.setInputFiles(asFile({ format: 2, labels: { bleu: "Boulot" }, items: [item("Un")] }));
  await expect(page.locator(".toast").last()).toContainText("1 élément importé, noms des catégories restaurés.");
  await expect(page.locator("#legend")).toContainText("Boulot");
  await page.reload();
  await expect(page.locator("#legend")).toContainText("Boulot");

  await input.setInputFiles(asFile({ format: 2, labels: { bleu: "Autre nom" }, items: [item("Deux")] }));
  await expect(page.locator(".toast").last()).toContainText("1 élément importé.");
  await expect(page.locator("#legend")).toContainText("Boulot");
  await expect(page.locator("#legend")).not.toContainText("Autre nom");
});

test("import : refuse un fichier de plus de 2 Mo", async ({ page }) => {
  await page.locator("#importFile").setInputFiles({
    name: "gros.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1, " "),
  });
  await expect(page.locator(".toast").last()).toContainText("Fichier trop volumineux (2 Mo maximum).");
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

test.describe("notifications", () => {
  const file = (data) => ({ name: "s.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });

  test("une confirmation s'affiche en bas puis disparaît seule", async ({ page }) => {
    await page.getByRole("button", { name: "Plus d'options" }).click();
    await page.getByRole("menuitem", { name: "Renommer les catégories" }).click();
    await page.getByRole("button", { name: "Enregistrer" }).click();
    const toast = page.locator(".toast").last();
    await expect(page.locator(".toast-msg").last()).toHaveText("Catégories enregistrées.");
    await expect(page.locator(".toast button").last()).toBeHidden();
    // Les messages ne s'affichent pas dans la barre du haut.
    await expect(page.locator("#bar")).not.toContainText("Catégories enregistrées.");
    const box = await toast.boundingBox();
    expect(box.y).toBeGreaterThan(page.viewportSize().height / 2);
    await expect(toast).toBeHidden({ timeout: 7000 });
  });

  test("le résultat d'un import reste jusqu'au clic sur OK", async ({ page }) => {
    await page
      .locator("#importFile")
      .setInputFiles(file({ items: [{ title: "Importé", kind: "task", start: TODAY, recur: "none", cat: "vert" }] }));
    const toast = page.locator(".toast").last();
    await expect(toast).toContainText("1 élément importé.");
    await page.waitForTimeout(5600);
    await expect(toast).toBeVisible();
    await page.getByRole("button", { name: "OK" }).last().click();
    await expect(toast).toBeHidden();
  });

  test("une erreur reste affichée, Échap la ferme", async ({ page }) => {
    await page
      .locator("#importFile")
      .setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from("{") });
    const toast = page.locator(".toast").last();
    await expect(toast).toHaveClass(/warn/);
    await expect(page.locator(".toast button").last()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(toast).toBeHidden();
  });

  test("les notifications s'empilent, trois au maximum, la plus récente en bas", async ({ page }) => {
    const input = page.locator("#importFile");
    const bad = { name: "x.json", mimeType: "application/json", buffer: Buffer.from("{") };
    const toasts = page.locator(".toast");
    await input.setInputFiles(bad);
    await expect(toasts).toHaveCount(1);
    await input.setInputFiles(bad);
    await expect(toasts).toHaveCount(2);
    await input.setInputFiles(
      file({ items: [{ title: "Importé", kind: "task", start: TODAY, recur: "none", cat: "vert" }] }),
    );
    await expect(toasts).toHaveCount(3);
    await expect(toasts.last()).toContainText("1 élément importé.");
    const [first, last] = [await toasts.first().boundingBox(), await toasts.last().boundingBox()];
    expect(last.y).toBeGreaterThan(first.y);
    // Une quatrième chasse la plus ancienne.
    await input.setInputFiles(bad);
    await expect(toasts).toHaveCount(3);
    await expect(toasts.nth(1)).toContainText("1 élément importé.");
    // « OK » ne ferme que son encart ; Échap ferme le plus récent.
    await toasts.nth(1).getByRole("button", { name: "OK" }).click();
    await expect(toasts).toHaveCount(2);
    await expect(page.locator("#toasts")).not.toContainText("1 élément importé.");
    await page.keyboard.press("Escape");
    await expect(toasts).toHaveCount(1);
  });

  test("sur mobile, la notification ne recouvre pas le bouton Ajouter", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .locator("#importFile")
      .setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from("{") });
    // La mesure attend la fin de l'animation d'entrée.
    await page
      .locator(".toast")
      .last()
      .evaluate((box) => Promise.all(box.getAnimations().map((a) => a.finished)));
    const toast = await page.locator(".toast").last().boundingBox();
    const add = await page.locator("#add").boundingBox();
    expect(toast.y + toast.height).toBeLessThanOrEqual(add.y);
    expect(toast.x).toBeGreaterThanOrEqual(0);
    expect(toast.x + toast.width).toBeLessThanOrEqual(390);
  });
});

test.describe("report des tâches non faites", () => {
  const file = (items) => ({
    name: "s.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ items })),
  });
  const one = (o) => ({ kind: "task", recur: "none", cat: "vert", ...o });
  const today = (page) => page.locator(".todo.day.today");

  test.beforeEach(async ({ page }) => {
    await page
      .locator("#importFile")
      .setInputFiles(
        file([
          one({ title: "Sans heure lundi", start: "2026-09-28" }),
          one({ title: "Avec heure mardi", start: "2026-09-29", from: "16:00", to: "16:30" }),
          one({ title: "Trop vieille", start: "2026-09-21" }),
          one({ title: "Faite lundi", start: "2026-09-28", done: { "2026-09-28": true } }),
        ]),
      );
    await page.getByRole("button", { name: "OK" }).click();
  });

  test("les tâches ponctuelles non faites arrivent aujourd'hui, sans heure, et comptent", async ({ page }) => {
    const carried = today(page).locator("li.carried");
    await expect(carried).toHaveCount(2);
    await expect(carried.nth(0)).toContainText("Sans heure lundi");
    await expect(carried.nth(0)).toContainText("depuis lun. 28");
    await expect(carried.nth(1)).toContainText("Avec heure mardi");
    await expect(carried.nth(1)).toContainText("depuis mar. 29");
    await expect(today(page)).not.toContainText("Trop vieille");
    await expect(today(page)).not.toContainText("Faite lundi");
    // Une tâche récurrente non cochée la veille n'est pas reportée : elle revient d'elle-même.
    await expect(carried.filter({ hasText: "Lire 20 pages" })).toHaveCount(0);
    await expect(page.locator("#bar")).toContainText("Tâches du jour : 0/6");
    // Elles restent visibles à leur date prévue : dans la grille pour celle qui avait une heure.
    await expect(page.locator('.col[data-col="2026-09-29"] .ev.task', { hasText: "Avec heure mardi" })).toHaveCount(1);
    await expect(page.locator(".todo.day.past").first()).toContainText("Sans heure lundi");
    // Aucune copie dans la grille d'aujourd'hui.
    await expect(page.locator(".col.day.today")).not.toContainText("Avec heure mardi");
  });

  test("cocher une tâche reportée la marque faite partout et arrête le report", async ({ page }) => {
    await today(page).getByRole("checkbox", { name: "Marquer « Sans heure lundi » comme faite" }).click();
    await expect(page.locator("#bar")).toContainText("Tâches du jour : 1/6");
    const done = today(page).locator("li.carried.done");
    await expect(done).toContainText("Sans heure lundi");
    await expect(done).toContainText("prévue lun. 28");
    await expect(page.locator(".todo.day.past").first().locator("li.done")).toContainText(["Sans heure lundi"]);
    await page.reload();
    await expect(today(page).locator("li.carried.done")).toContainText("Sans heure lundi");

    // Le lendemain : elle n'est plus reportée, mais reste visible le jour où elle a été faite.
    await page.clock.setFixedTime(new Date("2026-10-01T10:00:00"));
    await page.reload();
    await expect(page.locator(".ev").first()).toBeVisible();
    await expect(today(page)).not.toContainText("Sans heure lundi");
    await expect(today(page).locator("li.carried")).toContainText(["Avec heure mardi"]);
    await expect(page.locator(".todo.day.past li.carried.done")).toContainText("Sans heure lundi");
  });

  test("décocher remet la tâche à faire, où qu'on clique", async ({ page }) => {
    const box = today(page).getByRole("checkbox", { name: "Marquer « Sans heure lundi » comme faite" });
    await box.click();
    await expect(today(page).locator("li.carried.done")).toHaveCount(1);
    // On la décoche depuis sa date prévue.
    await page
      .locator(".todo.day.past")
      .first()
      .getByRole("checkbox", { name: "Marquer « Sans heure lundi » comme faite" })
      .click();
    await expect(today(page).locator("li.carried.done")).toHaveCount(0);
    await expect(today(page).locator("li.carried")).toHaveCount(2);
    await expect(page.locator("#bar")).toContainText("Tâches du jour : 0/6");
  });

  test("déplacer une tâche faite après report la remet à faire à sa nouvelle date", async ({ page }) => {
    await today(page).getByRole("checkbox", { name: "Marquer « Sans heure lundi » comme faite" }).click();
    await today(page).getByRole("button", { name: "Sans heure lundi", exact: true }).click();
    await page.getByRole("button", { name: "Modifier" }).click();
    await page.getByLabel("Date (1re fois)").fill("2026-10-02");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    const friday = page.locator(".todo.day").nth(4);
    await expect(friday.locator("li", { hasText: "Sans heure lundi" })).not.toHaveClass(/done/);
    await expect(today(page)).not.toContainText("Sans heure lundi");
    await expect(page.locator(".todo.day.past").first()).not.toContainText("Sans heure lundi");
  });

  test("le détail d'une tâche reportée garde sa date prévue", async ({ page }) => {
    await today(page).getByRole("button", { name: "Avec heure mardi", exact: true }).click();
    await expect(page.locator("#detMeta")).toContainText("mardi 29 septembre · 16:00 → 16:30");
    await expect(page.locator("#detMeta")).toContainText("reportée à aujourd'hui");
    await page.getByRole("button", { name: "Marquer faite" }).click();
    await expect(today(page).locator("li.carried.done")).toContainText("Avec heure mardi");
    await today(page).getByRole("button", { name: "Avec heure mardi", exact: true }).click();
    await expect(page.locator("#detMeta")).toContainText("Faite le mercredi 30 septembre, après report");
  });
});
