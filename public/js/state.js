// État de l'application et écritures vers le stockage.
// Les modules d'interface lisent `state` et appellent les actions ; l'affichage est
// rafraîchi par `render()`, branché au démarrage (évite les dépendances circulaires).

import { Store } from "./store.js";
import { DEFAULT_LABELS } from "./items.js";

/** @import { Item } from "./items.js" */

const todayDate = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};

export const state = {
  /** @type {Item[]} */
  items: [],
  loaded: false,
  /** @type {string|null} */
  email: null,
  /** Jour sélectionné : la semaine affichée est celle qui le contient. */
  sel: todayDate(),
  /** @type {Record<string, string>} nom de chaque catégorie */
  labels: { ...DEFAULT_LABELS },
  /** @type {string|null} catégorie mise en avant via la légende */
  focusCat: null,
  status: { msg: "", warn: false },
  /** Écritures en cours : un rechargement ne doit pas écraser l'affichage pendant ce temps. */
  pending: 0,
};

export { todayDate };
export const catLabel = (c) => state.labels[c] || DEFAULT_LABELS[c] || c;
/** @template T @param {T} o @returns {T} */
export const clone = (o) => JSON.parse(JSON.stringify(o));

// ------------------------------------------------------------ Rafraîchissement
let renderFn = () => {};
let statusFn = () => {};
/** Branche les fonctions d'affichage (appelé une fois au démarrage). */
export function connectView({ render, renderStatus }) {
  renderFn = render;
  statusFn = renderStatus;
}
export const render = () => renderFn();

/** Message affiché dans la barre d'état. @param {string} msg @param {boolean} [warn] */
export function setStatus(msg, warn = false) {
  state.status = { msg, warn };
  statusFn();
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

/** @param {string} id */
export function removeItem(id) {
  state.items = state.items.filter((x) => x.id !== id);
  render();
  return queue(id, () => Store.remove(id));
}

export const findItem = (id) => state.items.find((x) => x.id === id);
