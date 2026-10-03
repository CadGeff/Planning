// Fenêtre de détail d'une occurrence : cocher, retirer ce jour, modifier, supprimer.

import { ds, parse, recurText } from "./recurrence.js";
import { isCarrying, isOneOff, doneDay, taskDone } from "./carry.js";
import { catLabel, setDayFlag, toggleDone, removeItem, findItem } from "./state.js";
import { $, esc, arm, disarm, isArmed, focusSoon, registerDialog } from "./dom.js";
import { closeMenu } from "./menu.js";
import { openForm } from "./form.js";

const fmtLong = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
/** @type {{ id: string, day: string } | null} occurrence affichée */
let cur = null;

/** @param {string} id @param {string} day "AAAA-MM-JJ" */
export function openDetail(id, day) {
  const it = findItem(id);
  if (!it) return;
  closeMenu();
  cur = { id, day };
  $("detTitle").textContent = it.title;
  $("det").dataset.cat = it.cat || "bleu";
  // Une tâche ponctuelle garde sa date prévue, même ouverte depuis le jour où elle est reportée.
  const date = isOneOff(it) ? it.start : day;
  const done = it.kind === "task" && taskDone(it, day);
  const doneOn = isOneOff(it) ? doneDay(it) : null;
  let status = "";
  if (it.kind === "task") {
    if (doneOn && doneOn !== it.start) status = `Faite le <b>${esc(fmtLong.format(parse(doneOn)))}</b>, après report`;
    else if (isOneOff(it)) status = `État : <b>${done ? "faite" : "à faire"}</b>`;
    else status = `État ce jour : <b>${done ? "faite" : "à faire"}</b>`;
    if (isCarrying(it, ds(new Date()))) status += " · reportée à aujourd'hui";
  }
  $("detMeta").innerHTML = `
    <span><b>${esc(fmtLong.format(parse(date)))}</b>${it.from ? ` · ${esc(it.from)} → ${esc(it.to)}` : " · sans heure"}</span>
    <span>${it.kind === "block" ? "Créneau bloqué" : "Tâche"} · ${esc(catLabel(it.cat))}</span>
    <span>${esc(recurText(it))}</span>
    ${status ? `<span>${status}</span>` : ""}`;
  const recurring = it.recur && it.recur !== "none";
  $("d-skip").hidden = !recurring;
  disarm($("d-del"), recurring ? "Supprimer la série" : "Supprimer");
  const t = $("d-toggle");
  t.hidden = it.kind !== "task";
  t.textContent = done ? "Remettre à faire" : "Marquer faite";
  $("detScrim").hidden = false;
  focusSoon($("d-edit"));
}

export function closeDetail() {
  $("detScrim").hidden = true;
  cur = null;
}

export function initDetail() {
  $("d-toggle").onclick = () => {
    toggleDone(cur.id, cur.day);
    closeDetail();
  };
  $("d-skip").onclick = () => {
    setDayFlag(cur.id, "skipped", cur.day, true);
    closeDetail();
  };
  $("d-edit").onclick = () => {
    const it = findItem(cur.id);
    closeDetail();
    if (it) openForm(it);
  };
  $("d-del").onclick = () => {
    const b = $("d-del");
    if (!isArmed(b)) return arm(b, "Confirmer la suppression");
    removeItem(cur.id);
    closeDetail();
  };
  registerDialog("detScrim", closeDetail);
}
