/* Semainier — interface. Dépend de recurrence.js (window.Recurrence) et store.js (window.Store). */
(function () {
  "use strict";

  const { pad, ds, parse, addDays, dow, mondayOf, isoWeek, toMin, fromMin, DN, DL, occurs, recurText, isDone } = window.Recurrence;
  const Store = window.Store;

  const fmtShort = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  const fmtLong = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const CATS = ["bleu", "vert", "ambre", "rose", "gris"];
  const DEFAULT_LABELS = { bleu: "Travail", vert: "Sport & santé", ambre: "Admin", rose: "Rendez-vous", gris: "Perso" };
  const KINDS = ["block", "task"];
  const RECURS = ["none", "daily", "weekly", "monthly"];
  const LAST = 23 * 60 + 59;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CHECK = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2 4.2 7.3 8 2.8" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const $ = id => document.getElementById(id);
  const todayDate = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  const hourPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hour")) || 52;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // ------------------------------------------------------------ État
  let items = [];
  let loaded = false;
  let email = null;
  let statusMsg = "", statusWarn = false;
  let sel = todayDate();
  let labels = { ...DEFAULT_LABELS };   // nom de chaque couleur
  let focusCat = null;                  // catégorie mise en avant via la légende
  const catLabel = c => labels[c] || DEFAULT_LABELS[c] || c;
  /** Garde des noms propres : 30 caractères max, nom par défaut si vide. */
  function cleanLabels(raw) {
    const out = { ...DEFAULT_LABELS };
    if (raw && typeof raw === "object") for (const c of CATS) {
      const v = typeof raw[c] === "string" ? raw[c].trim().slice(0, 30) : "";
      if (v) out[c] = v;
    }
    return out;
  }

  // ------------------------------------------------ Écritures en file
  // Une écriture à la fois par élément ; `pending` évite qu'un rechargement
  // écrase l'affichage pendant qu'une écriture est en vol.
  const chains = {};
  let pending = 0;
  function queue(id, op) {
    pending++;
    chains[id] = (chains[id] || Promise.resolve())
      .then(op)
      .catch(e => setStatus((e && e.message) || "Enregistrement impossible.", true))
      .finally(() => { pending--; });
    return chains[id];
  }
  const clone = o => JSON.parse(JSON.stringify(o));

  function putItem(it) {
    const i = items.findIndex(x => x.id === it.id);
    if (i >= 0) items[i] = it; else items.push(it);
    render();
    return queue(it.id, () => Store.save(clone(it)));
  }
  function setDayFlag(id, field, day, on) {
    const it = items.find(x => x.id === id); if (!it) return;
    const map = { ...(it[field] || {}) };
    if (on) map[day] = true; else delete map[day];
    it[field] = map;
    render();
    return queue(id, () => Store.save(clone(it)));
  }
  function removeItem(id) {
    items = items.filter(x => x.id !== id);
    render();
    return queue(id, () => Store.remove(id));
  }

  function setStatus(msg, warn) { statusMsg = msg; statusWarn = !!warn; renderBar(); }

  // ------------------------------------------------ Données d'exemple
  // Utilisées par la démo publique (#demo) et par le mode local au premier lancement.
  function sample() {
    const mon = mondayOf(new Date());
    const d = n => ds(addDays(mon, n));
    const today = ds(new Date());
    const mk = o => ({ id: window.newId(), done: {}, skipped: {}, ...o });
    const reading = mk({ title: "Lire 20 pages", kind: "task", start: d(0), recur: "daily", cat: "gris" });
    const plan = mk({ title: "Planifier demain", kind: "task", start: d(0), from: "21:00", to: "21:15", recur: "daily", cat: "ambre" });
    for (let i = 0; i < 7; i++) { const day = d(i); if (day < today) { reading.done[day] = true; if (i % 3 !== 2) plan.done[day] = true; } }
    return [
      mk({ title: "Deep work", kind: "block", start: d(0), from: "09:00", to: "11:00", recur: "weekly", days: [0, 1, 2, 3, 4], cat: "bleu" }),
      mk({ title: "Point d'équipe", kind: "block", start: d(0), from: "11:30", to: "12:00", recur: "weekly", days: [0, 3], cat: "rose" }),
      mk({ title: "Cours d'anglais", kind: "block", start: d(2), from: "14:00", to: "15:30", recur: "weekly", days: [2], cat: "rose" }),
      mk({ title: "Sport", kind: "block", start: d(1), from: "18:30", to: "19:30", recur: "weekly", days: [1, 3, 5], cat: "vert" }),
      mk({ title: "Appeler le comptable", kind: "task", start: d(2), from: "16:00", to: "16:30", recur: "none", cat: "ambre" }),
      mk({ title: "Envoyer la facture", kind: "task", start: d(2), from: "16:15", to: "16:45", recur: "none", cat: "ambre" }),
      mk({ title: "Revue de la semaine", kind: "task", start: d(6), from: "18:00", to: "18:45", recur: "weekly", days: [6], cat: "bleu" }),
      mk({ title: "Faire les comptes du mois", kind: "task", start: d(4), recur: "monthly", cat: "ambre" }),
      mk({ title: "Courses", kind: "task", start: d(5), recur: "weekly", days: [5], cat: "gris" }),
      reading, plan
    ];
  }

  // ------------------------------------------- Validation (import)
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  function sanitize(raw) {
    if (!raw || typeof raw !== "object") return null;
    const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 120) : "";
    if (!title || !KINDS.includes(raw.kind) || !DATE_RE.test(raw.start || "")) return null;
    const it = {
      id: window.newId(), title, kind: raw.kind, start: raw.start,
      recur: RECURS.includes(raw.recur) ? raw.recur : "none",
      cat: CATS.includes(raw.cat) ? raw.cat : "bleu",
      done: {}, skipped: {}
    };
    if (TIME_RE.test(raw.from || "") && TIME_RE.test(raw.to || "") && toMin(raw.to) > toMin(raw.from)) { it.from = raw.from; it.to = raw.to; }
    else if (it.kind === "block") return null;
    if (it.recur === "weekly") {
      it.days = Array.isArray(raw.days) ? [...new Set(raw.days.filter(n => Number.isInteger(n) && n >= 0 && n <= 6))] : [];
      if (!it.days.length) it.days = [dow(parse(it.start))];
    }
    for (const f of ["done", "skipped"]) {
      if (raw[f] && typeof raw[f] === "object") for (const k of Object.keys(raw[f])) if (DATE_RE.test(k) && raw[f][k] === true) it[f][k] = true;
    }
    return it;
  }

  // ------------------------------------------------------ Affichage
  const board = $("board");
  const mq = matchMedia("(max-width: 760px)");
  const narrow = () => mq.matches;
  (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(() => render());

  const occsFor = day => items.filter(it => occurs(it, day));

  /** Répartit les événements qui se chevauchent en couloirs côte à côte. */
  function layout(evts) {
    evts.sort((a, b) => toMin(a.from) - toMin(b.from) || toMin(b.to) - toMin(a.to));
    let cluster = [], lanesEnd = [], clusterEnd = -1;
    const flush = () => { cluster.forEach(e => { e._n = lanesEnd.length; }); cluster = []; lanesEnd = []; };
    for (const e of evts) {
      const s = toMin(e.from), en = Math.max(toMin(e.to), s + 15);
      if (s >= clusterEnd && cluster.length) flush();
      let lane = lanesEnd.findIndex(x => x <= s);
      if (lane < 0) { lane = lanesEnd.length; lanesEnd.push(en); } else lanesEnd[lane] = en;
      e._lane = lane; cluster.push(e); clusterEnd = Math.max(clusterEnd, en);
    }
    flush();
    return evts;
  }

  function renderBar() {
    const today = ds(new Date());
    const tasks = occsFor(today).filter(it => it.kind === "task");
    const done = tasks.filter(it => isDone(it, today)).length;
    const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    let h = "";
    if (!loaded) h += `<span class="status">Chargement du planning…</span>`;
    else if (tasks.length) h += `<span class="pill">Tâches du jour : ${done}/${tasks.length} <span class="meter" aria-hidden="true"><i style="width:${pct}%"></i></span></span>`;
    else h += `<span class="pill">Aucune tâche aujourd'hui</span>`;
    if (Store.mode === "demo") h += `<span class="demo"><span class="demo-tag">Démo</span> Données d'exemple, enregistrées dans ce navigateur uniquement. <button class="linkbtn" id="resetDemo">Réinitialiser</button></span>`;
    if (statusMsg) h += `<span class="status${statusWarn ? " warn" : ""}">${esc(statusMsg)}</span>`;
    $("bar").innerHTML = h;
    const r = $("resetDemo"); if (r) r.onclick = resetDemo;
  }

  function render() {
    const mon = mondayOf(sel);
    const week = [...Array(7)].map((_, i) => addDays(mon, i));
    const days = narrow() ? [sel] : week;
    const todayS = ds(new Date());

    const sun = week[6];
    $("wk").innerHTML = `<b>S${isoWeek(mon)}</b> · ${fmtShort.format(mon)} → ${fmtShort.format(sun)} ${sun.getFullYear()}`;

    $("strip").innerHTML = week.map(d => {
      const s = ds(d);
      const cls = s === todayS ? "today" : s < todayS ? "past" : "";
      return `<button data-go="${s}" aria-pressed="${s === ds(sel)}" class="${cls}"><small>${DN[dow(d)]}</small><span>${d.getDate()}</span></button>`;
    }).join("");

    // Plage horaire : 7 h – 22 h, élargie si un élément déborde.
    let startH = 7, endH = 22;
    const perDay = days.map(d => {
      const s = ds(d); const occ = occsFor(s);
      const timed = occ.filter(it => it.from && it.to).map(it => ({ ...it }));
      const untimed = occ.filter(it => !(it.from && it.to));
      timed.forEach(e => { startH = Math.min(startH, Math.floor(toMin(e.from) / 60)); endH = Math.max(endH, Math.ceil(toMin(e.to) / 60)); });
      const when = s === todayS ? "today" : s < todayS ? "past" : "";
      return { d, s, when, timed: layout(timed), untimed };
    });
    endH = Math.min(endH, 24);
    renderLegend(perDay, days.length);
    const dim = it => (focusCat && it.cat !== focusCat ? " dim" : "");
    const HOUR = hourPx();
    const y = m => (m - startH * 60) / 60 * HOUR;

    board.style.setProperty("--n", days.length);
    board.style.setProperty("--hours", endH - startH);

    let h = `<div class="hd gut" aria-hidden="true"></div>`;
    for (const p of perDay) {
      h += `<div class="hd day ${p.when}"><span class="dn">${DN[dow(p.d)]}</span><span class="dd">${p.d.getDate()}</span></div>`;
    }
    h += `<div class="todo gut"><span>À faire</span></div>`;
    for (const p of perDay) {
      h += `<div class="todo day ${p.when}"><ul>`;
      if (!p.untimed.length) h += `<li class="empty">—</li>`;
      for (const it of p.untimed) {
        const dn = isDone(it, p.s);
        h += `<li class="${dn ? "done" : ""}${dim(it)}" style="--cat:var(--cat-${esc(it.cat || "gris")})">
          <button class="chk" role="checkbox" aria-checked="${dn}" aria-label="Marquer « ${esc(it.title)} » comme faite" data-toggle="${esc(it.id)}" data-day="${p.s}">${CHECK}</button>
          <button class="t-title" data-open="${esc(it.id)}" data-day="${p.s}">${esc(it.title)}</button>
          ${it.recur && it.recur !== "none" ? `<span class="rec" title="${esc(recurText(it))}">↻</span>` : ""}
        </li>`;
      }
      h += `</ul></div>`;
    }
    h += `<div class="col gut" aria-hidden="true">`;
    for (let k = startH; k < endH; k++) h += `<div class="hl" style="top:${(k - startH) * HOUR + 4}px">${pad(k)}:00</div>`;
    h += `</div>`;
    const now = new Date(); const nowM = now.getHours() * 60 + now.getMinutes();
    for (const p of perDay) {
      h += `<div class="col day ${p.when}${dow(p.d) >= 5 ? " weekend" : ""}" data-col="${p.s}">`;
      if (p.when === "today" && nowM >= startH * 60 && nowM <= endH * 60) h += `<div class="now" style="top:${y(nowM)}px"></div>`;
      for (const e of p.timed) {
        const s = toMin(e.from), en = Math.max(toMin(e.to), s + 15);
        const top = y(s), ht = Math.max((en - s) / 60 * HOUR - 2, 20);
        const n = e._n || 1;
        const dn = e.kind === "task" && isDone(e, p.s);
        const tip = `${e.title} · ${e.from}–${e.to} · ${catLabel(e.cat)}`;
        h += `<div class="ev ${e.kind === "task" ? "task" : "block"}${ht < 40 ? " short" : ""}${dn ? " done" : ""}${dim(e)}" role="button" tabindex="0"
          data-open="${esc(e.id)}" data-day="${p.s}" title="${esc(tip)}"
          style="--cat:var(--cat-${esc(e.cat || "bleu")});top:${top + 1}px;height:${ht}px;left:calc(${e._lane} / ${n} * 100% + 2px);width:calc(100% / ${n} - 4px)"
          aria-label="${esc(e.title)}, ${e.from} à ${e.to}">
          ${e.kind === "task" ? `<button class="chk" role="checkbox" aria-checked="${dn}" aria-label="Marquer comme faite" data-toggle="${esc(e.id)}" data-day="${p.s}">${CHECK}</button>` : ""}
          <span class="bd"><span class="tt">${esc(e.title)}</span><span class="tm">${e.from}–${e.to}${e.recur && e.recur !== "none" ? " ↻" : ""}</span></span>
        </div>`;
      }
      h += `</div>`;
    }
    board.innerHTML = h;
    board.dataset.start = startH;
    renderBar();
  }

  /** Légende : une pastille par catégorie avec le temps bloqué sur la période affichée.
   *  Un clic met la catégorie en avant (les autres s'effacent), un second clic annule. */
  function renderLegend(perDay, nDays) {
    const mins = Object.fromEntries(CATS.map(c => [c, 0]));
    for (const p of perDay) for (const e of p.timed) if (e.kind === "block") mins[e.cat] = (mins[e.cat] || 0) + toMin(e.to) - toMin(e.from);
    const fmtH = m => { const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${pad(r)}` : `${h} h`; };
    const period = nDays === 1 ? "ce jour" : "cette semaine";
    $("legend").innerHTML = CATS.map(c => `
      <button class="cat-item" data-cat="${c}" aria-pressed="${focusCat === c}" style="--cat:var(--cat-${c})"
        title="${esc(catLabel(c))} : ${mins[c] ? fmtH(mins[c]) + " bloquées " + period : "aucun créneau " + period}">
        <span class="swatch" aria-hidden="true"></span><b>${esc(catLabel(c))}</b>${mins[c] ? `<span class="hrs">${fmtH(mins[c])}</span>` : ""}
      </button>`).join("") + `<button class="linkbtn" id="renameCats">Renommer</button>`;
  }
  $("legend").addEventListener("click", e => {
    if (e.target.closest("#renameCats")) return openCats();
    const b = e.target.closest("[data-cat]"); if (!b) return;
    focusCat = focusCat === b.dataset.cat ? null : b.dataset.cat;
    render();
  });

  /** Amène la ligne « maintenant » dans le tiers haut de l'écran si elle n'est pas visible. */
  function scrollToNow() {
    const n = board.querySelector(".now"); if (!n) return;
    const r = n.getBoundingClientRect();
    if (r.top > 90 && r.top < innerHeight - 90) return;
    window.scrollTo({ top: Math.max(0, r.top + scrollY - innerHeight / 3), behavior: reducedMotion.matches ? "auto" : "smooth" });
  }

  // ------------------------------------------ Interactions planche
  /** Quart d'heure sous le pointeur dans une colonne. */
  function slotAt(col, clientY) {
    const r = col.getBoundingClientRect();
    const m = Math.floor((clientY - r.top) / hourPx() * 4) * 15 + (+board.dataset.start) * 60;
    const from = Math.max(0, Math.min(m, 23 * 60));
    return { from, to: Math.min(from + 60, LAST) };
  }

  board.addEventListener("click", ev => {
    const t = ev.target.closest("[data-toggle]");
    if (t) {
      ev.stopPropagation();
      const it = items.find(x => x.id === t.dataset.toggle); if (!it) return;
      setDayFlag(it.id, "done", t.dataset.day, !isDone(it, t.dataset.day));
      return;
    }
    const o = ev.target.closest("[data-open]");
    if (o) { openDetail(o.dataset.open, o.dataset.day); return; }
    const c = ev.target.closest(".col.day");
    if (c) {
      const { from, to } = slotAt(c, ev.clientY);
      openForm(null, { date: c.dataset.col, from: fromMin(from), to: fromMin(to), kind: "block" });
    }
  });
  board.addEventListener("keydown", ev => {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches(".ev")) { ev.preventDefault(); openDetail(ev.target.dataset.open, ev.target.dataset.day); }
  });

  // Aperçu du créneau sous la souris (écrans avec survol uniquement).
  const canHover = matchMedia("(hover: hover) and (pointer: fine)");
  const ghost = document.createElement("div");
  ghost.className = "ghost"; ghost.setAttribute("aria-hidden", "true");
  board.addEventListener("mousemove", ev => {
    if (!canHover.matches) return;
    const c = ev.target.closest(".col.day");
    if (!c || ev.target.closest(".ev")) { ghost.remove(); return; }
    const { from, to } = slotAt(c, ev.clientY);
    if (ghost.parentNode !== c) c.appendChild(ghost);
    const HOUR = hourPx(), start = +board.dataset.start * 60;
    ghost.style.top = `${(from - start) / 60 * HOUR + 1}px`;
    ghost.style.height = `${(to - from) / 60 * HOUR - 2}px`;
    ghost.textContent = `${fromMin(from)} – ${fromMin(to)}`;
  });
  board.addEventListener("mouseleave", () => ghost.remove());

  const goPrev = () => { sel = addDays(sel, narrow() ? -1 : -7); render(); };
  const goNext = () => { sel = addDays(sel, narrow() ? 1 : 7); render(); };
  const goToday = () => { sel = todayDate(); render(); scrollToNow(); };
  const newItem = () => openForm(null, { date: ds(sel), kind: "task" });

  $("strip").addEventListener("click", ev => { const b = ev.target.closest("[data-go]"); if (b) { sel = parse(b.dataset.go); render(); } });
  $("prev").onclick = goPrev;
  $("next").onclick = goNext;
  $("today").onclick = goToday;
  $("add").onclick = newItem;
  setInterval(() => { if (loaded && !document.querySelector(".scrim:not([hidden])")) render(); }, 60000);

  // ------------------------------------------------------------ Menu ⋯
  const menuBtn = $("menuBtn"), menu = $("menu");
  const menuItems = () => [...menu.querySelectorAll('[role^="menuitem"]:not([hidden])')];
  function openMenu() {
    menu.hidden = false; menuBtn.setAttribute("aria-expanded", "true");
    const first = menuItems()[0]; if (first) first.focus();
  }
  function closeMenu(focusBtn) {
    if (menu.hidden) return;
    menu.hidden = true; menuBtn.setAttribute("aria-expanded", "false");
    if (focusBtn) menuBtn.focus();
  }
  menuBtn.onclick = e => { e.stopPropagation(); menu.hidden ? openMenu() : closeMenu(); };
  document.addEventListener("click", e => { if (!menu.hidden && !e.target.closest(".menu-wrap")) closeMenu(); });
  menu.addEventListener("keydown", e => {
    const list = menuItems(); const i = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    if (e.key === "Tab") closeMenu();
  });

  function syncMenu() {
    const demo = Store.mode === "demo", supa = Store.mode === "supabase";
    $("m-reset").hidden = !demo;
    $("m-exit").hidden = !demo;
    $("m-logout").hidden = !supa;
    $("m-who").textContent = demo ? "Démo : rien n'est envoyé à un serveur."
      : supa ? `Connecté : ${email || "compte Supabase"}`
      : "Mode local : données dans ce navigateur.";
  }

  // ----------------------------------------------- Export / import
  $("m-export").onclick = () => {
    closeMenu(true);
    const data = { app: "semainier", format: 1, exportedAt: new Date().toISOString(), items: items.map(clone) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `semainier-${ds(new Date())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setStatus(`Export téléchargé (${data.items.length} élément${data.items.length > 1 ? "s" : ""}).`);
  };
  $("m-import").onclick = () => { closeMenu(); $("importFile").click(); };
  $("importFile").onchange = async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    let parsed;
    try { parsed = JSON.parse(await file.text()); }
    catch (err) { return setStatus("Ce fichier n'est pas un JSON valide.", true); }
    const list = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.items) ? parsed.items : null;
    if (!list) return setStatus("Fichier non reconnu : il faut un export du Semainier.", true);
    const clean = list.map(sanitize).filter(Boolean);
    if (!clean.length) return setStatus("Aucun élément valide dans ce fichier.", true);
    items.push(...clean);
    render();
    pending++;
    try {
      await Store.saveMany(clean.map(clone));
      const skipped = list.length - clean.length;
      setStatus(`${clean.length} élément${clean.length > 1 ? "s" : ""} importé${clean.length > 1 ? "s" : ""}${skipped ? `, ${skipped} ignoré${skipped > 1 ? "s" : ""} (invalides)` : ""}.`);
    } catch (err) {
      setStatus(err.message || "Import impossible.", true);
    } finally { pending--; }
  };

  // ------------------------------------------------------------- Démo
  async function resetDemo() {
    closeMenu();
    await Store.clear();
    labels = { ...DEFAULT_LABELS }; focusCat = null;
    items = sample();
    await Store.saveMany(items.map(clone));
    sel = todayDate();
    setStatus("Démo réinitialisée.");
    render(); scrollToNow();
  }
  $("m-reset").onclick = resetDemo;
  $("m-exit").onclick = () => { location.hash = ""; };
  // Entrer dans la démo ou en sortir change de mode de stockage : on recharge.
  window.addEventListener("hashchange", () => location.reload());

  // ------------------------------------------------------ Formulaire
  const form = $("form");
  $("f-days").innerHTML = DN.map((n, i) => `<label title="${DL[i]}"><input type="checkbox" id="f-d${i}" value="${i}"><span>${n.slice(0, 1)}</span></label>`).join("");
  const buildCatOptions = () => {
    $("f-cats").innerHTML = CATS.map(c => `<label style="--cat:var(--cat-${c})"><input type="radio" name="cat" id="f-cat-${c}" value="${c}"><span>${esc(catLabel(c))}</span></label>`).join("");
  };
  buildCatOptions();
  const durChips = [...$("f-durs").querySelectorAll("[data-dur]")];
  let editing = null;

  function syncForm() {
    $("daysField").hidden = $("f-recur").value !== "weekly";
    $("timeHint").textContent = $("f-kind-block").checked
      ? "Un créneau bloqué occupe la grille : heure de début et de fin obligatoires."
      : "Sans heure, la tâche va dans la ligne « À faire » du jour.";
    syncDur();
  }
  function syncDur() {
    const f = $("f-from").value, t = $("f-to").value;
    const d = f && t ? toMin(t) - toMin(f) : null;
    durChips.forEach(c => c.setAttribute("aria-pressed", String(+c.dataset.dur === d)));
  }
  $("f-durs").addEventListener("click", e => {
    const b = e.target.closest("[data-dur]"); if (!b) return;
    let from = $("f-from").value;
    if (!from) {
      const n = new Date();
      from = fromMin(Math.min(Math.ceil((n.getHours() * 60 + n.getMinutes()) / 15) * 15, 23 * 60));
      $("f-from").value = from;
    }
    $("f-to").value = fromMin(Math.min(toMin(from) + +b.dataset.dur, LAST));
    syncDur();
  });
  $("f-from").addEventListener("input", syncDur);
  $("f-to").addEventListener("input", syncDur);
  $("f-recur").onchange = () => {
    if ($("f-recur").value === "weekly" && ![...Array(7)].some((_, i) => $("f-d" + i).checked) && $("f-date").value) $("f-d" + dow(parse($("f-date").value))).checked = true;
    syncForm();
  };
  form.addEventListener("change", e => { if (e.target.name === "kind") syncForm(); });

  function openForm(it, pre = {}) {
    closeMenu();
    editing = it;
    $("formTitle").textContent = it ? "Modifier" : "Nouvel élément";
    $("f-title").value = it ? it.title : "";
    const kind = it ? it.kind : (pre.kind || "task");
    $("f-kind-" + kind).checked = true;
    $("f-date").value = it ? it.start : (pre.date || ds(sel));
    $("f-from").value = it ? (it.from || "") : (pre.from || "");
    $("f-to").value = it ? (it.to || "") : (pre.to || "");
    $("f-recur").value = it ? (it.recur || "none") : "none";
    const dset = it && it.days ? it.days : [];
    for (let i = 0; i < 7; i++) $("f-d" + i).checked = dset.includes(i);
    buildCatOptions();
    $("f-cat-" + ((it && it.cat) || focusCat || (kind === "block" ? "bleu" : "ambre"))).checked = true;
    $("f-delete").hidden = !it; disarm($("f-delete"), "Supprimer la série");
    $("formErr").hidden = true;
    syncForm();
    $("formScrim").hidden = false;
    setTimeout(() => $("f-title").focus(), 30);
  }
  function closeForm() { $("formScrim").hidden = true; editing = null; }
  $("f-cancel").onclick = closeForm;
  $("formScrim").addEventListener("mousedown", e => { if (e.target === $("formScrim")) closeForm(); });

  function fail(msg) { const e = $("formErr"); e.textContent = msg; e.hidden = false; }
  form.addEventListener("submit", e => {
    e.preventDefault();
    const title = $("f-title").value.trim();
    const kind = $("f-kind-block").checked ? "block" : "task";
    const start = $("f-date").value;
    const from = $("f-from").value;
    let to = $("f-to").value;
    const recur = $("f-recur").value;
    const days = [...Array(7)].map((_, i) => i).filter(i => $("f-d" + i).checked);
    const cat = (form.querySelector('input[name="cat"]:checked') || {}).value || "bleu";
    if (!title) return fail("Donne un intitulé à cet élément.");
    if (!start) return fail("Choisis une date de départ.");
    if (kind === "block" && (!from || !to)) return fail("Un créneau bloqué a besoin d'une heure de début et de fin.");
    if (!from && to) return fail("Ajoute l'heure de début, ou efface l'heure de fin.");
    if (from && !to) to = fromMin(Math.min(toMin(from) + 30, LAST));
    if (from && toMin(to) <= toMin(from)) return fail("L'heure de fin doit être après l'heure de début.");
    if (recur === "weekly" && !days.length) return fail("Coche au moins un jour de la semaine.");
    const wasNew = !editing;
    const base = editing ? { ...editing } : { id: window.newId(), done: {}, skipped: {} };
    const it = { ...base, title, kind, start, recur, cat };
    if (from) { it.from = from; it.to = to; } else { delete it.from; delete it.to; }
    if (recur === "weekly") it.days = days; else delete it.days;
    closeForm();
    if (wasNew && !narrow() && ds(mondayOf(parse(start))) !== ds(mondayOf(sel))) sel = parse(start);
    putItem(it);
  });

  function arm(btn, label) { btn.classList.add("armed"); btn.dataset.armed = "1"; btn.textContent = label; }
  function disarm(btn, label) { btn.classList.remove("armed"); delete btn.dataset.armed; btn.textContent = label; }
  $("f-delete").onclick = () => {
    const b = $("f-delete");
    if (!b.dataset.armed) return arm(b, "Confirmer la suppression");
    if (editing) removeItem(editing.id);
    closeForm();
  };

  // ------------------------------------------------------------ Détail
  let cur = null;
  function openDetail(id, day) {
    const it = items.find(x => x.id === id); if (!it) return;
    closeMenu();
    cur = { id, day };
    $("detTitle").textContent = it.title;
    $("det").style.setProperty("--cat", `var(--cat-${it.cat || "bleu"})`);
    $("detMeta").innerHTML = `
      <span><b>${esc(fmtLong.format(parse(day)))}</b>${it.from ? ` · ${it.from} → ${it.to}` : " · sans heure"}</span>
      <span>${it.kind === "block" ? "Créneau bloqué" : "Tâche"} · ${esc(catLabel(it.cat))}</span>
      <span>${esc(recurText(it))}</span>
      ${it.kind === "task" ? `<span>État ce jour : <b>${isDone(it, day) ? "faite" : "à faire"}</b></span>` : ""}`;
    const rec = it.recur && it.recur !== "none";
    $("d-skip").hidden = !rec;
    disarm($("d-del"), rec ? "Supprimer la série" : "Supprimer");
    const t = $("d-toggle");
    t.hidden = it.kind !== "task";
    t.textContent = isDone(it, day) ? "Remettre à faire" : "Marquer faite";
    $("detScrim").hidden = false;
    setTimeout(() => $("d-edit").focus(), 30);
  }
  function closeDetail() { $("detScrim").hidden = true; cur = null; }
  $("detScrim").addEventListener("mousedown", e => { if (e.target === $("detScrim")) closeDetail(); });
  $("d-toggle").onclick = () => { const it = items.find(x => x.id === cur.id); if (it) setDayFlag(it.id, "done", cur.day, !isDone(it, cur.day)); closeDetail(); };
  $("d-skip").onclick = () => { setDayFlag(cur.id, "skipped", cur.day, true); closeDetail(); };
  $("d-edit").onclick = () => { const it = items.find(x => x.id === cur.id); closeDetail(); if (it) openForm(it); };
  $("d-del").onclick = () => {
    const b = $("d-del");
    if (!b.dataset.armed) return arm(b, "Confirmer la suppression");
    removeItem(cur.id); closeDetail();
  };

  // ------------------------------------------------ Catégories
  function fillCatFields(src) {
    $("catFields").innerHTML = CATS.map(c => `
      <label style="--cat:var(--cat-${c})"><span class="dot" aria-hidden="true"></span>
        <input class="inp" id="c-${c}" maxlength="30" autocomplete="off" value="${esc(src[c])}" aria-label="Nom de la catégorie ${c}">
      </label>`).join("");
  }
  function openCats() {
    closeMenu();
    fillCatFields(labels);
    $("catErr").hidden = true;
    $("catScrim").hidden = false;
    setTimeout(() => $("c-bleu").focus(), 30);
  }
  function closeCats() { $("catScrim").hidden = true; }
  $("m-cats").onclick = openCats;
  $("c-cancel").onclick = closeCats;
  $("c-default").onclick = () => fillCatFields(DEFAULT_LABELS);
  $("catScrim").addEventListener("mousedown", e => { if (e.target === $("catScrim")) closeCats(); });
  $("catForm").addEventListener("submit", async e => {
    e.preventDefault();
    const raw = Object.fromEntries(CATS.map(c => [c, $("c-" + c).value]));
    const next = cleanLabels(raw);
    labels = next;
    closeCats();
    render();
    pending++;
    try { await Store.saveSettings({ catLabels: next }); setStatus("Catégories enregistrées."); }
    catch (err) { setStatus(err.message || "Enregistrement impossible.", true); }
    finally { pending--; }
  });
  async function loadSettings() {
    try {
      const s = await Store.getSettings();
      labels = cleanLabels(s && s.catLabels);
    } catch (err) {
      labels = { ...DEFAULT_LABELS };
      setStatus(err.message, true);
    }
  }

  // ------------------------------------------------------------ Thème
  // Réglage propre à chaque appareil : Auto (suit le système), Clair ou Sombre.
  const THEME_KEY = "semainier.theme";
  const darkOS = matchMedia("(prefers-color-scheme: dark)");
  const themeMetas = [...document.querySelectorAll('meta[name="theme-color"]')];
  const themeDefaults = themeMetas.map(m => m.content);
  function currentTheme() {
    const t = document.documentElement.getAttribute("data-theme");
    return t === "light" || t === "dark" ? t : "auto";
  }
  function applyTheme(t) {
    const root = document.documentElement;
    if (t === "light" || t === "dark") root.setAttribute("data-theme", t); else root.removeAttribute("data-theme");
    try { if (t === "auto") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch (e) {}
    // Couleur de la barre du navigateur mobile, alignée sur le thème affiché.
    const paper = getComputedStyle(root).getPropertyValue("--paper").trim();
    themeMetas.forEach((m, i) => { m.content = t === "auto" ? themeDefaults[i] : paper; });
    menu.querySelectorAll("[data-theme-set]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.themeSet === t)));
  }
  menu.querySelectorAll("[data-theme-set]").forEach(b => { b.onclick = () => applyTheme(b.dataset.themeSet); });
  applyTheme(currentTheme());

  // ------------------------------------------------------ Clavier
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (!$("formScrim").hidden) closeForm();
      else if (!$("detScrim").hidden) closeDetail();
      else if (!$("catScrim").hidden) closeCats();
      else closeMenu(true);
      return;
    }
    // Raccourcis globaux : seulement dans l'app, hors champ de saisie, hors fenêtre ouverte.
    if (e.ctrlKey || e.metaKey || e.altKey || $("app").hidden) return;
    if (e.target.closest && e.target.closest("input, select, textarea, [contenteditable]")) return;
    if (document.querySelector(".scrim:not([hidden])") || !menu.hidden) return;
    const k = e.key.toLowerCase();
    if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
    else if (k === "t") { e.preventDefault(); goToday(); }
    else if (k === "n") { e.preventDefault(); newItem(); }
  });

  // --------------------------------------------- Chargement / synchro
  async function reload(silent) {
    if (pending) return;
    try {
      const list = await Store.list();
      if (pending) return; // une écriture a démarré entre-temps : on garde l'état local
      if (list === null && Store.mode !== "supabase") {
        items = sample();
        await Store.saveMany(items.map(clone));
      } else items = list || [];
      loaded = true;
      if (!silent || statusWarn) setStatus("");
      await loadSettings();
      render();
    } catch (err) {
      loaded = true;
      setStatus(err.message || "Chargement impossible.", true);
      render();
    }
  }
  // Retour sur l'onglet ou retour du réseau : on recharge (synchro entre appareils).
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && loaded && Store.mode === "supabase") reload(true); });
  window.addEventListener("online", () => { if (loaded && Store.mode === "supabase") reload(true); });

  // ------------------------------------------------------- Connexion
  function showLogin(msg) {
    $("app").hidden = true;
    $("login").hidden = false;
    const e = $("loginErr");
    e.hidden = !msg; e.textContent = msg || "";
    setTimeout(() => $("l-email").focus(), 30);
  }
  function showApp() {
    $("login").hidden = true;
    $("app").hidden = false;
    syncMenu();
    render();
  }
  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const em = $("l-email").value.trim(), pw = $("l-pass").value;
    const err = $("loginErr");
    if (!em || !pw) { err.textContent = "Renseigne ton e-mail et ton mot de passe."; err.hidden = false; return; }
    const btn = $("loginBtn"); btn.disabled = true; btn.textContent = "Connexion…";
    try {
      const r = await Store.signIn(em, pw);
      email = r.email || em;
      $("l-pass").value = "";
      showApp();
      await reload();
      scrollToNow();
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
    } finally { btn.disabled = false; btn.textContent = "Se connecter"; }
  });
  $("m-logout").onclick = async () => { closeMenu(); await Store.signOut(); };
  Store.onSignedOut(() => { items = []; loaded = false; email = null; showLogin(); });

  // ------------------------------------------------------ Démarrage
  async function boot() {
    let session = { signedIn: true };
    try { session = await Store.init(); } catch (e) { session = { signedIn: false }; }
    if (!session.signedIn) return showLogin();
    email = session.email || null;
    showApp();
    await reload();
    scrollToNow();
    if (window.StoreConfigError) setStatus(window.StoreConfigError, true);
  }
  boot();

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
