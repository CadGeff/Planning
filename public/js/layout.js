// Placement des créneaux qui se chevauchent : chaque groupe de créneaux qui se recouvrent
// est réparti en couloirs côte à côte. Fonction pure, testée sous Node.

import { toMin } from "./recurrence.js";

/** Durée minimale affichée, pour qu'un créneau très court reste cliquable. */
const MIN_SPAN = 15;

/**
 * @template {{ from?: string, to?: string }} T
 * @param {T[]} evts  créneaux d'une même journée (modifiés en place)
 * @returns {Array<T & { lane: number, lanes: number }>}  triés par heure de début ;
 *   `lane` = couloir (0…), `lanes` = nombre de couloirs du groupe
 */
export function layout(evts) {
  const out = /** @type {Array<T & { lane: number, lanes: number }>} */ (evts);
  out.sort((a, b) => toMin(a.from) - toMin(b.from) || toMin(b.to) - toMin(a.to));
  let group = [];
  let lanesEnd = [];
  let groupEnd = -1;
  const flush = () => {
    for (const e of group) e.lanes = lanesEnd.length;
    group = [];
    lanesEnd = [];
  };
  for (const e of out) {
    const s = toMin(e.from);
    const end = Math.max(toMin(e.to), s + MIN_SPAN);
    if (s >= groupEnd && group.length) flush();
    let lane = lanesEnd.findIndex((x) => x <= s);
    if (lane < 0) {
      lane = lanesEnd.length;
      lanesEnd.push(end);
    } else lanesEnd[lane] = end;
    e.lane = lane;
    group.push(e);
    groupEnd = Math.max(groupEnd, end);
  }
  flush();
  return out;
}
