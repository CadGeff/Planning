// Traduction des erreurs Supabase en messages clairs, en français.
// On se fie d'abord au code d'erreur stable renvoyé par Supabase (Auth ou PostgREST),
// et seulement en dernier recours au texte du message, qui peut changer d'une version à l'autre.

const SESSION = "Session expirée. Reconnecte-toi.";
const BAD_CODE = "Code incorrect ou expiré. Attends le suivant dans ton application et réessaie.";
const RATE = "Trop d'essais. Patiente une minute avant de réessayer.";

/** @type {Record<string, string>} */
const BY_CODE = {
  // Supabase Auth
  invalid_credentials: "E-mail ou mot de passe incorrect.",
  email_not_confirmed: "Ce compte n'est pas confirmé. Coche « Auto Confirm User » en le créant dans Supabase.",
  same_password: "Le nouveau mot de passe doit être différent de l'actuel.",
  weak_password: "Mot de passe refusé par Supabase : trop court ou trop simple.",
  reauthentication_needed: "Supabase exige une connexion récente : déconnecte-toi, reconnecte-toi, puis réessaie.",
  mfa_verification_failed: BAD_CODE,
  mfa_challenge_expired: BAD_CODE,
  over_request_rate_limit: RATE,
  over_email_send_rate_limit: RATE,
  session_not_found: SESSION,
  session_expired: SESSION,
  refresh_token_not_found: SESSION,
  bad_jwt: SESSION,
  // PostgREST / Postgres
  PGRST301: SESSION,
  PGRST303: SESSION,
  42501: "Accès refusé par la base de données.",
};

/**
 * Repli sur le texte du message pour les erreurs sans code (réseau, anciennes versions).
 * @type {Array<[RegExp, string]>}
 */
const BY_MESSAGE = [
  [/failed to fetch|network|load failed/i, "Impossible de joindre le serveur. Vérifie ta connexion."],
  [/invalid login credentials/i, BY_CODE.invalid_credentials],
  [/should be different/i, BY_CODE.same_password],
  [/at least|weak password/i, BY_CODE.weak_password],
  [/(invalid|expired).*(totp|code|challenge)|(totp|code|challenge).*(invalid|expired)/i, BAD_CODE],
  [/jwt expired|not authenticated/i, SESSION],
  [/rate limit|too many/i, RATE],
];

/**
 * @param {unknown} err  erreur renvoyée par supabase-js
 * @param {string} [fallback]
 * @returns {Error}
 */
export function toFrench(err, fallback = "Erreur inconnue côté serveur.") {
  const e = /** @type {{ code?: string, message?: string, error_description?: string, status?: number }} */ (err || {});
  if (e.code && BY_CODE[e.code]) return new Error(BY_CODE[e.code]);
  const msg = e.message || e.error_description || "";
  for (const [re, text] of BY_MESSAGE) if (re.test(msg)) return new Error(text);
  if (e.status === 429) return new Error(RATE);
  return new Error(msg || fallback);
}

/** Table ou colonne absente : la base n'est pas à jour (schema.sql pas relancé). */
export const isMissingTable = (err) => /PGRST20[45]|42P01|42703|schema cache/i.test(`${err?.code} ${err?.message}`);
