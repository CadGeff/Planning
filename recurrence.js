/* Semainier — dates et règles de récurrence (fonctions pures, sans DOM).
   Utilisable dans le navigateur (window.Recurrence) et dans Node (require). */
(function (root) {
  "use strict";

  const pad = n => String(n).padStart(2, "0");
  /** Date locale -> "AAAA-MM-JJ" */
  const ds = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  /** "AAAA-MM-JJ" -> Date locale à minuit */
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  /** Jour de la semaine, 0 = lundi … 6 = dimanche */
  const dow = d => (d.getDay() + 6) % 7;
  const mondayOf = d => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -dow(d));
  /** Numéro de semaine ISO 8601 */
  const isoWeek = d => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const n = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - n);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 864e5 + 1) / 7);
  };
  const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const fromMin = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

  const DN = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const DL = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

  /** Jours actifs d'une règle hebdo (par défaut : le jour de la date de départ). */
  const weekDays = it => (it.days && it.days.length ? it.days : [dow(parse(it.start))]);

  /**
   * L'élément a-t-il une occurrence le jour `day` ("AAAA-MM-JJ") ?
   * - none    : uniquement à la date de départ
   * - daily   : tous les jours à partir de la date de départ
   * - weekly  : les jours de semaine cochés
   * - monthly : même quantième chaque mois ; le 31 tombe le dernier jour des mois courts
   * Un jour présent dans `skipped` est retiré de la série.
   */
  function occurs(it, day) {
    if (!it.start || day < it.start) return false;
    if (it.skipped && it.skipped[day]) return false;
    const d = parse(day), s = parse(it.start);
    switch (it.recur) {
      case "daily": return true;
      case "weekly": return weekDays(it).includes(dow(d));
      case "monthly": {
        const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        return d.getDate() === Math.min(s.getDate(), dim);
      }
      default: return day === it.start;
    }
  }

  function recurText(it) {
    if (it.recur === "daily") return "Chaque jour";
    if (it.recur === "weekly") {
      const days = weekDays(it).slice().sort((a, b) => a - b);
      if (days.length === 7) return "Chaque jour";
      if (days.join() === "0,1,2,3,4") return "Chaque jour de semaine (lun → ven)";
      return "Chaque semaine : " + days.map(i => DL[i]).join(", ");
    }
    if (it.recur === "monthly") return `Chaque mois, le ${parse(it.start).getDate()}`;
    return "Une seule fois";
  }

  const isDone = (it, day) => !!(it.done && it.done[day]);

  const api = { pad, ds, parse, addDays, dow, mondayOf, isoWeek, toMin, fromMin, DN, DL, occurs, recurText, isDone };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Recurrence = api;
})(typeof window !== "undefined" ? window : globalThis);
