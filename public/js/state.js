// État de l'application et écritures vers le stockage.
// Les modules d'interface lisent `state` et appellent les actions ; l'affichage est
// rafraîchi par `render()`, branché au démarrage (évite les dépendances circulaires).

import { Store } from "./store.js";
import { DEFAULT_LABELS } from "./items.js";
import { isDone } from "./recurrence.js";
import { isOneOff, doneDay } from "./carry.js";

/** @import { Item } from "./items.js" */

const todayDate = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};

export const state = {
  /** @type {Item[]} */
  items: [],
  loaded: false,
  /** Le planning a été lu au moins une fois : `items` reflète le stockage (faux après un chargement en échec). */
  hasData: false,
  /** @type {string|null} */
  email: null,
  /** Jour sélectionné : la semaine affichée est celle qui le contient. */
  sel: todayDate(),
  /** @type {Record<string, string>} nom de chaque catégorie */
  labels: { ...DEFAULT_LABELS },
  /** @type {string|null} catégorie mise en avant via la légende */
  focusCat: null,
  /** @type {Toast[]} notifications affichées, de la plus ancienne à la plus récente */
  toasts: [],
  /** Écritures en cours : un rechargement ne doit pas écraser l'affichage pendant ce temps. */
  pending: 0,
};

export { todayDate };
export const catLabel = (c) => state.labels[c] || DEFAULT_LABELS[c] || c;
/** @template T @param {T} o @returns {T} */
export const clone = (o) => JSON.parse(JSON.stringify(o));

// ------------------------------------------------------------ Rafraîchissement
let renderFn = () => {};
let toastFn = () => {};
/** Branche les fonctions d'affichage (appelé une fois au démarrage). */
export function connectView({ render, renderToast }) {
  renderFn = render;
  toastFn = renderToast;
}
export const render = () => renderFn();

/**
 * Une notification.
 * @typedef {object} Toast
 * @property {number} id
 * @property {string} msg
 * @property {boolean} warn    erreur
 * @property {boolean} sticky  reste jusqu'au clic sur « OK »
 */

/** Nombre maximal de notifications à l'écran : au-delà, la plus ancienne laisse sa place. */
export const MAX_TOASTS = 3;
let toastId = 0;

/**
 * Ajoute une notification à la pile ; un message vide les ferme toutes.
 * @param {string} msg
 * @param {boolean} [warn]    erreur
 * @param {boolean} [sticky]  reste jusqu'au clic sur « OK » (par défaut : les erreurs)
 */
export function setStatus(msg, warn = false, sticky = warn) {
  if (!msg) state.toasts = [];
  else state.toasts = [...state.toasts, { id: ++toastId, msg, warn, sticky }].slice(-MAX_TOASTS);
  toastFn();
}

/**
 * Ferme une notification, désignée par son identifiant ou par son texte.
 * @param {number | string} which
 */
export function dropStatus(which) {
  const before = state.toasts.length;
  state.toasts = state.toasts.filter((t) => t.id !== which && t.msg !== which);
  if (state.toasts.length !== before) toastFn();
}

// ------------------------------------------------------------ Écritures en file
// Une écriture à la fois par élément, dans l'ordre des actions.
/** @type {Record<string, Promise<unknown>>} */
const chains = {};

/** @param {string} id @param {() => Promise<unknown>} op */
function queue(id, op) {
  state.pending++;
  chains[id] = (chains[id] || Promise.resolve())
    .then(op)
    .catch((e) => setStatus(e?.message || "Enregistrement impossible.", true))
    .finally(() => state.pending--);
  return chains[id];
}

/** Suit une opération ponctuelle (import, réglages) pour bloquer les rechargements. */
export async function tracked(op) {
  state.pending++;
  try {
    return await op();
  } finally {
    state.pending--;
  }
}

/** Crée ou remplace un élément. @param {Item} it */
export function putItem(it) {
  const i = state.items.findIndex((x) => x.id === it.id);
  if (i >= 0) state.items[i] = it;
  else state.items.push(it);
  render();
  return queue(it.id, () => Store.save(clone(it)));
}

/**
 * Coche / décoche un jour (`done`) ou retire un jour d'une série (`skipped`).
 * @param {string} id @param {"done"|"skipped"} fieldName @param {string} day @param {boolean} on
 */
export function setDayFlag(id, fieldName, day, on) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  const map = { ...(it[fieldName] || {}) };
  if (on) map[day] = true;
  else delete map[day];
  it[fieldName] = map;
  render();
  return queue(id, () => Store.save(clone(it)));
}

/**
 * Coche ou décoche une tâche pour le jour `day`. Une tâche ponctuelle n'a qu'un état :
 * la cocher retient le jour où elle a été faite, la décocher l'efface, où qu'on clique.
 * @param {string} id @param {string} day
 */
export function toggleDone(id, day) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  if (!isOneOff(it)) return setDayFlag(id, "done", day, !isDone(it, day));
  it.done = doneDay(it) === null ? { [day]: true } : {};
  render();
  return queue(id, () => Store.save(clone(it)));
}

/** @param {string} id */
export function removeItem(id) {
  state.items = state.items.filter((x) => x.id !== id);
  render();
  return queue(id, () => Store.remove(id));
}

export const findItem = (id) => state.items.find((x) => x.id === id);
