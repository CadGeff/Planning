// Compte (mode Supabase) : changement de mot de passe et double authentification.

import { Store } from "./store.js";
import { state, setStatus } from "./state.js";
import { $, field, button, el, arm, isArmed, focusSoon, registerDialog } from "./dom.js";
import { closeMenu } from "./menu.js";

/** Longueur minimale côté interface ; Supabase applique en plus sa propre règle. */
const PASSWORD_MIN = 12;
/** La révocation des autres sessions n'a pas été confirmée par le serveur. */
const OTHERS_KEPT =
  "Les autres appareils n'ont pas pu être déconnectés : utilise « Se déconnecter » pour fermer toutes les sessions.";
/** Un code TOTP saisi avec ou sans espace (Aegis affiche « 123 456 »). */
export const normalizeCode = (s) => s.replace(/\s/g, "");
export const isValidCode = (s) => /^\d{6}$/.test(s);
const CODE_HINT = "Entre les 6 chiffres affichés par ton application.";

// ------------------------------------------------------------ Mot de passe
export function openPw() {
  closeMenu();
  // Champ identifiant caché : aide les gestionnaires de mots de passe à associer le compte.
  field("pw-user").value = state.email || "";
  field("pw-new").value = "";
  field("pw-confirm").value = "";
  $("pwErr").hidden = true;
  $("pwScrim").hidden = false;
  focusSoon(field("pw-new"));
}

function closePw() {
  $("pwScrim").hidden = true;
  field("pw-new").value = "";
  field("pw-confirm").value = "";
}

async function submitPw(e) {
  e.preventDefault();
  const p1 = field("pw-new").value;
  const p2 = field("pw-confirm").value;
  const err = $("pwErr");
  const fail = (m) => {
    err.textContent = m;
    err.hidden = false;
  };
  if (p1.length < PASSWORD_MIN)
    return fail(`${PASSWORD_MIN} caractères minimum. Idéalement, génère-le avec ton gestionnaire.`);
  if (p1 !== p2) return fail("Les deux saisies ne sont pas identiques.");
  const btn = button("pw-save");
  btn.disabled = true;
  btn.textContent = "Changement…";
  try {
    const revoked = await Store.changePassword(p1);
    closePw();
    if (revoked) setStatus("Mot de passe changé. Les autres appareils ont été déconnectés.");
    else setStatus(`Mot de passe changé. ${OTHERS_KEPT}`, true);
  } catch (ex) {
    fail(ex.message || "Changement impossible.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Changer";
  }
}

// ------------------------------------------------------------ Double authentification
// Rendu construit avec des nœuds DOM (textContent) : aucune donnée n'est injectée en HTML.
const mfaErr = (m) => {
  const e = $("mfaErr");
  e.textContent = m || "";
  e.hidden = !m;
};
function mfaRender(body, actions) {
  $("mfaBody").replaceChildren(...body);
  $("mfaActions").replaceChildren(...actions);
}

function showDisabled() {
  mfaRender(
    [
      el("p", {}, [el("span", { class: "mfa-state", text: "Désactivée" })]),
      el("p", {
        text: "Une fois activée, chaque nouvelle connexion demandera un code à 6 chiffres de ton application d'authentification, en plus du mot de passe. La base de données refusera toute requête sans ce code : un mot de passe volé ne suffira plus.",
      }),
    ],
    [
      el("button", { type: "button", class: "btn", text: "Fermer", onclick: closeMfa }),
      el("button", { type: "button", class: "btn primary", text: "Activer", onclick: startEnroll }),
    ],
  );
}

/** @param {string} factorId */
function showEnabled(factorId) {
  const off = el("button", { type: "button", class: "btn danger spacer", text: "Désactiver" });
  off.onclick = async () => {
    if (!isArmed(off)) return arm(off, "Confirmer la désactivation");
    off.disabled = true;
    try {
      await Store.mfaDisable(factorId);
      setStatus("Double authentification désactivée.");
      mfaErr("");
      showDisabled();
    } catch (ex) {
      mfaErr(ex.message);
      off.disabled = false;
    }
  };
  mfaRender(
    [
      el("p", {}, [el("span", { class: "mfa-state on", text: "Active" })]),
      el("p", {
        text: "Chaque nouvelle connexion demande le code de ton application. Les données sont inaccessibles sans lui, y compris via l'API.",
      }),
      el("p", {
        text: "Si tu perds ton application et sa sauvegarde : supprime le facteur depuis le tableau de bord Supabase (Authentication → Users → ton compte), puis reconnecte-toi.",
      }),
    ],
    [off, el("button", { type: "button", class: "btn primary", text: "Fermer", onclick: closeMfa })],
  );
}

async function startEnroll() {
  mfaErr("");
  let en;
  try {
    en = await Store.mfaEnroll();
  } catch (ex) {
    return mfaErr(ex.message);
  }
  // Le QR code est une image data: (autorisée par img-src de la CSP), jamais du HTML.
  const qr = el("img", {
    class: "mfa-qr",
    alt: "QR code à scanner avec ton application d'authentification",
    src: en.qr,
  });
  const code = el("input", {
    class: "inp code-inp",
    type: "text",
    id: "mfa-code",
    inputMode: "numeric",
    autocomplete: "one-time-code",
    maxLength: 7,
    spellcheck: false,
  });
  const ok = el("button", { type: "button", class: "btn primary", text: "Valider" });
  const submit = async () => {
    const c = normalizeCode(code.value);
    if (!isValidCode(c)) return mfaErr(CODE_HINT);
    ok.disabled = true;
    try {
      await Store.mfaVerify(en.factorId, c);
      if (await Store.signOutOthers())
        setStatus("Double authentification activée. Les autres appareils devront se reconnecter avec le code.");
      else setStatus(`Double authentification activée. ${OTHERS_KEPT}`, true);
      mfaErr("");
      showEnabled(en.factorId);
    } catch (ex) {
      mfaErr(ex.message);
      ok.disabled = false;
      code.select();
    }
  };
  ok.onclick = submit;
  code.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  });
  mfaRender(
    [
      el("p", {}, [el("b", { text: "1. " }), "Dans Aegis, appuie sur + puis « Scanner un code QR »."]),
      qr,
      el("p", { text: "Pas de caméra ? Saisis cette clé à la main :" }),
      el("div", { class: "mfa-secret", text: en.secret }),
      el("p", {}, [el("b", { text: "2. " }), "Entre le code à 6 chiffres affiché :"]),
      code,
    ],
    [el("button", { type: "button", class: "btn", text: "Annuler", onclick: closeMfa }), ok],
  );
  focusSoon(code);
}

export async function openMfa() {
  closeMenu();
  mfaErr("");
  mfaRender([el("p", { text: "Chargement…" })], []);
  $("mfaScrim").hidden = false;
  try {
    const st = await Store.mfaStatus();
    if (st.enabled) showEnabled(st.factorId);
    else showDisabled();
  } catch (ex) {
    mfaErr(ex.message);
    mfaRender([], [el("button", { type: "button", class: "btn", text: "Fermer", onclick: closeMfa })]);
  }
}

function closeMfa() {
  $("mfaScrim").hidden = true;
  mfaRender([], []);
}

export { CODE_HINT };

export function initAccount() {
  $("pw-cancel").onclick = closePw;
  $("pwForm").addEventListener("submit", submitPw);
  registerDialog("pwScrim", closePw);
  registerDialog("mfaScrim", closeMfa);
}
