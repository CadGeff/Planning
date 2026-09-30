// Variables globales posées par les scripts classiques (config.js, vendor/supabase).
interface Window {
  SEMAINIER_CONFIG?: { supabaseUrl?: string; supabaseKey?: string };
  /** Client supabase-js (build UMD du dossier vendor/). */
  supabase: any;
}
