/* Semainier — couche de stockage.
 *
 * Trois modes avec la même interface :
 *   mode           "local" (config vide) | "demo" (URL en #demo) | "supabase"
 *   init()         -> { signedIn, email? }
 *   signIn(e, p)   (Supabase seulement)
 *   signOut()      (Supabase seulement)
 *   onSignedOut(fn)
 *   list()         -> tableau d'éléments, ou null si rien n'a jamais été enregistré (local)
 *   save(item)     crée ou remplace un élément
 *   saveMany(items)
 *   remove(id)
 *   clear()        (local et démo : efface tout)
 *   getSettings() -> { catLabels } ou null ; saveSettings({ catLabels })
 *
 * Forme d'un élément côté application :
 *   { id, title, kind: "block"|"task", start: "AAAA-MM-JJ", from?: "HH:MM", to?: "HH:MM",
 *     recur: "none"|"daily"|"weekly"|"monthly", days?: [0..6], cat,
 *     done: { "AAAA-MM-JJ": true }, skipped: { "AAAA-MM-JJ": true }, example? }
 */
(function () {
  "use strict";

  const cfg = window.SEMAINIER_CONFIG || {};

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  /** Refuse une clé à privilèges (secret / service_role) mise par erreur dans config.js. */
  function isPrivilegedKey(key) {
    if (/^sb_secret_/.test(key)) return true;
    const parts = key.split(".");
    if (parts.length !== 3) return false;
    try {
      const json = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      return json.role === "service_role";
    } catch (e) { return false; }
  }

  // ------------------------------------------------- Local et démo
  // Même code, clé de stockage différente : la démo ne touche jamais aux données locales.
  const makeLocalStore = (mode, key) => ({
    mode,
    _items: null,
    async init() { return { signedIn: true }; },
    async signIn() {}, async signOut() {}, onSignedOut() {},
    async list() {
      try {
        const raw = localStorage.getItem(key);
        this._items = raw ? JSON.parse(raw) : null;
      } catch (e) { this._items = null; }
      return this._items ? this._items.map(x => ({ ...x })) : null;
    },
    async clear() {
      this._items = null;
      try { localStorage.removeItem(key); localStorage.removeItem(key + ".settings"); } catch (e) {}
    },
    async getSettings() {
      try { const raw = localStorage.getItem(key + ".settings"); return raw ? JSON.parse(raw) : null; }
      catch (e) { return null; }
    },
    async saveSettings(s) {
      try { localStorage.setItem(key + ".settings", JSON.stringify(s)); }
      catch (e) { throw new Error("Le navigateur refuse d'enregistrer (navigation privée ou stockage plein)."); }
    },
    _write() {
      try { localStorage.setItem(key, JSON.stringify(this._items || [])); }
      catch (e) { throw new Error("Le navigateur refuse d'enregistrer (navigation privée ou stockage plein)."); }
    },
    async save(item) {
      this._items = this._items || [];
      const i = this._items.findIndex(x => x.id === item.id);
      if (i >= 0) this._items[i] = { ...item }; else this._items.push({ ...item });
      this._write();
    },
    async saveMany(items) { for (const it of items) await this.save(it); },
    async remove(id) {
      this._items = (this._items || []).filter(x => x.id !== id);
      this._write();
    }
  });

  // ------------------------------------------------------------- Supabase
  const COLS = "id,title,kind,start_date,time_from,time_to,recur,days,cat,done,skipped";

  const toRow = it => ({
    id: it.id,
    title: it.title,
    kind: it.kind,
    start_date: it.start,
    time_from: it.from || null,
    time_to: it.to || null,
    recur: it.recur || "none",
    days: it.recur === "weekly" ? (it.days || []) : null,
    cat: it.cat || "bleu",
    done: it.done || {},
    skipped: it.skipped || {}
  });

  const fromRow = r => {
    const it = {
      id: r.id, title: r.title, kind: r.kind, start: r.start_date,
      recur: r.recur, cat: r.cat, done: r.done || {}, skipped: r.skipped || {}
    };
    if (r.time_from && r.time_to) { it.from = r.time_from.slice(0, 5); it.to = r.time_to.slice(0, 5); }
    if (r.days) it.days = r.days;
    return it;
  };

  function frenchError(err) {
    const msg = (err && (err.message || err.error_description)) || "";
    if (/invalid login credentials/i.test(msg)) return new Error("E-mail ou mot de passe incorrect.");
    if (/email not confirmed/i.test(msg)) return new Error("Ce compte n'est pas confirmé. Coche « Auto Confirm User » en le créant dans Supabase.");
    if (/failed to fetch|network|load failed/i.test(msg)) return new Error("Impossible de joindre le serveur. Vérifie ta connexion.");
    if (/jwt|not authenticated|401/i.test(msg)) return new Error("Session expirée. Reconnecte-toi.");
    return new Error(msg || "Erreur inconnue côté serveur.");
  }

  function makeSupabaseStore() {
    const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    const signedOutHandlers = [];
    let uid = null;
    client.auth.onAuthStateChange((event, session) => {
      uid = session && session.user ? session.user.id : null;
      if (event === "SIGNED_OUT") signedOutHandlers.forEach(fn => fn());
    });

    return {
      mode: "supabase",
      async init() {
        const { data } = await client.auth.getSession();
        const s = data && data.session;
        uid = s && s.user ? s.user.id : null;
        return { signedIn: !!s, email: s && s.user && s.user.email };
      },
      async signIn(email, password) {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw frenchError(error);
        uid = data.user && data.user.id;
        return { email: data.user && data.user.email };
      },
      /** Réglages synchronisés (noms des catégories). null si rien n'est enregistré. */
      async getSettings() {
        const { data, error } = await client.from("settings").select("cat_labels").maybeSingle();
        if (error) {
          if (/settings|PGRST205|42P01|schema cache/i.test(`${error.code} ${error.message}`)) {
            throw new Error("Noms des catégories non synchronisés : relance supabase/schema.sql dans le SQL Editor de Supabase.");
          }
          throw frenchError(error);
        }
        return data ? { catLabels: data.cat_labels || {} } : null;
      },
      async saveSettings(s) {
        const { error } = await client.from("settings").upsert({ user_id: uid, cat_labels: s.catLabels || {} }, { onConflict: "user_id" });
        if (error) throw frenchError(error);
      },
      async signOut() { await client.auth.signOut(); },
      onSignedOut(fn) { signedOutHandlers.push(fn); },
      async list() {
        const { data, error } = await client.from("items").select(COLS).order("created_at", { ascending: true });
        if (error) throw frenchError(error);
        return data.map(fromRow);
      },
      async save(item) {
        const { error } = await client.from("items").upsert(toRow(item));
        if (error) throw frenchError(error);
      },
      async saveMany(items) {
        if (!items.length) return;
        const { error } = await client.from("items").upsert(items.map(toRow));
        if (error) throw frenchError(error);
      },
      async remove(id) {
        const { error } = await client.from("items").delete().eq("id", id);
        if (error) throw frenchError(error);
      }
    };
  }

  // -------------------------------------------------------------- Choix
  // #demo dans l'URL : démo publique, données d'exemple dans le navigateur, aucun appel à Supabase.
  const DEMO = location.hash === "#demo";
  let store = makeLocalStore("local", "semainier.items.v1");
  let configError = null;
  if (DEMO) {
    store = makeLocalStore("demo", "semainier.demo.v1");
  } else if (cfg.supabaseUrl || cfg.supabaseKey) {
    if (!cfg.supabaseUrl || !cfg.supabaseKey) configError = "config.js : il faut à la fois supabaseUrl et supabaseKey.";
    else if (isPrivilegedKey(cfg.supabaseKey)) configError = "config.js contient une clé secrète (service_role / sb_secret). Remplace-la par la clé publishable ou anon, et régénère la clé secrète dans Supabase.";
    else if (!window.supabase) configError = "Le client Supabase n'a pas pu être chargé (vendor/).";
    else store = makeSupabaseStore();
  }

  window.Store = store;
  window.StoreConfigError = configError;
  window.newId = uuid;
})();
