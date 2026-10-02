// La planche : grille de la semaine (ou du jour sur mobile), ligne « À faire », légende,
// barre d'état, navigation, et création d'un créneau au clic sur une case vide.

import {
  pad,
  ds,
  parse,
  addDays,
  dow,
  mondayOf,
  isoWeek,
  toMin,
  fromMin,
  DN,
  recurText,
  occurs,
} from "./recurrence.js";
import { CATS, LAST } from "./items.js";
import { layout } from "./layout.js";
import { Store } from "./store.js";
import { carriedFor, isCarrying, taskDone } from "./carry.js";
import { state, catLabel, toggleDone, todayDate } from "./state.js";
import { $, esc, applyGeometry, anyDialogOpen } from "./dom.js";
import { openDetail } from "./detail.js";
import { openForm } from "./form.js";
import { openCats } from "./categories.js";
import { resetDemo } from "./menu.js";

const fmtShort = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
/** « mar. 29 » : jour prévu d'une tâche reportée. */
const fmtFrom = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric" });
const CHECK =
  '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2 4.2 7.3 8 2.8" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/** Plage horaire par défaut, élargie si un élément déborde. */
const DAY_START = 7;
const DAY_END = 22;

const board = $("board");
const narrowMq = matchMedia("(max-width: 760px)");
const canHover = matchMedia("(hover: hover) and (pointer: fine)");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
/** Affichage mobile : un seul jour à la fois. */
export const narrow = () => narrowMq.matches;
const hourPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hour")) || 52;
const occsFor = (day) => state.items.filter((it) => occurs(it, day));
const isRecurring = (it) => it.recur && it.recur !== "none";

// ------------------------------------------------------------------ Rendu
/** Barre d'état : avancement des tâches du jour, bandeau de démo. */
export function renderStatus() {
  const today = ds(new Date());
  // Les tâches reportées à aujourd'hui comptent : elles sont à faire aujourd'hui.
  const tasks = [...occsFor(today).filter((it) => it.kind === "task"), ...carriedFor(state.items, today, today)];
  const done = tasks.filter((it) => taskDone(it, today)).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  let h = "";
  if (!state.loaded) h += `<span class="status">Chargement du planning…</span>`;
  else if (tasks.length)
    h += `<span class="pill">Tâches du jour : ${done}/${tasks.length} <span class="meter" aria-hidden="true"><i data-pct="${pct}"></i></span></span>`;
  else h += `<span class="pill">Aucune tâche aujourd'hui</span>`;
  if (Store.mode === "demo")
    h += `<span class="demo"><span class="demo-tag">Démo</span> Données d'exemple, enregistrées dans ce navigateur uniquement. <button class="linkbtn" id="resetDemo">Réinitialiser</button></span>`;
  const bar = $("bar");
  bar.innerHTML = h;
  applyGeometry(bar);
  const r = $("resetDemo");
  if (r) r.onclick = resetDemo;
}

export function render() {
  const mon = mondayOf(state.sel);
  const week = [...Array(7)].map((_, i) => addDays(mon, i));
  const days = narrow() ? [state.sel] : week;
  const todayS = ds(new Date());
  const selS = ds(state.sel);

  const sun = week[6];
  $("wk").innerHTML =
    `<b>S${isoWeek(mon)}</b> · ${fmtShort.format(mon)} → ${fmtShort.format(sun)} ${sun.getFullYear()}`;
  $("strip").innerHTML = week
    .map((d) => {
      const s = ds(d);
      const cls = s === todayS ? "today" : s < todayS ? "past" : "";
      return `<button data-go="${s}" aria-pressed="${s === selS}" class="${cls}"><small>${DN[dow(d)]}</small><span>${d.getDate()}</span></button>`;
    })
    .join("");

  let startH = DAY_START;
  let endH = DAY_END;
  const perDay = days.map((d) => {
    const s = ds(d);
    const occ = occsFor(s);
    const timed = occ.filter((it) => it.from && it.to).map((it) => ({ ...it }));
    for (const e of timed) {
      startH = Math.min(startH, Math.floor(toMin(e.from) / 60));
      endH = Math.max(endH, Math.ceil(toMin(e.to) / 60));
    }
    const when = s === todayS ? "today" : s < todayS ? "past" : "";
    const cls = `${when}${dow(d) >= 5 ? " weekend" : ""}`;
    const untimed = occ.filter((it) => !(it.from && it.to));
    // Tâches reportées : toujours sans heure, pour ne rien bloquer dans la grille.
    return { d, s, when, cls, timed: layout(timed), untimed, carried: carriedFor(state.items, s, todayS) };
  });
  endH = Math.min(endH, 24);
  renderLegend(perDay, days.length);

  const dim = (it) => (state.focusCat && it.cat !== state.focusCat ? " dim" : "");
  const HOUR = hourPx();
  const y = (m) => ((m - startH * 60) / 60) * HOUR;
  board.style.setProperty("--n", String(days.length));
  board.style.setProperty("--hours", String(endH - startH));

  let h = `<div class="hd gut" aria-hidden="true"></div>`;
  for (const p of perDay)
    h += `<div class="hd day ${p.cls}"><span class="dn">${DN[dow(p.d)]}</span><span class="dd">${p.d.getDate()}</span></div>`;

  // Ligne « À faire » : tâches sans heure.
  h += `<div class="todo gut"><span>À faire</span></div>`;
  for (const p of perDay) {
    h += `<div class="todo day ${p.cls}"><ul>`;
    if (!p.untimed.length && !p.carried.length) h += `<li class="empty">—</li>`;
    for (const it of p.carried) {
      const dn = taskDone(it, p.s);
      const from = fmtFrom.format(parse(it.start));
      h += `<li class="carried${dn ? " done" : ""}${dim(it)}" data-cat="${esc(it.cat || "gris")}">
        <button class="chk" role="checkbox" aria-checked="${dn}" aria-label="Marquer « ${esc(it.title)} » comme faite, ${dn ? "prévue" : "reportée depuis"} ${esc(from)}" data-toggle="${esc(it.id)}" data-day="${p.s}">${CHECK}</button>
        <span class="t-body">
          <button class="t-title" data-open="${esc(it.id)}" data-day="${p.s}">${esc(it.title)}</button>
          <span class="from">${dn ? "prévue" : "depuis"} ${esc(from)}</span>
        </span>
      </li>`;
    }
    for (const it of p.untimed) {
      const dn = taskDone(it, p.s);
      h += `<li class="${dn ? "done" : ""}${dim(it)}" data-cat="${esc(it.cat || "gris")}">
        <button class="chk" role="checkbox" aria-checked="${dn}" aria-label="Marquer « ${esc(it.title)} » comme faite" data-toggle="${esc(it.id)}" data-day="${p.s}">${CHECK}</button>
        <button class="t-title" data-open="${esc(it.id)}" data-day="${p.s}">${esc(it.title)}</button>
        ${isRecurring(it) ? `<span class="rec" title="${esc(recurText(it))}">↻</span>` : ""}
        ${isCarrying(it, todayS) ? `<span class="rec" role="img" aria-label="Reportée à aujourd'hui" title="Non faite : reportée à aujourd'hui">↷</span>` : ""}
      </li>`;
    }
    h += `</ul></div>`;
  }

  // Grille horaire.
  h += `<div class="col gut" aria-hidden="true">`;
  for (let k = startH; k < endH; k++) h += `<div class="hl" data-top="${(k - startH) * HOUR + 4}">${pad(k)}:00</div>`;
  h += `</div>`;
  const now = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();
  for (const p of perDay) {
    h += `<div class="col day ${p.cls}" data-col="${p.s}">`;
    if (p.when === "today" && nowM >= startH * 60 && nowM <= endH * 60)
      h += `<div class="now" data-top="${y(nowM)}"></div>`;
    for (const e of p.timed) {
      const s = toMin(e.from);
      const en = Math.max(toMin(e.to), s + 15);
      const top = y(s);
      const ht = Math.max(((en - s) / 60) * HOUR - 2, 20);
      const dn = e.kind === "task" && taskDone(e, p.s);
      const moved = isCarrying(e, todayS);
      const tip = `${e.title} · ${e.from}–${e.to} · ${catLabel(e.cat)}`;
      h += `<div class="ev ${e.kind === "task" ? "task" : "block"}${ht < 40 ? " short" : ""}${dn ? " done" : ""}${dim(e)}" role="button" tabindex="0"
        data-open="${esc(e.id)}" data-day="${p.s}" data-cat="${esc(e.cat || "bleu")}" title="${esc(tip)}"
        data-top="${top + 1}" data-height="${ht}" data-lane="${e.lane}" data-lanes="${e.lanes || 1}"
        aria-label="${esc(e.title)}, ${e.from} à ${e.to}${moved ? ", reportée à aujourd'hui" : ""}">
        ${e.kind === "task" ? `<button class="chk" role="checkbox" aria-checked="${dn}" aria-label="Marquer comme faite" data-toggle="${esc(e.id)}" data-day="${p.s}">${CHECK}</button>` : ""}
        <span class="bd"><span class="tt">${esc(e.title)}</span><span class="tm">${e.from}–${e.to}${isRecurring(e) ? " ↻" : ""}${moved ? " ↷" : ""}</span></span>
      </div>`;
    }
    h += `</div>`;
  }
  board.innerHTML = h;
  applyGeometry(board);
  board.dataset.start = String(startH);
  renderStatus();
}

/** Légende : temps bloqué par catégorie ; un clic met une catégorie en avant, un second annule. */
function renderLegend(perDay, nDays) {
  const mins = Object.fromEntries(CATS.map((c) => [c, 0]));
  for (const p of perDay)
    for (const e of p.timed) if (e.kind === "block") mins[e.cat] = (mins[e.cat] || 0) + toMin(e.to) - toMin(e.from);
  const fmtH = (m) => {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h} h ${pad(r)}` : `${h} h`;
  };
  const period = nDays === 1 ? "ce jour" : "cette semaine";
  $("legend").innerHTML = `${CATS.map(
    (c) => `
      <button class="cat-item" data-cat="${c}" aria-pressed="${state.focusCat === c}"
        title="${esc(catLabel(c))} : ${mins[c] ? `${fmtH(mins[c])} bloquées ${period}` : `aucun créneau ${period}`}">
        <span class="swatch" aria-hidden="true"></span><b>${esc(catLabel(c))}</b>${mins[c] ? `<span class="hrs">${fmtH(mins[c])}</span>` : ""}
      </button>`,
  ).join("")}<button class="linkbtn" id="renameCats">Renommer</button>`;
}

/** Amène la ligne « maintenant » dans le tiers haut de l'écran si elle n'est pas visible. */
export function scrollToNow() {
  const n = board.querySelector(".now");
  if (!n) return;
  const r = n.getBoundingClientRect();
  if (r.top > 90 && r.top < innerHeight - 90) return;
  window.scrollTo({
    top: Math.max(0, r.top + scrollY - innerHeight / 3),
    behavior: reducedMotion.matches ? "auto" : "smooth",
  });
}

// ------------------------------------------------------------ Navigation
export const goPrev = () => {
  state.sel = addDays(state.sel, narrow() ? -1 : -7);
  render();
};
export const goNext = () => {
  state.sel = addDays(state.sel, narrow() ? 1 : 7);
  render();
};
export const goToday = () => {
  state.sel = todayDate();
  render();
  scrollToNow();
};
export const newItem = () => openForm(null, { date: ds(state.sel), kind: "task" });

/** Quart d'heure sous le pointeur dans une colonne ; créneau d'une heure par défaut. */
function slotAt(col, clientY) {
  const r = col.getBoundingClientRect();
  const m = Math.floor(((clientY - r.top) / hourPx()) * 4) * 15 + Number(board.dataset.start) * 60;
  const from = Math.max(0, Math.min(m, 23 * 60));
  return { from, to: Math.min(from + 60, LAST) };
}

export function initBoard() {
  board.addEventListener("click", (ev) => {
    const target = /** @type {HTMLElement} */ (ev.target);
    const t = target.closest("[data-toggle]");
    if (t instanceof HTMLElement) {
      ev.stopPropagation();
      toggleDone(t.dataset.toggle, t.dataset.day);
      return;
    }
    const o = target.closest("[data-open]");
    if (o instanceof HTMLElement) return openDetail(o.dataset.open, o.dataset.day);
    const c = target.closest(".col.day");
    if (c instanceof HTMLElement) {
      const { from, to } = slotAt(c, ev.clientY);
      openForm(null, { date: c.dataset.col, from: fromMin(from), to: fromMin(to), kind: "block" });
    }
  });
  board.addEventListener("keydown", (ev) => {
    const target = /** @type {HTMLElement} */ (ev.target);
    if ((ev.key === "Enter" || ev.key === " ") && target.matches(".ev")) {
      ev.preventDefault();
      openDetail(target.dataset.open, target.dataset.day);
    }
  });

  // Aperçu du créneau sous la souris (écrans avec survol uniquement).
  const ghost = document.createElement("div");
  ghost.className = "ghost";
  ghost.setAttribute("aria-hidden", "true");
  board.addEventListener("mousemove", (ev) => {
    if (!canHover.matches) return;
    const target = /** @type {HTMLElement} */ (ev.target);
    const c = target.closest(".col.day");
    if (!c || target.closest(".ev")) return ghost.remove();
    const { from, to } = slotAt(c, ev.clientY);
    if (ghost.parentNode !== c) c.appendChild(ghost);
    const HOUR = hourPx();
    const start = Number(board.dataset.start) * 60;
    ghost.style.top = `${((from - start) / 60) * HOUR + 1}px`;
    ghost.style.height = `${((to - from) / 60) * HOUR - 2}px`;
    ghost.textContent = `${fromMin(from)} – ${fromMin(to)}`;
  });
  board.addEventListener("mouseleave", () => ghost.remove());

  $("legend").addEventListener("click", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest("#renameCats")) return openCats();
    const b = target.closest("[data-cat]");
    if (!(b instanceof HTMLElement)) return;
    state.focusCat = state.focusCat === b.dataset.cat ? null : b.dataset.cat;
    render();
  });
  $("strip").addEventListener("click", (ev) => {
    const b = /** @type {HTMLElement} */ (ev.target).closest("[data-go]");
    if (b instanceof HTMLElement) {
      state.sel = parse(b.dataset.go);
      render();
    }
  });
  $("prev").onclick = goPrev;
  $("next").onclick = goNext;
  $("today").onclick = goToday;
  $("add").onclick = newItem;
  // addListener : Safari antérieur à 14 ne connaît pas addEventListener sur MediaQueryList.
  if (narrowMq.addEventListener) narrowMq.addEventListener("change", () => render());
  else narrowMq.addListener(() => render());
  // Toutes les minutes : ligne de l'heure et passage à minuit, sauf si une fenêtre est ouverte.
  setInterval(() => {
    if (state.loaded && !anyDialogOpen()) render();
  }, 60_000);
}
