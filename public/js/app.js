// Semainier — point d'entrée. Branche les modules d'interface, les raccourcis clavier,
// le service worker, puis démarre (session, chargement des données).

import { connectView } from "./state.js";
import { closeOpenDialog, anyDialogOpen, $ } from "./dom.js";
import { initBoard, render, goPrev, goNext, goToday, newItem } from "./board.js";
import { initMenu, closeMenu, isMenuOpen } from "./menu.js";
import { initToast, renderToast, dismissToast } from "./toast.js";
import { initForm } from "./form.js";
import { initDetail } from "./detail.js";
import { initCategories } from "./categories.js";
import { initAccount } from "./account.js";
import { initSession, boot } from "./session.js";

connectView({ render, renderToast });
initToast();
initBoard();
initMenu();
initForm();
initDetail();
initCategories();
initAccount();
initSession();

// ------------------------------------------------------------ Clavier
const SHORTCUTS = { ArrowLeft: goPrev, ArrowRight: goNext, t: goToday, n: newItem };

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    // Du plus proche au plus lointain : fenêtre, menu, puis notification.
    if (closeOpenDialog()) return;
    if (isMenuOpen()) closeMenu(true);
    else dismissToast();
    return;
  }
  // Raccourcis globaux : seulement dans l'application, hors champ de saisie, hors fenêtre ouverte.
  if (e.ctrlKey || e.metaKey || e.altKey || $("app").hidden) return;
  if (/** @type {HTMLElement} */ (e.target).closest?.("input, select, textarea, [contenteditable]")) return;
  if (anyDialogOpen() || isMenuOpen()) return;
  const action = SHORTCUTS[e.key] || SHORTCUTS[e.key.toLowerCase()];
  if (action) {
    e.preventDefault();
    action();
  }
});

boot();

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
