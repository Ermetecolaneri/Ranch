// Collegamento a Supabase. Con URL o chiave vuoti l'app gira in modalità demo con dati di esempio.
// La chiave è quella pubblica (anon / publishable): può stare nel sito, il database accetta
// dal browser solo le funzioni previste dallo schema.
window.RANCH_CONFIG = {
  SUPABASE_URL: 'https://uoekkwbpqffkqvoyizna.supabase.co',
  SUPABASE_KEY: 'sb_publishable_Zi2jn5C0hj5xMOCp-norPg_PQTswVsi',
  // Solo in modalità demo: socio con cui vedere l'app se il link non ha ?k=
  DEMO_K: 'demo-ermete'
};
