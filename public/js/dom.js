// Petits outils DOM partagés.

/** @param {string} id */
export const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
/** Champ de formulaire (input ou select) par son id. @param {string} id */
export const field = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));
/** @param {string} id */
export const button = (id) => /** @type {HTMLButtonElement} */ (document.getElementById(id));

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Échappe un texte avant de l'insérer dans du HTML. @param {unknown} s */
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);

/**
 * Crée un élément sans passer par du HTML : le texte est toujours posé en textContent.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, any>} [props]  `class`, `text`, ou toute propriété DOM (onclick, type…)
 * @param {Array<Node|string|null|undefined>|Node|string} [kids]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else n[k] = v;
  }
  for (const c of [].concat(kids)) if (c) n.append(c);
  return n;
}

/**
 * Applique la géométrie calculée au rendu (data-top, data-height, data-lane…) via le CSSOM.
 * La CSP interdit les attributs style="" : les positions passent par ici.
 * @param {ParentNode} root
 */
export function applyGeometry(root) {
  const all = (sel) => /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(sel));
  for (const e of all("[data-top]")) e.style.top = `${e.dataset.top}px`;
  for (const e of all("[data-height]")) e.style.height = `${e.dataset.height}px`;
  for (const e of all("[data-pct]")) e.style.width = `${e.dataset.pct}%`;
  for (const e of all("[data-lanes]")) {
    const n = Number(e.dataset.lanes) || 1;
    e.style.left = `calc(${e.dataset.lane} / ${n} * 100% + 2px)`;
    e.style.width = `calc(100% / ${n} - 4px)`;
  }
}

/** Bouton en deux temps pour les actions destructives : 1er clic = armer, 2e = confirmer. */
export function arm(btn, label) {
  btn.classList.add("armed");
  btn.dataset.armed = "1";
  btn.textContent = label;
}
export function disarm(btn, label) {
  btn.classList.remove("armed");
  delete btn.dataset.armed;
  btn.textContent = label;
}
export const isArmed = (btn) => !!btn.dataset.armed;

/** Donne le focus après l'ouverture d'une fenêtre (laisse le temps à l'affichage). */
export const focusSoon = (target) => setTimeout(() => target?.focus(), 30);

// ------------------------------------------------------------ Fenêtres modales
/** @type {Map<string, () => void>} */
const dialogs = new Map();

/**
 * Déclare une fenêtre modale : clic sur le fond ou Échap la ferment.
 * @param {string} scrimId  id du fond (.scrim)
 * @param {() => void} close
 */
export function registerDialog(scrimId, close) {
  dialogs.set(scrimId, close);
  const scrim = $(scrimId);
  scrim.addEventListener("mousedown", (e) => {
    if (e.target === scrim) close();
  });
}

/** Ferme la fenêtre ouverte, s'il y en a une. @returns {boolean} une fenêtre a été fermée */
export function closeOpenDialog() {
  for (const [id, close] of dialogs) {
    if (!$(id).hidden) {
      close();
      return true;
    }
  }
  return false;
}

export const anyDialogOpen = () => !!document.querySelector(".scrim:not([hidden])");
