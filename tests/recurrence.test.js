// Tests des règles de récurrence — aucune dépendance : `node --test`
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../recurrence.js");

test("hebdo : uniquement les jours cochés, jamais avant la date de départ", () => {
  const it = { start: "2026-09-29", recur: "weekly", days: [1, 3] }; // mardi et jeudi
  assert.equal(R.occurs(it, "2026-09-28"), false, "lundi");
  assert.equal(R.occurs(it, "2026-09-29"), true, "mardi");
  assert.equal(R.occurs(it, "2026-10-01"), true, "jeudi");
  assert.equal(R.occurs(it, "2026-10-02"), false, "vendredi");
  assert.equal(R.occurs(it, "2026-09-22"), false, "semaine précédente");
});

test("hebdo sans jours : le jour de la date de départ", () => {
  const it = { start: "2026-09-30", recur: "weekly" }; // mercredi
  assert.equal(R.occurs(it, "2026-10-07"), true);
  assert.equal(R.occurs(it, "2026-10-08"), false);
});

test("mensuel : le 31 retombe sur le dernier jour des mois courts", () => {
  const it = { start: "2026-01-31", recur: "monthly" };
  assert.equal(R.occurs(it, "2026-02-28"), true, "février");
  assert.equal(R.occurs(it, "2026-03-31"), true, "mars");
  assert.equal(R.occurs(it, "2026-04-30"), true, "avril");
  assert.equal(R.occurs(it, "2026-04-29"), false);
  assert.equal(R.occurs({ start: "2028-01-31", recur: "monthly" }, "2028-02-29"), true, "année bissextile");
});

test("quotidien : tous les jours sauf ceux retirés de la série", () => {
  const it = { start: "2026-09-28", recur: "daily", skipped: { "2026-09-30": true } };
  assert.equal(R.occurs(it, "2026-10-05"), true);
  assert.equal(R.occurs(it, "2026-09-30"), false);
  assert.equal(R.occurs(it, "2026-09-27"), false, "avant le départ");
});

test("ponctuel : seulement à sa date", () => {
  const it = { start: "2026-09-28", recur: "none" };
  assert.equal(R.occurs(it, "2026-09-28"), true);
  assert.equal(R.occurs(it, "2026-09-29"), false);
});

test("cocher une occurrence ne coche pas les suivantes", () => {
  const it = { start: "2026-09-28", recur: "daily", done: { "2026-09-28": true } };
  assert.equal(R.isDone(it, "2026-09-28"), true);
  assert.equal(R.isDone(it, "2026-09-29"), false);
});

test("semaines ISO 8601", () => {
  assert.equal(R.isoWeek(new Date(2026, 8, 28)), 40);
  assert.equal(R.isoWeek(new Date(2026, 11, 31)), 53, "2026 compte 53 semaines");
  assert.equal(R.isoWeek(new Date(2027, 0, 4)), 1);
});

test("libellés de récurrence", () => {
  assert.equal(R.recurText({ start: "2026-09-28", recur: "weekly", days: [4, 0, 1, 2, 3] }), "Chaque jour de semaine (lun → ven)");
  assert.equal(R.recurText({ start: "2026-09-28", recur: "weekly", days: [1, 3] }), "Chaque semaine : mardi, jeudi");
  assert.equal(R.recurText({ start: "2026-10-05", recur: "monthly" }), "Chaque mois, le 5");
});
