// Report des tâches ponctuelles non faites.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CARRY_DAYS,
  carriedFor,
  doneAfterEdit,
  doneDay,
  isCarrying,
  isOneOff,
  taskDone,
} from "../../public/js/carry.js";

const TODAY = "2026-09-30"; // mercredi
/** @returns {any} */
const task = (o) => ({ id: o.title, kind: "task", recur: "none", cat: "bleu", done: {}, skipped: {}, ...o });

test("seules les tâches « une seule fois » se reportent", () => {
  assert.equal(isOneOff(task({ title: "a", start: TODAY })), true);
  assert.equal(isOneOff(task({ title: "b", start: TODAY, recur: "daily" })), false);
  assert.equal(isOneOff(task({ title: "c", start: TODAY, kind: "block", from: "09:00", to: "10:00" })), false);
  for (const recur of ["daily", "weekly", "monthly"]) {
    assert.equal(isCarrying(task({ title: "r", start: "2026-09-28", recur }), TODAY), false, recur);
  }
  assert.equal(isCarrying(task({ title: "bloc", start: "2026-09-28", kind: "block" }), TODAY), false);
});

test("une tâche non cochée la veille est reportée, avec ou sans heure", () => {
  const sans = task({ title: "sans heure", start: "2026-09-29" });
  const avec = task({ title: "avec heure", start: "2026-09-29", from: "16:00", to: "16:30" });
  assert.equal(isCarrying(sans, TODAY), true);
  assert.equal(isCarrying(avec, TODAY), true);
  assert.deepEqual(
    carriedFor([sans, avec], TODAY, TODAY).map((it) => it.title),
    ["sans heure", "avec heure"],
  );
});

test("pas de report pour aujourd'hui, le futur, ni une tâche déjà cochée", () => {
  assert.equal(isCarrying(task({ title: "a", start: TODAY }), TODAY), false);
  assert.equal(isCarrying(task({ title: "b", start: "2026-10-01" }), TODAY), false);
  assert.equal(isCarrying(task({ title: "c", start: "2026-09-29", done: { "2026-09-29": true } }), TODAY), false);
  assert.equal(isCarrying(task({ title: "d", start: "2026-09-29", skipped: { "2026-09-29": true } }), TODAY), false);
});

test(`le report s'arrête après ${CARRY_DAYS} jours`, () => {
  assert.equal(isCarrying(task({ title: "limite", start: "2026-09-23" }), TODAY), true);
  assert.equal(isCarrying(task({ title: "trop vieille", start: "2026-09-22" }), TODAY), false);
  assert.deepEqual(carriedFor([task({ title: "trop vieille", start: "2026-09-22" })], TODAY, TODAY), []);
});

test("le report n'apparaît qu'aujourd'hui, pas les jours intermédiaires ni demain", () => {
  const items = [task({ title: "lundi", start: "2026-09-28" })];
  assert.equal(carriedFor(items, TODAY, TODAY).length, 1);
  assert.equal(carriedFor(items, "2026-09-29", TODAY).length, 0);
  assert.equal(carriedFor(items, "2026-10-01", TODAY).length, 0);
  assert.equal(carriedFor(items, "2026-09-28", TODAY).length, 0, "à sa date prévue, c'est une tâche normale");
});

test("les plus anciennes d'abord", () => {
  const items = [task({ title: "mardi", start: "2026-09-29" }), task({ title: "lundi", start: "2026-09-28" })];
  assert.deepEqual(
    carriedFor(items, TODAY, TODAY).map((it) => it.title),
    ["lundi", "mardi"],
  );
});

test("cochée après report : faite partout, affichée le jour où elle a été faite", () => {
  const it = task({ title: "lundi", start: "2026-09-28", done: { [TODAY]: true } });
  assert.equal(doneDay(it), TODAY);
  assert.equal(taskDone(it, "2026-09-28"), true, "cochée à sa date prévue");
  assert.equal(taskDone(it, TODAY), true);
  assert.equal(isCarrying(it, "2026-10-01"), false, "le report s'arrête");
  assert.equal(carriedFor([it], TODAY, "2026-10-02").length, 1, "reste visible le jour où elle a été faite");
  assert.equal(carriedFor([it], "2026-10-02", "2026-10-02").length, 0);
});

test("une tâche récurrente reste cochée jour par jour", () => {
  const it = task({ title: "lecture", start: "2026-09-01", recur: "daily", done: { "2026-09-29": true } });
  assert.equal(taskDone(it, "2026-09-29"), true);
  assert.equal(taskDone(it, TODAY), false);
  assert.equal(doneDay(task({ title: "vide", start: TODAY })), null);
});

test("une coche mal formée ne compte pas", () => {
  const it = task({ title: "x", start: "2026-09-29", done: { nimporte: true, "2026-09-29": false } });
  assert.equal(doneDay(it), null);
  assert.equal(isCarrying(it, TODAY), true);
});

test("changement de mois et d'année", () => {
  assert.equal(isCarrying(task({ title: "a", start: "2026-09-28" }), "2026-10-02"), true);
  assert.equal(isCarrying(task({ title: "b", start: "2025-12-29" }), "2026-01-03"), true);
  assert.equal(isCarrying(task({ title: "c", start: "2025-12-26" }), "2026-01-03"), false);
});

test("une coche antérieure à la date prévue est ignorée", () => {
  const it = task({ title: "x", start: "2026-10-02", done: { "2026-09-28": true, "2026-09-29": true } });
  assert.equal(doneDay(it), null);
  assert.equal(taskDone(it, "2026-10-02"), false);
});

test("modification : déplacer une tâche ponctuelle faite la remet à faire", () => {
  const before = task({ title: "x", start: "2026-09-28", done: { "2026-09-30": true } });
  assert.deepEqual(doneAfterEdit(before, { ...before, start: "2026-10-02" }), {});
  assert.deepEqual(doneAfterEdit(before, { ...before, title: "renommée" }), { "2026-09-30": true });
});

test("modification : une série devenue ponctuelle n'hérite pas des coches de la série", () => {
  const serie = task({
    title: "lecture",
    start: "2026-09-01",
    recur: "daily",
    done: { "2026-09-28": true, "2026-09-29": true },
  });
  assert.deepEqual(doneAfterEdit(serie, { ...serie, recur: "none", start: "2026-10-02" }), {});
  assert.deepEqual(doneAfterEdit(serie, { ...serie, recur: "none", start: "2026-09-29" }), { "2026-09-29": true });
  assert.deepEqual(doneAfterEdit(serie, { ...serie, recur: "none" }), {});
});

test("modification : une ponctuelle faite après report, devenue série, reste cochée à sa date", () => {
  const before = task({ title: "x", start: "2026-09-28", done: { "2026-09-30": true } });
  assert.deepEqual(doneAfterEdit(before, { ...before, recur: "weekly", days: [0] }), { "2026-09-28": true });
  assert.deepEqual(
    doneAfterEdit(task({ title: "y", start: "2026-09-28" }), { ...before, recur: "weekly", done: {} }),
    {},
  );
});

test("modification : une série garde ses coches, un créneau n'en a pas", () => {
  const serie = task({ title: "lecture", start: "2026-09-01", recur: "daily", done: { "2026-09-28": true } });
  assert.deepEqual(doneAfterEdit(serie, { ...serie, title: "lire", start: "2026-09-02" }), { "2026-09-28": true });
  const bloc = task({ title: "rdv", start: "2026-09-28", kind: "block", from: "09:00", to: "10:00" });
  assert.deepEqual(doneAfterEdit(bloc, { ...bloc, kind: "task" }), {});
});
