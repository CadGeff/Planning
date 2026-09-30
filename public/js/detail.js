// Fenêtre de détail d'une occurrence : cocher, retirer ce jour, modifier, supprimer.

import { parse, recurText, isDone } from "./recurrence.js";
import { catLabel, setDayFlag, removeItem, findItem } from "./state.js";
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
  $("detMeta").innerHTML = `
    <span><b>${esc(fmtLong.format(parse(day)))}</b>${it.from ? ` · ${it.from} → ${it.to}` : " · sans heure"}</span>
    <span>${it.kind === "block" ? "Créneau bloqué" : "Tâche"} · ${esc(catLabel(it.cat))}</span>
    <span>${esc(recurText(it))}</span>
    ${it.kind === "task" ? `<span>État ce jour : <b>${isDone(it, day) ? "faite" : "à faire"}</b></span>` : ""}`;
  const recurring = it.recur && it.recur !== "none";
  $("d-skip").hidden = !recurring;
  disarm($("d-del"), recurring ? "Supprimer la série" : "Supprimer");
  const t = $("d-toggle");
  t.hidden = it.kind !== "task";
  t.textContent = isDone(it, day) ? "Remettre à faire" : "Marquer faite";
  $("detScrim").hidden = false;
  focusSoon($("d-edit"));
}

export function closeDetail() {
  $("detScrim").hidden = true;
  cur = null;
}

export function initDetail() {
  $("d-toggle").onclick = () => {
    const it = findItem(cur.id);
    if (it) setDayFlag(it.id, "done", cur.day, !isDone(it, cur.day));
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
