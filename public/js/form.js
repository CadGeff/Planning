// Formulaire de création / modification d'un élément.

import { ds, parse, dow, mondayOf, toMin, fromMin, DN, DL } from "./recurrence.js";
import { CATS, LAST } from "./items.js";
import { doneAfterEdit } from "./carry.js";
import { newId } from "./ids.js";
import { state, catLabel, putItem, removeItem } from "./state.js";
import { $, field, esc, arm, disarm, isArmed, focusSoon, registerDialog } from "./dom.js";
import { closeMenu } from "./menu.js";
import { narrow } from "./board.js";

/** @import { Item } from "./items.js" */

const form = /** @type {HTMLFormElement} */ ($("form"));
const recurSel = /** @type {HTMLSelectElement} */ ($("f-recur"));
const dayBox = (i) => field(`f-d${i}`);
let durChips = [];
/** @type {Item|null} élément en cours de modification, null pour une création */
let editing = null;

function buildCatOptions() {
  $("f-cats").innerHTML = CATS.map(
    (c) =>
      `<label data-cat="${c}"><input type="radio" name="cat" id="f-cat-${c}" value="${c}"><span>${esc(catLabel(c))}</span></label>`,
  ).join("");
}

function syncForm() {
  $("daysField").hidden = recurSel.value !== "weekly";
  $("timeHint").textContent = field("f-kind-block").checked
    ? "Un créneau bloqué occupe la grille : heure de début et de fin obligatoires."
    : "Sans heure, la tâche va dans la ligne « À faire » du jour.";
  syncDur();
}

/** Met en évidence la puce de durée qui correspond aux heures saisies. */
function syncDur() {
  const f = field("f-from").value;
  const t = field("f-to").value;
  const d = f && t ? toMin(t) - toMin(f) : null;
  for (const c of durChips) c.setAttribute("aria-pressed", String(Number(c.dataset.dur) === d));
}

/**
 * @param {Item|null} it  élément à modifier, ou null pour en créer un
 * @param {{ date?: string, from?: string, to?: string, kind?: "block"|"task" }} [pre]  valeurs proposées
 */
export function openForm(it, pre = {}) {
  closeMenu();
  editing = it;
  $("formTitle").textContent = it ? "Modifier" : "Nouvel élément";
  field("f-title").value = it ? it.title : "";
  const kind = it ? it.kind : pre.kind || "task";
  field(`f-kind-${kind}`).checked = true;
  field("f-date").value = it ? it.start : pre.date || ds(state.sel);
  field("f-from").value = it ? it.from || "" : pre.from || "";
  field("f-to").value = it ? it.to || "" : pre.to || "";
  recurSel.value = it ? it.recur || "none" : "none";
  const days = it?.days || [];
  for (let i = 0; i < 7; i++) dayBox(i).checked = days.includes(i);
  buildCatOptions();
  field(`f-cat-${it?.cat || state.focusCat || (kind === "block" ? "bleu" : "ambre")}`).checked = true;
  $("f-delete").hidden = !it;
  disarm($("f-delete"), "Supprimer la série");
  $("formErr").hidden = true;
  syncForm();
  $("formScrim").hidden = false;
  focusSoon(field("f-title"));
}

export function closeForm() {
  $("formScrim").hidden = true;
  editing = null;
}

function fail(msg) {
  const e = $("formErr");
  e.textContent = msg;
  e.hidden = false;
}

function submit(e) {
  e.preventDefault();
  const title = field("f-title").value.trim();
  const kind = field("f-kind-block").checked ? "block" : "task";
  const start = field("f-date").value;
  const from = field("f-from").value;
  let to = field("f-to").value;
  const recur = /** @type {Item["recur"]} */ (recurSel.value);
  const days = [0, 1, 2, 3, 4, 5, 6].filter((i) => dayBox(i).checked);
  const cat = /** @type {HTMLInputElement|null} */ (form.querySelector('input[name="cat"]:checked'))?.value || "bleu";
  if (!title) return fail("Donne un intitulé à cet élément.");
  if (!start) return fail("Choisis une date de départ.");
  if (kind === "block" && (!from || !to)) return fail("Un créneau bloqué a besoin d'une heure de début et de fin.");
  if (!from && to) return fail("Ajoute l'heure de début, ou efface l'heure de fin.");
  if (from && !to) to = fromMin(Math.min(toMin(from) + 30, LAST));
  if (from && toMin(to) <= toMin(from)) return fail("L'heure de fin doit être après l'heure de début.");
  if (recur === "weekly" && !days.length) return fail("Coche au moins un jour de la semaine.");

  const wasNew = !editing;
  const base = editing ? { ...editing } : { id: newId(), done: {}, skipped: {} };
  /** @type {Item} */
  const it = { ...base, title, kind, start, recur, cat };
  if (from) {
    it.from = from;
    it.to = to;
  } else {
    delete it.from;
    delete it.to;
  }
  if (recur === "weekly") it.days = days;
  else delete it.days;
  if (editing) it.done = doneAfterEdit(editing, it);
  closeForm();
  // Un nouvel élément posé sur une autre semaine : on y va, pour le voir apparaître.
  if (wasNew && !narrow() && ds(mondayOf(parse(start))) !== ds(mondayOf(state.sel))) state.sel = parse(start);
  putItem(it);
}

export function initForm() {
  $("f-days").innerHTML = DN.map(
    (n, i) =>
      `<label title="${DL[i]}"><input type="checkbox" id="f-d${i}" value="${i}"><span>${n.slice(0, 1)}</span></label>`,
  ).join("");
  durChips = /** @type {HTMLElement[]} */ ([...$("f-durs").querySelectorAll("[data-dur]")]);
  buildCatOptions();

  $("f-durs").addEventListener("click", (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest("[data-dur]");
    if (!(b instanceof HTMLElement)) return;
    let from = field("f-from").value;
    if (!from) {
      // Pas d'heure de début : le prochain quart d'heure.
      const n = new Date();
      from = fromMin(Math.min(Math.ceil((n.getHours() * 60 + n.getMinutes()) / 15) * 15, 23 * 60));
      field("f-from").value = from;
    }
    field("f-to").value = fromMin(Math.min(toMin(from) + Number(b.dataset.dur), LAST));
    syncDur();
  });
  field("f-from").addEventListener("input", syncDur);
  field("f-to").addEventListener("input", syncDur);
  recurSel.onchange = () => {
    // Passage en hebdo sans jour coché : on coche celui de la date de départ.
    const date = field("f-date").value;
    if (recurSel.value === "weekly" && ![0, 1, 2, 3, 4, 5, 6].some((i) => dayBox(i).checked) && date)
      dayBox(dow(parse(date))).checked = true;
    syncForm();
  };
  form.addEventListener("change", (e) => {
    if (/** @type {HTMLInputElement} */ (e.target).name === "kind") syncForm();
  });
  form.addEventListener("submit", submit);
  $("f-cancel").onclick = closeForm;
  $("f-delete").onclick = () => {
    const b = $("f-delete");
    if (!isArmed(b)) return arm(b, "Confirmer la suppression");
    if (editing) removeItem(editing.id);
    closeForm();
  };
  registerDialog("formScrim", closeForm);
}
