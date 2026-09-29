/* Semainier — interface. Dépend de recurrence.js (window.Recurrence) et store.js (window.Store). */
(function () {
  "use strict";

  const { pad, ds, parse, addDays, dow, mondayOf, isoWeek, toMin, fromMin, DN, DL, occurs, recurText, isDone } = window.Recurrence;
  const Store = window.Store;

  const fmtShort = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  const fmtLong = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const CATS = ["bleu", "vert", "ambre", "rose", "gris"];
  const KINDS = ["block", "task"];
  const RECURS = ["none", "daily", "weekly", "monthly"];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CHECK = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2 4.2 7.3 8 2.8" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const $ = id => document.getElementById(id);

  // ------------------------------------------------------------ État
  let items = [];
  let loaded = false;
  let email = null;
  let statusMsg = "", statusWarn = false;
  let sel = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); })();

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
  function sample() {
    const mon = mondayOf(new Date());
    const d = n => ds(addDays(mon, n));
    const mk = o => ({ id: window.newId(), done: {}, skipped: {}, example: true, ...o });
    return [
      mk({ title: "Deep work", kind: "block", start: d(0), from: "09:00", to: "11:00", recur: "weekly", days: [0, 1, 2, 3, 4], cat: "bleu" }),
      mk({ title: "Sport", kind: "block", start: d(1), from: "18:30", to: "19:30", recur: "weekly", days: [1, 3], cat: "vert" }),
      mk({ title: "Planifier demain", kind: "task", start: d(0), from: "21:30", to: "21:45", recur: "daily", cat: "ambre" }),
      mk({ title: "Revue de la semaine", kind: "task", start: d(6), from: "18:00", to: "18:45", recur: "weekly", days: [6], cat: "rose" }),
      mk({ title: "Faire les comptes du mois", kind: "task", start: ds(new Date(mon.getFullYear(), mon.getMonth() + 1, 1)), recur: "monthly", cat: "gris" }),
      mk({ title: "Trier la boîte mail", kind: "task", start: d(2), recur: "weekly", days: [2], cat: "gris" })
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
    const hasEx = items.some(it => it.example);
    let h = "";
    if (loaded) h += `<span class="pill">Aujourd'hui · ${done}/${tasks.length} tâche${tasks.length > 1 ? "s" : ""} faite${done > 1 ? "s" : ""} <span class="meter" aria-hidden="true"><i style="width:${pct}%"></i></span></span>`;
    else h += `<span class="status">Chargement du planning…</span>`;
    if (hasEx) h += `<span>Les éléments marqués <span class="ex">exemple</span> sont là pour montrer. <button class="linkbtn" id="clearEx">Les retirer</button></span>`;
    if (Store.mode === "local" && !statusMsg) h += `<span class="status">Mode local : données dans ce navigateur uniquement.</span>`;
    if (Store.mode === "supabase" && email && !statusMsg) h += `<span class="status">Synchronisé · ${esc(email)}</span>`;
    if (statusMsg) h += `<span class="status${statusWarn ? " warn" : ""}">${esc(statusMsg)}</span>`;
    $("bar").innerHTML = h;
    const c = $("clearEx"); if (c) c.onclick = () => items.filter(it => it.example).forEach(it => removeItem(it.id));
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
      return `<button data-go="${s}" aria-pressed="${s === ds(sel)}" class="${s === todayS ? "today" : ""}"><small>${DN[dow(d)]}</small><span>${d.getDate()}</span></button>`;
    }).join("");

    // Plage horaire : 7 h – 22 h, élargie si un élément déborde.
    let startH = 7, endH = 22;
    const perDay = days.map(d => {
      const s = ds(d); const occ = occsFor(s);
      const timed = occ.filter(it => it.from && it.to).map(it => ({ ...it }));
      const untimed = occ.filter(it => !(it.from && it.to));
      timed.forEach(e => { startH = Math.min(startH, Math.floor(toMin(e.from) / 60)); endH = Math.max(endH, Math.ceil(toMin(e.to) / 60)); });
      return { d, s, timed: layout(timed), untimed };
    });
    endH = Math.min(endH, 24);
    const hours = endH - startH;
    const HOUR = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hour")) || 52;
    const y = m => (m - startH * 60) / 60 * HOUR;

    board.style.setProperty("--n", days.length);
    board.style.setProperty("--hours", hours);

    let h = `<div class="hd gut" aria-hidden="true"></div>`;
    for (const p of perDay) {
      h += `<div class="hd day${p.s === todayS ? " today" : ""}"><span class="dn">${DN[dow(p.d)]}</span><span class="dd">${p.d.getDate()}</span></div>`;
    }
    h += `<div class="todo gut"><span>À faire</span></div>`;
    for (const p of perDay) {
      h += `<div class="todo day"><ul>`;
      if (!p.untimed.length) h += `<li class="empty">—</li>`;
      for (const it of p.untimed) {
        const dn = isDone(it, p.s);
        h += `<li class="${dn ? "done" : ""}" style="--cat:var(--cat-${esc(it.cat || "gris")})">
          <button class="chk" role="checkbox" aria-checked="${dn}" aria-label="Marquer « ${esc(it.title)} » comme faite" data-toggle="${esc(it.id)}" data-day="${p.s}">${CHECK}</button>
          <button class="t-title" data-open="${esc(it.id)}" data-day="${p.s}">${esc(it.title)}</button>
          ${it.recur && it.recur !== "none" ? `<span class="rec" title="${esc(recurText(it))}">↻</span>` : ""}
          ${it.example ? `<span class="ex">exemple</span>` : ""}
        </li>`;
      }
      h += `</ul></div>`;
    }
    h += `<div class="col gut" aria-hidden="true">`;
    for (let k = startH; k < endH; k++) h += `<div class="hl" style="top:${(k - startH) * HOUR}px">${pad(k)}:00</div>`;
    h += `</div>`;
    const now = new Date(); const nowM = now.getHours() * 60 + now.getMinutes();
    for (const p of perDay) {
      h += `<div class="col day${dow(p.d) >= 5 ? " weekend" : ""}" data-col="${p.s}">`;
      if (p.s === todayS && nowM >= startH * 60 && nowM <= endH * 60) h += `<div class="now" style="top:${y(nowM)}px"></div>`;
      for (const e of p.timed) {
        const s = toMin(e.from), en = Math.max(toMin(e.to), s + 15);
        const top = y(s), ht = Math.max((en - s) / 60 * HOUR - 2, 20);
        const n = e._n || 1;
        const dn = e.kind === "task" && isDone(e, p.s);
        h += `<div class="ev ${e.kind === "task" ? "task" : "block"}${ht < 38 ? " short" : ""}${dn ? " done" : ""}" role="button" tabindex="0"
          data-open="${esc(e.id)}" data-day="${p.s}"
          style="--cat:var(--cat-${esc(e.cat || "bleu")});top:${top + 1}px;height:${ht}px;left:calc(${e._lane} / ${n} * 100% + 2px);width:calc(100% / ${n} - 4px)"
          aria-label="${esc(e.title)}, ${e.from} à ${e.to}">
          ${e.kind === "task" ? `<button class="chk" role="checkbox" aria-checked="${dn}" aria-label="Marquer comme faite" data-toggle="${esc(e.id)}" data-day="${p.s}">${CHECK}</button>` : ""}
          <span class="bd"><span class="tt">${esc(e.title)}${e.example ? ` <span class="ex">exemple</span>` : ""}</span><span class="tm">${e.from}–${e.to}${e.recur && e.recur !== "none" ? " ↻" : ""}</span></span>
        </div>`;
      }
      h += `</div>`;
    }
    board.innerHTML = h;
    board.dataset.start = startH;
    renderBar();
  }

  // ------------------------------------------ Interactions planche
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
      const r = c.getBoundingClientRect();
      const HOUR = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hour")) || 52;
      const m = Math.round(((ev.clientY - r.top) / HOUR * 60) / 15) * 15 + (+board.dataset.start) * 60;
      const from = Math.max(0, Math.min(m, 23 * 60));
      openForm(null, { date: c.dataset.col, from: fromMin(from), to: fromMin(Math.min(from + 60, 23 * 60 + 45)), kind: "block" });
    }
  });
  board.addEventListener("keydown", ev => {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches(".ev")) { ev.preventDefault(); openDetail(ev.target.dataset.open, ev.target.dataset.day); }
  });
  $("strip").addEventListener("click", ev => { const b = ev.target.closest("[data-go]"); if (b) { sel = parse(b.dataset.go); render(); } });
  $("prev").onclick = () => { sel = addDays(sel, narrow() ? -1 : -7); render(); };
  $("next").onclick = () => { sel = addDays(sel, narrow() ? 1 : 7); render(); };
  $("today").onclick = () => { const n = new Date(); sel = new Date(n.getFullYear(), n.getMonth(), n.getDate()); render(); };
  $("add").onclick = () => openForm(null, { date: ds(sel), kind: "task" });
  setInterval(() => { if (loaded && !document.querySelector(".scrim:not([hidden])")) render(); }, 60000);

  // ------------------------------------------------------ Formulaire
  const form = $("form");
  $("f-days").innerHTML = DN.map((n, i) => `<label title="${DL[i]}"><input type="checkbox" id="f-d${i}" value="${i}"><span>${n.slice(0, 1)}</span></label>`).join("");
  $("f-cats").innerHTML = CATS.map(c => `<label title="${c}" style="--cat:var(--cat-${c})"><input type="radio" name="cat" id="f-cat-${c}" value="${c}"><span></span></label>`).join("");
  let editing = null;

  function syncForm() {
    $("daysField").hidden = $("f-recur").value !== "weekly";
    $("timeHint").textContent = $("f-kind-block").checked
      ? "Un créneau bloqué occupe la grille : heure de début et de fin obligatoires."
      : "Sans heure, la tâche va dans la ligne « À faire » du jour.";
  }
  $("f-recur").onchange = () => {
    if ($("f-recur").value === "weekly" && ![...Array(7)].some((_, i) => $("f-d" + i).checked) && $("f-date").value) $("f-d" + dow(parse($("f-date").value))).checked = true;
    syncForm();
  };
  form.addEventListener("change", e => { if (e.target.name === "kind") syncForm(); });

  function openForm(it, pre = {}) {
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
    $("f-cat-" + ((it && it.cat) || (kind === "block" ? "bleu" : "ambre"))).checked = true;
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
    if (from && !to) to = fromMin(Math.min(toMin(from) + 30, 23 * 60 + 59));
    if (from && toMin(to) <= toMin(from)) return fail("L'heure de fin doit être après l'heure de début.");
    if (recur === "weekly" && !days.length) return fail("Coche au moins un jour de la semaine.");
    const wasNew = !editing;
    const base = editing ? { ...editing } : { id: window.newId(), done: {}, skipped: {} };
    const it = { ...base, title, kind, start, recur, cat };
    if (from) { it.from = from; it.to = to; } else { delete it.from; delete it.to; }
    if (recur === "weekly") it.days = days; else delete it.days;
    delete it.example;
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
    cur = { id, day };
    $("detTitle").textContent = it.title;
    $("det").style.setProperty("--cat", `var(--cat-${it.cat || "bleu"})`);
    $("detMeta").innerHTML = `
      <span><b>${esc(fmtLong.format(parse(day)))}</b>${it.from ? ` · ${it.from} → ${it.to}` : " · sans heure"}</span>
      <span>${it.kind === "block" ? "Créneau bloqué" : "Tâche"} · ${esc(recurText(it))}</span>
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

  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!$("formScrim").hidden) closeForm();
    else if (!$("detScrim").hidden) closeDetail();
  });

  // ----------------------------------------------- Export / import
  $("exportBtn").onclick = () => {
    const data = { app: "semainier", format: 1, exportedAt: new Date().toISOString(), items: items.filter(it => !it.example).map(clone) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `semainier-${ds(new Date())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setStatus(`Export téléchargé (${data.items.length} élément${data.items.length > 1 ? "s" : ""}).`);
  };
  $("importBtn").onclick = () => $("importFile").click();
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

  // --------------------------------------------- Chargement / synchro
  async function reload(silent) {
    if (pending) return;
    try {
      const list = await Store.list();
      if (pending) return; // une écriture a démarré entre-temps : on garde l'état local
      if (list === null && Store.mode === "local") {
        items = sample();
        await Store.saveMany(items.map(clone));
      } else items = list || [];
      loaded = true;
      if (!silent || statusWarn) setStatus("");
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
    $("logoutBtn").hidden = Store.mode !== "supabase";
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
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
    } finally { btn.disabled = false; btn.textContent = "Se connecter"; }
  });
  $("logoutBtn").onclick = async () => { await Store.signOut(); };
  Store.onSignedOut(() => { items = []; loaded = false; email = null; showLogin(); });

  // ------------------------------------------------------ Démarrage
  async function boot() {
    let session = { signedIn: true };
    try { session = await Store.init(); } catch (e) { session = { signedIn: false }; }
    if (!session.signedIn) return showLogin();
    email = session.email || null;
    showApp();
    await reload();
    if (window.StoreConfigError) setStatus(window.StoreConfigError, true);
  }
  boot();

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
