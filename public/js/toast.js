// Notifications : encart en bas de l'écran.
// Une confirmation disparaît seule ; une erreur ou un résultat d'import reste jusqu'au clic sur « OK ».

import { state, setStatus } from "./state.js";
import { $ } from "./dom.js";

/** Durée d'affichage d'une confirmation, en millisecondes. */
const AUTO_MS = 5000;
let timer = 0;

const scheduleClose = () => {
  clearTimeout(timer);
  if (state.status.msg && !state.status.sticky) timer = window.setTimeout(() => setStatus(""), AUTO_MS);
};

/** Affiche le message courant de `state.status`, ou masque l'encart s'il est vide. */
export function renderToast() {
  const { msg, warn, sticky } = state.status;
  const box = $("toast");
  clearTimeout(timer);
  box.hidden = !msg;
  if (!msg) return;
  $("toastMsg").textContent = msg;
  box.classList.toggle("warn", warn);
  $("toastOk").hidden = !sticky;
  scheduleClose();
}

/** Ferme la notification affichée. @returns {boolean} vrai s'il y en avait une */
export function dismissToast() {
  if (!state.status.msg) return false;
  setStatus("");
  return true;
}

export function initToast() {
  const box = $("toast");
  $("toastOk").onclick = dismissToast;
  // Le temps de lecture ne court pas pendant que le pointeur est sur l'encart.
  box.addEventListener("pointerenter", () => clearTimeout(timer));
  box.addEventListener("pointerleave", scheduleClose);
}
