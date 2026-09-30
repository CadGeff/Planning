// Traduction des erreurs Supabase.
import test from "node:test";
import assert from "node:assert/strict";
import { toFrench, isMissingTable } from "../../public/js/errors.js";

test("le code d'erreur prime sur le texte anglais", () => {
  assert.equal(
    toFrench({ code: "same_password", message: "New password should be different" }).message,
    "Le nouveau mot de passe doit être différent de l'actuel.",
  );
  assert.match(
    toFrench({ code: "mfa_verification_failed", message: "Invalid TOTP code entered" }).message,
    /^Code incorrect ou expiré/,
  );
  assert.match(
    toFrench({ code: "42501", message: "new row violates row-level security policy" }).message,
    /Accès refusé/,
  );
});

test("sans code : repli sur le message", () => {
  assert.match(toFrench(new TypeError("Failed to fetch")).message, /Impossible de joindre le serveur/);
  assert.equal(toFrench({ message: "Invalid login credentials" }).message, "E-mail ou mot de passe incorrect.");
  assert.match(toFrench({ status: 429 }).message, /Trop d'essais/);
});

test("serveur sans code d'erreur (GoTrue ancien ou auto-hébergé)", () => {
  assert.match(toFrench({ message: "New password should be different from the old password." }).message, /différent/);
  assert.match(toFrench({ message: "Password should be at least 16 characters." }).message, /trop court/);
  assert.match(toFrench({ message: "Invalid TOTP code entered" }).message, /^Code incorrect ou expiré/);
  assert.match(toFrench({ message: "MFA challenge has expired" }).message, /^Code incorrect ou expiré/);
  assert.match(toFrench(new TypeError("The network connection was lost.")).message, /Impossible de joindre/);
});

test("erreur inconnue : message d'origine, sinon message générique", () => {
  assert.equal(toFrench({ code: "nouveau_code", message: "Something else" }).message, "Something else");
  assert.equal(toFrench(null).message, "Erreur inconnue côté serveur.");
});

test("table absente détectée (schema.sql à relancer)", () => {
  assert.equal(isMissingTable({ code: "PGRST205", message: "Could not find the table" }), true);
  assert.equal(
    isMissingTable({
      code: "PGRST204",
      message: "Could not find the 'cat_labels' column of 'settings' in the schema cache",
    }),
    true,
  );
  assert.equal(isMissingTable({ code: "42501" }), false);
});
