// Noms des catégories (couleurs) : fenêtre d'édition et synchronisation.

import { CATS, DEFAULT_LABELS, LABEL_MAX, cleanLabels } from "./items.js";
import { Store } from "./store.js";
import { state, render, setStatus, tracked } from "./state.js";
import { $, field, esc, focusSoon, registerDialog } from "./dom.js";
import { closeMenu } from "./menu.js";

/** @param {Record<string, string>} src */
function fillFields(src) {
  $("catFields").innerHTML = CATS.map(
    (c) => `
    <label data-cat="${c}"><span class="dot" aria-hidden="true"></span>
      <input class="inp" id="c-${c}" maxlength="${LABEL_MAX}" autocomplete="off" value="${esc(src[c])}" aria-label="Nom de la catégorie ${c}">
    </label>`,
  ).join("");
}

export function openCats() {
  closeMenu();
  fillFields(state.labels);
  $("catErr").hidden = true;
  $("catScrim").hidden = false;
  focusSoon(field("c-bleu"));
}

function closeCats() {
  $("catScrim").hidden = true;
}

/** Charge les noms enregistrés ; en cas d'échec, noms par défaut et message. */
export async function loadSettings() {
  try {
    const s = await Store.getSettings();
    state.labels = cleanLabels(s?.catLabels);
  } catch (err) {
    state.labels = { ...DEFAULT_LABELS };
    setStatus(err.message, true);
  }
}

export function initCategories() {
  $("c-cancel").onclick = closeCats;
  $("c-default").onclick = () => fillFields(DEFAULT_LABELS);
  $("catForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const next = cleanLabels(Object.fromEntries(CATS.map((c) => [c, field(`c-${c}`).value])));
    state.labels = next;
    closeCats();
    render();
    try {
      await tracked(() => Store.saveSettings({ catLabels: next }));
      setStatus("Catégories enregistrées.");
    } catch (err) {
      setStatus(err.message || "Enregistrement impossible.", true);
    }
  });
  registerDialog("catScrim", closeCats);
}
