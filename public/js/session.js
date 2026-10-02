// Connexion (mode Supabase), étape du code 2FA, chargement des données et démarrage.

import { sample, cleanLabels } from "./items.js";
import { Store, configError } from "./store.js";
import { state, clone, render, setStatus } from "./state.js";
import { $, field, button, focusSoon } from "./dom.js";
import { syncMenu } from "./menu.js";
import { scrollToNow } from "./board.js";
import { loadSettings } from "./categories.js";
import { normalizeCode, isValidCode, CODE_HINT } from "./account.js";

/** Facteur 2FA à valider à l'étape du code. */
let mfaFactorId = null;

/**
 * Mode Supabase : si la 2FA est active et que la session n'a pas encore validé le code,
 * on passe à l'étape du code au lieu d'afficher un planning vide (la base refuserait tout).
 * @returns {Promise<boolean>} true si l'étape du code est affichée
 */
async function codeRequired() {
  if (Store.mode !== "supabase") return false;
  const st = await Store.mfaStatus();
  if (!st.needsCode) return false;
  mfaFactorId = st.factorId;
  state.items = [];
  state.loaded = false;
  state.hasData = false;
  showCodeStep();
  return true;
}

/**
 * Recharge les éléments et les réglages depuis le stockage.
 * @param {{ silent?: boolean, mfaChecked?: boolean }} [opts]
 *   silent : garder le message affiché ; mfaChecked : la 2FA vient d'être vérifiée, inutile de redemander
 */
export async function reload({ silent = false, mfaChecked = false } = {}) {
  if (state.pending) return;
  try {
    if (!mfaChecked && (await codeRequired())) return;
    const list = await Store.list();
    if (state.pending) return; // une écriture a démarré entre-temps : on garde l'état local
    if (list === null && Store.mode !== "supabase") {
      // Premier lancement en local ou en démo : données d'exemple.
      state.items = sample();
      await Store.saveMany(state.items.map(clone));
    } else state.items = list || [];
    state.loaded = true;
    state.hasData = true;
    if (!silent || state.status.warn) setStatus("");
    await loadSettings();
    render();
  } catch (err) {
    state.loaded = true;
    setStatus(err.message || "Chargement impossible.", true);
    render();
  }
}

// ------------------------------------------------------------ Écrans
function showLogin(msg = "") {
  $("app").hidden = true;
  $("login").hidden = false;
  $("loginForm").hidden = false;
  $("codeForm").hidden = true;
  const e = $("loginErr");
  e.hidden = !msg;
  e.textContent = msg;
  focusSoon(field("l-email"));
}

function showCodeStep() {
  $("app").hidden = true;
  $("login").hidden = false;
  $("loginForm").hidden = true;
  $("codeForm").hidden = false;
  field("l-code").value = "";
  $("codeErr").hidden = true;
  focusSoon(field("l-code"));
}

/** Affiche l'application puis charge les données. */
async function enterApp(opts = {}) {
  $("login").hidden = true;
  $("app").hidden = false;
  syncMenu();
  render();
  await reload(opts);
  scrollToNow();
}

export async function signOut() {
  await Store.signOut();
}

async function submitLogin(e) {
  e.preventDefault();
  const email = field("l-email").value.trim();
  const password = field("l-pass").value;
  const err = $("loginErr");
  if (!email || !password) {
    err.textContent = "Renseigne ton e-mail et ton mot de passe.";
    err.hidden = false;
    return;
  }
  const btn = button("loginBtn");
  btn.disabled = true;
  btn.textContent = "Connexion…";
  try {
    const r = await Store.signIn(email, password);
    state.email = r.email || email;
    field("l-pass").value = "";
    if (await codeRequired()) return;
    await enterApp({ mfaChecked: true });
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Se connecter";
  }
}

async function submitCode(e) {
  e.preventDefault();
  const code = normalizeCode(field("l-code").value);
  const err = $("codeErr");
  if (!isValidCode(code)) {
    err.textContent = CODE_HINT;
    err.hidden = false;
    return;
  }
  const btn = button("codeBtn");
  btn.disabled = true;
  btn.textContent = "Vérification…";
  try {
    await Store.mfaVerify(mfaFactorId, code);
    await enterApp({ mfaChecked: true });
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
    field("l-code").select();
  } finally {
    btn.disabled = false;
    btn.textContent = "Valider";
  }
}

export function initSession() {
  $("loginForm").addEventListener("submit", submitLogin);
  $("codeForm").addEventListener("submit", submitCode);
  $("codeCancel").onclick = async () => {
    await Store.signOut();
    showLogin();
  };
  Store.onSignedOut(() => {
    state.items = [];
    state.loaded = false;
    state.hasData = false;
    state.email = null;
    state.labels = cleanLabels(null);
    showLogin();
  });
  // Retour sur l'onglet ou retour du réseau : on recharge (synchro entre appareils).
  const resync = () => {
    if (state.loaded && Store.mode === "supabase") reload({ silent: true });
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resync();
  });
  window.addEventListener("online", resync);
}

export async function boot() {
  let session;
  try {
    session = await Store.init();
  } catch {
    session = { signedIn: false, email: null };
  }
  if (!session.signedIn) return showLogin();
  state.email = session.email;
  let checked = false;
  try {
    if (await codeRequired()) return;
    checked = true;
  } catch {
    /* hors ligne : on tente quand même d'afficher le cache */
  }
  await enterApp({ mfaChecked: checked });
  if (configError) setStatus(configError, true);
}
