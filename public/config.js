/* Semainier — configuration.
 *
 * Laisse les deux champs vides pour le MODE LOCAL : les données restent dans ce
 * navigateur (pratique pour tester, pas de synchro entre appareils).
 *
 * Renseigne-les pour le MODE SUPABASE (voir README, étape 2) :
 *   supabaseUrl : bouton Connect du projet, ou Project Settings → API Keys
 *   supabaseKey : la clé « publishable » (sb_publishable_…) ou, sur un ancien projet, la clé « anon ».
 *
 * Ces deux valeurs sont publiques par conception : elles finissent dans le navigateur
 * de toute façon. La sécurité repose sur la Row Level Security (supabase/schema.sql)
 * et sur la désactivation des inscriptions.
 * Ne mets JAMAIS ici la clé secrète (sb_secret_…) ni la clé service_role.
 */
window.SEMAINIER_CONFIG = {
  supabaseUrl: "https://igyoyutosvkbeeiriwyf.supabase.co",
  supabaseKey: "sb_publishable_gr-diHtjqSlgSQv16KFegQ_qZwvaFiI"
};
