// Vues d'ensemble (mois, « À venir », semaine en liste) et bouton retour, en mode démo.
import { test, expect } from "./fixtures.js";

// Samedi 3 octobre 2026, 10 h.
const NOW = new Date("2026-10-03T10:00:00");
const TODAY = "2026-10-03";

let n = 0;
const mk = (o) => ({ id: `v${++n}`, done: {}, skipped: {}, recur: "none", cat: "bleu", ...o });
const ITEMS = [
  mk({
    title: "Deep work",
    kind: "block",
    start: "2026-09-28",
    from: "09:00",
    to: "11:00",
    recur: "weekly",
    days: [0, 1, 2, 3, 4],
  }),
  mk({ title: "Lire 20 pages", kind: "task", start: "2026-09-28", recur: "daily", cat: "gris" }),
  mk({ title: "Courses", kind: "task", start: "2026-10-02", cat: "rose" }),
  mk({ title: "Dentiste", kind: "block", start: "2026-10-06", from: "14:30", to: "15:15", cat: "vert" }),
  mk({ title: "Entretien", kind: "block", start: "2026-10-13", from: "14:00", to: "15:00" }),
  mk({ title: "Préparer les questions", kind: "task", start: "2026-10-13" }),
  mk({ title: "Concert", kind: "block", start: "2026-10-23", from: "20:00", to: "23:00", cat: "rose" }),
  mk({ title: "Relire le dossier", kind: "task", start: "2026-10-27" }),
  mk({ title: "Trop loin", kind: "task", start: "2026-11-20" }),
];

/** Ouvre la démo avec ces éléments (et `extra`), et les préférences d'affichage données. */
async function open(page, prefs = {}, extra = []) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ([items, stored]) => {
      // Une seule fois : un rechargement doit retrouver ce que le test a modifié.
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("semainier.demo.v1", JSON.stringify(items));
      for (const [k, v] of Object.entries(stored)) localStorage.setItem(k, v);
    },
    [[...ITEMS, ...extra], prefs],
  );
  await page.goto("/#demo");
  await expect(page.locator("#app")).toBeVisible();
}
const view = (page, name) => page.locator("#viewSeg").getByRole("button", { name, exact: true });
const cell = (page, day) => page.locator(`.month .mc[data-add="${day}"]`);

test.describe("vue mois", () => {
  test("écrit les éléments ponctuels, réduit les habitudes à des marques", async ({ page, errors }) => {
    await open(page);
    await view(page, "Mois").click();
    await expect(page.locator("#wk")).toHaveText("Octobre 2026");
    await expect(view(page, "Mois")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#board")).toBeHidden();

    await expect(page.locator(".month .mc")).toHaveCount(35);
    await expect(cell(page, "2026-10-13")).toContainText("Entretien");
    await expect(cell(page, "2026-10-13")).toContainText("Préparer les questions");
    await expect(page.locator(".month")).not.toContainText("Deep work");
    await expect(page.locator(".month")).not.toContainText("Lire 20 pages");
    // Mardi 13 : un créneau et une tâche récurrents, donc un trait et un rond.
    await expect(cell(page, "2026-10-13").locator(".routine i")).toHaveCount(2);
    await expect(cell(page, "2026-10-13").locator(".routine")).toHaveAttribute(
      "title",
      "Habitudes : Deep work, Lire 20 pages",
    );
    // Dimanche 4 : la seule habitude du jour est la lecture.
    await expect(cell(page, "2026-10-04").locator(".routine i")).toHaveCount(1);

    await expect(cell(page, TODAY)).toHaveClass(/today/);
    await expect(cell(page, "2026-09-28")).toHaveClass(/out/);
    // La tâche d'hier, non faite, est reportée dans la case d'aujourd'hui.
    await expect(cell(page, TODAY)).toContainText("Courses");
    expect(errors).toEqual([]);
  });

  test("la vue choisie est mémorisée sur l'appareil", async ({ page }) => {
    await open(page);
    await view(page, "Mois").click();
    await page.reload();
    await expect(page.locator(".month")).toBeVisible();
    await view(page, "Semaine").click();
    await page.reload();
    await expect(page.locator("#board")).toBeVisible();
    await expect(page.locator(".month")).toHaveCount(0);
  });

  test("un clic sur un jour ouvre le formulaire à cette date", async ({ page }) => {
    await open(page, { "semainier.view": "month" });
    await page.getByRole("button", { name: "Ajouter un élément le jeudi 15 octobre" }).click();
    await expect(page.getByLabel("Date (1re fois)")).toHaveValue("2026-10-15");
    await page.getByLabel("Intitulé").fill("Rappeler le garage");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(cell(page, "2026-10-15")).toContainText("Rappeler le garage");

    // Le fond de la case fait de même.
    await cell(page, "2026-10-29").click({ position: { x: 60, y: 70 } });
    await expect(page.getByLabel("Date (1re fois)")).toHaveValue("2026-10-29");
    // Le sélecteur « Type » du formulaire garde son propre style, distinct du choix de la vue.
    await expect(page.locator("#form .seg")).toHaveCSS("overflow", "visible");
  });

  test("ajouter sur un jour du mois suivant, déjà visible, ne change pas de mois", async ({ page }) => {
    await open(page, { "semainier.view": "month" });
    await page.getByRole("button", { name: "Ajouter un élément le dimanche 1 novembre" }).click();
    await page.getByLabel("Intitulé").fill("Brocante");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(cell(page, "2026-11-01")).toContainText("Brocante");
    await expect(page.locator("#wk")).toHaveText("Octobre 2026");
  });

  test("au-delà de trois éléments, la case compte le reste et renvoie à la semaine", async ({ page }) => {
    const day = "2026-10-15";
    const extra = ["Un", "Deux", "Trois", "Quatre", "Cinq"].map((title) => mk({ title, kind: "task", start: day }));
    await open(page, { "semainier.view": "month" }, extra);
    await expect(cell(page, day).locator(".chip")).toHaveCount(3);
    await cell(page, day).getByRole("button", { name: "+ 2 autres" }).click();
    await expect(page.locator(`.todo.day`).nth(3)).toContainText("Cinq");
    // Un détour par la semaine ne change pas la vue mémorisée.
    await page.reload();
    await expect(page.locator(".month")).toBeVisible();
  });

  test("changement d'année : la première case rappelle le mois, même en décembre", async ({ page }) => {
    await open(page, { "semainier.view": "month" });
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Suivant" }).click();
    await expect(page.locator("#wk")).toHaveText("Janvier 2027");
    await expect(cell(page, "2026-12-28").locator(".mo")).toHaveText("déc.");
    await expect(cell(page, "2027-01-01").locator(".mo")).toHaveText("janv.");
    await expect(page.locator(".month .mo")).toHaveCount(2);
  });

  test("une préférence de vue illisible est ignorée", async ({ page }) => {
    await open(page, { "semainier.view": "année" });
    await expect(page.locator("#board")).toBeVisible();
    await expect(view(page, "Semaine")).toHaveAttribute("aria-pressed", "true");
  });

  test("un clic sur un élément ouvre son détail ; cocher une tâche la marque faite", async ({ page }) => {
    await open(page, { "semainier.view": "month" });
    await cell(page, "2026-10-06").getByRole("button", { name: "Dentiste" }).click();
    await expect(page.getByRole("dialog")).toContainText("mardi 6 octobre");
    await expect(page.getByRole("dialog")).toContainText("14:30 → 15:15");
    await page.keyboard.press("Escape");
    // Le bord de la puce ouvre aussi le détail, pas le formulaire d'ajout.
    await cell(page, "2026-10-06")
      .locator(".chip")
      .click({ position: { x: 1, y: 6 } });
    await expect(page.locator("#detScrim")).toBeVisible();
    await expect(page.locator("#formScrim")).toBeHidden();
    await page.keyboard.press("Escape");

    const task = cell(page, "2026-10-13").locator(".chip.task");
    await task.getByRole("checkbox").click();
    await expect(task).toHaveClass(/done/);
    // Au clavier, la case garde le focus après le rendu : on peut la décocher aussitôt.
    await task.getByRole("checkbox").focus();
    await page.keyboard.press("Space");
    await expect(task).not.toHaveClass(/done/);
    await expect(task.getByRole("checkbox")).toBeFocused();
    await page.keyboard.press("Space");
    await expect(task).toHaveClass(/done/);
    await page.reload();
    await expect(cell(page, "2026-10-13").locator(".chip.task")).toHaveClass(/done/);
  });

  test("les flèches changent de mois, « Aujourd'hui » y revient", async ({ page }) => {
    await open(page, { "semainier.view": "month" });
    await page.getByRole("button", { name: "Suivant" }).click();
    await expect(page.locator("#wk")).toHaveText("Novembre 2026");
    await expect(cell(page, "2026-11-20")).toContainText("Trop loin");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#wk")).toHaveText("Septembre 2026");
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(page.locator("#wk")).toHaveText("Octobre 2026");
  });

  test("les marques d'habitudes ouvrent la semaine de ce jour", async ({ page }) => {
    await open(page, { "semainier.view": "month" });
    await cell(page, "2026-10-13").locator(".routine").click();
    await expect(page.locator("#board")).toBeVisible();
    await expect(page.locator("#wk")).toContainText("S42");
    await expect(page.locator('.col.day[data-col="2026-10-13"]')).toContainText("Deep work");
  });

  test("la légende compte les créneaux du mois et filtre les catégories", async ({ page }) => {
    await open(page, { "semainier.view": "month" });
    const vert = page.locator('#legend .cat-item[data-cat="vert"]');
    await expect(vert).toHaveAttribute("title", /45 min de créneaux ce mois/);
    // 22 jours ouvrés en octobre, deux heures chacun, plus une heure d'entretien : les trois
    // derniers jours de septembre, visibles dans la grille, ne comptent pas.
    await expect(page.locator('#legend .cat-item[data-cat="bleu"]')).toHaveAttribute(
      "title",
      /: 45 h de créneaux ce mois/,
    );
    await vert.click();
    await expect(cell(page, "2026-10-13").locator(".chip.block")).toHaveClass(/dim/);
    await expect(cell(page, "2026-10-06").locator(".chip.block")).not.toHaveClass(/dim/);
  });
});

test.describe("liste « À venir »", () => {
  test("s'ouvre à côté du mois, regroupe par semaine, laisse les habitudes de côté", async ({ page }) => {
    await open(page, { "semainier.view": "month" });
    await expect(page.locator(".agenda")).toHaveCount(0);
    await page.getByRole("button", { name: "À venir" }).click();
    const agenda = page.locator(".agenda");
    await expect(agenda.locator("h3")).toHaveText([
      "Cette semaine",
      "Semaine prochaine",
      "Dans 2 semaines",
      "Dans 3 semaines",
      "Dans 4 semaines",
    ]);
    await expect(agenda.locator(".chip-t")).toHaveText([
      "Courses",
      "Dentiste",
      "Entretien",
      "Préparer les questions",
      "Concert",
      "Relire le dossier",
    ]);
    await expect(agenda.locator(".up").nth(1)).toContainText("14:30");

    // Le panneau reste ouvert au prochain passage, et se referme d'un clic.
    await page.reload();
    await expect(page.locator(".agenda")).toBeVisible();
    await page.getByRole("button", { name: "À venir" }).click();
    await expect(page.locator(".agenda")).toHaveCount(0);
  });

  test("une tâche cochée quitte la liste", async ({ page }) => {
    await open(page, { "semainier.view": "month", "semainier.upcoming": "1" });
    const agenda = page.locator(".agenda");
    await agenda.getByRole("checkbox", { name: /Préparer les questions/ }).click();
    await expect(agenda).not.toContainText("Préparer les questions");
    await expect(cell(page, "2026-10-13").locator(".chip.task")).toHaveClass(/done/);
  });
});

test.describe("sur téléphone", () => {
  test.use({ viewport: { width: 390, height: 780 } });

  test("trois vues ; le bandeau des jours reste en vue Jour", async ({ page }) => {
    await open(page);
    await expect(view(page, "Jour")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#strip")).toBeVisible();
    await expect(page.locator("#strip button")).toHaveCount(7);

    await view(page, "Semaine").click();
    await expect(page.locator("#strip")).toBeHidden();
    await expect(page.locator(".wlist .wr")).toHaveCount(7);

    await view(page, "Mois").click();
    await expect(page.locator("#strip")).toBeHidden();
    await expect(page.locator(".month.mini")).toBeVisible();

    await view(page, "Jour").click();
    await expect(page.locator("#strip")).toBeVisible();
    await expect(page.locator("#board")).toBeVisible();
  });

  test("semaine en liste : ce qui sort de l'ordinaire, jour par jour", async ({ page, errors }) => {
    await open(page, { "semainier.view": "week" });
    await page.getByRole("button", { name: "Suivant" }).click();
    const rows = page.locator(".wlist .wr");
    await expect(rows.nth(0)).toContainText("Rien de particulier");
    await expect(rows.nth(1)).toContainText("Dentiste");
    await expect(rows.nth(1)).toContainText("14:30");
    await expect(page.locator(".wlist")).not.toContainText("Deep work");
    await expect(rows.nth(1).locator(".routine i")).toHaveCount(2);

    // Toucher la date ouvre la journée dans la grille.
    await page.getByRole("button", { name: "Ouvrir le mardi 6 octobre" }).click();
    await expect(view(page, "Jour")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('#strip button[aria-pressed="true"]')).toContainText("6");
    await expect(page.locator(".col.day")).toContainText("Dentiste");
    expect(errors).toEqual([]);
  });

  test("mois : deux semaines d'« À venir », la suite à la demande", async ({ page }) => {
    await open(page, { "semainier.view": "month" });
    const agenda = page.locator(".agenda");
    await expect(agenda.locator(".chip-t")).toHaveText(["Courses", "Dentiste", "Entretien", "Préparer les questions"]);
    await page.getByRole("button", { name: "Voir la suite (2)" }).click();
    await expect(agenda.locator(".chip-t")).toHaveCount(6);
    await expect(agenda).toContainText("Relire le dossier");
    await expect(page.getByRole("button", { name: /Voir la suite/ })).toHaveCount(0);
  });

  test("mois : toucher un jour affiche son détail, habitudes comprises", async ({ page }) => {
    await open(page, { "semainier.view": "month" });
    await expect(page.locator('.mini .mc[data-pick="2026-10-13"] .dots i')).toHaveCount(2);
    await page.getByRole("button", { name: "mardi 13 octobre, 2 éléments" }).click();
    const panel = page.locator(".dayp");
    await expect(panel.getByRole("heading")).toHaveAccessibleName("mardi 13 octobre");
    await expect(page.locator('.mini .mc[data-pick="2026-10-13"]')).toHaveAttribute("aria-pressed", "true");
    await expect(panel.locator(".chip-t")).toHaveText([
      "Entretien",
      "Préparer les questions",
      "Deep work",
      "Lire 20 pages",
    ]);
    await expect(page.locator(".agenda")).toHaveCount(0);

    // Le bouton + ajoute à la date touchée.
    await page.getByRole("button", { name: "Ajouter un élément" }).click();
    await expect(page.getByLabel("Date (1re fois)")).toHaveValue("2026-10-13");
    await page.keyboard.press("Escape");

    await panel.getByRole("button", { name: "Fermer" }).click();
    await expect(page.locator(".agenda")).toBeVisible();
    await expect(page.locator(".dayp")).toHaveCount(0);
  });

  test("mois : réinitialiser la démo referme le détail du jour", async ({ page }) => {
    await open(page, { "semainier.view": "month" });
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "vendredi 20 novembre, 1 élément" }).click();
    await expect(page.locator(".dayp")).toBeVisible();
    await page.getByRole("button", { name: "Réinitialiser" }).click();
    await expect(page.locator("#wk")).toHaveText("Octobre 2026");
    await expect(page.locator(".dayp")).toHaveCount(0);
    await expect(page.locator(".agenda")).toBeVisible();
  });
});

test.describe("bouton retour", () => {
  const stays = async (page) => {
    await expect(page.locator("#app")).toBeVisible();
    expect(new URL(page.url()).hash).toBe("#demo");
  };

  test("ferme la fenêtre ouverte, puis le menu, sans quitter l'application", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Ajouter un élément" }).click();
    await expect(page.locator("#formScrim")).toBeVisible();
    await page.goBack();
    await expect(page.locator("#formScrim")).toBeHidden();
    await stays(page);

    await page.getByRole("button", { name: "Plus d'options" }).click();
    await expect(page.locator("#menu")).toBeVisible();
    await page.goBack();
    await expect(page.locator("#menu")).toBeHidden();
    await stays(page);
  });

  test("après « Modifier » depuis le détail, un seul retour ferme le formulaire", async ({ page }) => {
    await open(page, { "semainier.view": "month" });
    await cell(page, "2026-10-06").getByRole("button", { name: "Dentiste" }).click();
    await page.getByRole("button", { name: "Modifier" }).click();
    await expect(page.locator("#formScrim")).toBeVisible();
    await page.goBack();
    await expect(page.locator("#formScrim")).toBeHidden();
    await expect(page.locator("#detScrim")).toBeHidden();
    await stays(page);
  });

  test("page rechargée fenêtre ouverte : le retour suivant ferme bien la fenêtre suivante", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Ajouter un élément" }).click();
    await expect(page.locator("#formScrim")).toBeVisible();
    await page.reload();
    await expect(page.locator("#formScrim")).toBeHidden();
    expect(await page.evaluate(() => history.state)).toBe(null);
    await page.getByRole("button", { name: "Ajouter un élément" }).click();
    await expect(page.locator("#formScrim")).toBeVisible();
    await page.goBack();
    await expect(page.locator("#formScrim")).toBeHidden();
    await stays(page);
  });

  test("ouvrir et fermer une fenêtre à la main n'empile pas d'entrées dans l'historique", async ({ page }) => {
    await open(page);
    const length = () => page.evaluate(() => history.length);
    const before = await length();
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Ajouter un élément" }).click();
      await expect(page.locator("#formScrim")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("#formScrim")).toBeHidden();
      await expect.poll(() => page.evaluate(() => history.state?.semainier ?? null)).toBe(null);
    }
    // Une entrée créée à la première ouverture, réutilisée ensuite : l'historique ne grossit pas.
    expect(await length()).toBe(before + 1);
  });

  test("application installée : le retour, rien d'ouvert, laisse l'application à l'écran", async ({ page }) => {
    // Chromium de test ne sait pas se dire « installé » : on passe par le signal d'iOS, que l'application lit aussi.
    await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
    await open(page);
    const entry = () => page.evaluate(() => history.state?.semainier ?? null);
    const length = () => page.evaluate(() => history.length);

    // Rien n'est ajouté à l'historique avant le premier geste : les navigateurs sautent, au retour,
    // les entrées sur lesquelles on n'a rien touché.
    const atLoad = await length();
    expect(await entry()).toBe(null);
    await page.locator(".brand h1").click();
    expect(await entry()).toBe("guard");
    expect(await length()).toBe(atLoad + 1);

    // Le retour ramène sur l'entrée de garde existante, sans en créer de nouvelle.
    for (let i = 0; i < 3; i++) {
      await page.goBack();
      await expect.poll(entry).toBe("guard");
      await stays(page);
      await expect(page.locator("#board")).toBeVisible();
    }
    expect(await length()).toBe(atLoad + 1);

    // Et une fenêtre ouverte se ferme toujours au retour, sans quitter l'application ensuite.
    await page.getByRole("button", { name: "Plus d'options" }).click();
    await page.goBack();
    await expect(page.locator("#menu")).toBeHidden();
    expect(await entry()).toBe("guard");
    await page.goBack();
    await expect.poll(entry).toBe("guard");
    await stays(page);
  });

  test("application installée : le premier geste peut être l'ouverture du menu", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
    await open(page);
    await page.getByRole("button", { name: "Plus d'options" }).click();
    await expect(page.locator("#menu")).toBeVisible();
    await page.goBack();
    await expect(page.locator("#menu")).toBeHidden();
    expect(await page.evaluate(() => history.state?.semainier ?? null)).toBe("guard");
    await stays(page);
  });

  test("onglet de navigateur ordinaire : aucune entrée de garde, le retour n'est pas retenu", async ({ page }) => {
    await open(page);
    const atLoad = await page.evaluate(() => history.length);
    await page.locator(".brand h1").click();
    expect(await page.evaluate(() => history.state)).toBe(null);
    expect(await page.evaluate(() => history.length)).toBe(atLoad);
  });
});
