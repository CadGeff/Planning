// Placement des créneaux qui se chevauchent.
import test from "node:test";
import assert from "node:assert/strict";
import { layout } from "../../public/js/layout.js";

const ev = (id, from, to) => ({ id, from, to });
const lanes = (list) => Object.fromEntries(list.map((e) => [e.id, [e.lane, e.lanes]]));

test("créneaux séparés : un seul couloir chacun", () => {
  const out = layout([ev("b", "11:00", "12:00"), ev("a", "09:00", "10:00")]);
  assert.deepEqual(
    out.map((e) => e.id),
    ["a", "b"],
    "triés par heure de début",
  );
  assert.deepEqual(lanes(out), { a: [0, 1], b: [0, 1] });
});

test("deux créneaux qui se chevauchent : côte à côte", () => {
  const out = layout([ev("a", "16:00", "16:30"), ev("b", "16:15", "16:45")]);
  assert.deepEqual(lanes(out), { a: [0, 2], b: [1, 2] });
});

test("un couloir libéré est réutilisé dans le même groupe", () => {
  const out = layout([ev("long", "09:00", "12:00"), ev("x", "09:00", "10:00"), ev("y", "10:00", "11:00")]);
  assert.deepEqual(lanes(out), { long: [0, 2], x: [1, 2], y: [1, 2] });
});

test("des créneaux qui se touchent ne se chevauchent pas", () => {
  const out = layout([ev("a", "09:00", "10:00"), ev("b", "10:00", "11:00")]);
  assert.deepEqual(lanes(out), { a: [0, 1], b: [0, 1] });
});

test("un créneau très court occupe au moins 15 minutes", () => {
  const out = layout([ev("a", "09:00", "09:05"), ev("b", "09:10", "09:30")]);
  assert.deepEqual(lanes(out), { a: [0, 2], b: [1, 2] });
});
