// Menu ⋯ : export / import JSON, démo, thème, compte.

import { ds } from "./recurrence.js";
import { DEFAULT_LABELS, sample, sanitize } from "./items.js";
import { Store } from "./store.js";
import { state, clone, render, setStatus, tracked, todayDate } from "./state.js";
import { $, field } from "./dom.js";
import { scrollToNow } from "./board.js";
import { openCats } from "./categories.js";
import { openPw, openMfa } from "./account.js";
import { signOut } from "./session.js";

const menuBtn = $("menuBtn");
const menu = $("menu");
const menuItems = () => /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('[role^="menuitem"]:not([hidden])')]);
const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

export const isMenuOpen = () => !menu.hidden;

function openMenu() {
  menu.hidden = false;
  menuBtn.setAttribute("aria-expanded", "true");
  menuItems()[0]?.focus();
}

/** @param {boolean} [focusBtn] rendre le focus au bouton ⋯ (fermeture au clavier) */
export function closeMenu(focusBtn = false) {
  if (menu.hidden) return;
  menu.hidden = true;
  menuBtn.setAttribute("aria-expanded", "false");
  if (focusBtn) menuBtn.focus();
}

/** Affiche les entrées propres au mode (démo, local, Supabase). */
export function syncMenu() {
  const demo = Store.mode === "demo";
  const supa = Store.mode === "supabase";
  $("m-reset").hidden = !demo;
  $("m-exit").hidden = !demo;
  $("m-logout").hidden = !supa;
  $("m-password").hidden = !supa;
  $("m-mfa").hidden = !supa;
  $("m-who").textContent = demo
    ? "Démo : rien n'est envoyé à un serveur."
    : supa
      ? `Connecté : ${state.email || "compte Supabase"}`
      : "Mode local : données dans ce navigateur.";
}

// ------------------------------------------------------------ Export / import
function exportJson() {
  closeMenu(true);
  const data = { app: "semainier", format: 1, exportedAt: new Date().toISOString(), items: state.items.map(clone) };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `semainier-${ds(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  setStatus(`Export téléchargé (${plural(data.items.length, "élément")}).`);
}

/** Importe un fichier JSON : chaque élément est revalidé, les invalides sont ignorés. */
async function importJson(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return setStatus("Ce fichier n'est pas un JSON valide.", true);
  }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : null;
  if (!list) return setStatus("Fichier non reconnu : il faut un export du Semainier.", true);
  const clean = list.map(sanitize).filter(Boolean);
  if (!clean.length) return setStatus("Aucun élément valide dans ce fichier.", true);
  state.items.push(...clean);
  render();
  try {
    await tracked(() => Store.saveMany(clean.map(clone)));
    const skipped = list.length - clean.length;
    const s = clean.length > 1 ? "s" : "";
    setStatus(`${clean.length} élément${s} importé${s}${skipped ? `, ${plural(skipped, "ignoré")} (invalides)` : ""}.`);
  } catch (err) {
    setStatus(err.message || "Import impossible.", true);
  }
}

// ------------------------------------------------------------------ Démo
export async function resetDemo() {
  closeMenu();
  await Store.clear();
  state.labels = { ...DEFAULT_LABELS };
  state.focusCat = null;
  state.items = sample();
  await Store.saveMany(state.items.map(clone));
  state.sel = todayDate();
  setStatus("Démo réinitialisée.");
  render();
  scrollToNow();
}

// ------------------------------------------------------------------ Thème
// Réglage propre à chaque appareil : Auto (suit le système), Clair ou Sombre.
const THEME_KEY = "semainier.theme";
const themeMetas = /** @type {HTMLMetaElement[]} */ ([...document.querySelectorAll('meta[name="theme-color"]')]);
const themeDefaults = themeMetas.map((m) => m.content);

function currentTheme() {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "light" || t === "dark" ? t : "auto";
}

/** @param {"auto"|"light"|"dark"|string} t */
function applyTheme(t) {
  const root = document.documentElement;
  if (t === "light" || t === "dark") root.setAttribute("data-theme", t);
  else root.removeAttribute("data-theme");
  try {
    if (t === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch {
    /* stockage indisponible : réglage non mémorisé */
  }
  // Couleur de la barre du navigateur mobile, alignée sur le thème affiché.
  const paper = getComputedStyle(root).getPropertyValue("--paper").trim();
  themeMetas.forEach((m, i) => {
    m.content = t === "auto" ? themeDefaults[i] : paper;
  });
  for (const b of menu.querySelectorAll("[data-theme-set]")) {
    b.setAttribute("aria-checked", String(/** @type {HTMLElement} */ (b).dataset.themeSet === t));
  }
}

export function initMenu() {
  menuBtn.onclick = (e) => {
    e.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  };
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !(/** @type {HTMLElement} */ (e.target).closest(".menu-wrap"))) closeMenu();
  });
  menu.addEventListener("keydown", (e) => {
    const list = menuItems();
    const i = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length].focus();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length].focus();
    }
    if (e.key === "Tab") closeMenu();
  });

  $("m-export").onclick = exportJson;
  $("m-import").onclick = () => {
    closeMenu();
    $("importFile").click();
  };
  const fileInput = field("importFile");
  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) importJson(file);
  };
  $("m-cats").onclick = openCats;
  $("m-reset").onclick = resetDemo;
  $("m-exit").onclick = () => {
    location.hash = "";
  };
  $("m-password").onclick = openPw;
  $("m-mfa").onclick = openMfa;
  $("m-logout").onclick = () => {
    closeMenu();
    signOut();
  };
  for (const b of menu.querySelectorAll("[data-theme-set]")) {
    /** @type {HTMLElement} */ (b).onclick = () => applyTheme(/** @type {HTMLElement} */ (b).dataset.themeSet);
  }
  applyTheme(currentTheme());
  // Entrer dans la démo ou en sortir change de mode de stockage : on recharge.
  window.addEventListener("hashchange", () => location.reload());
}
