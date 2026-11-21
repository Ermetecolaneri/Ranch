// Carica una foto già ritagliata nel browser (JPEG). Il socio è riconosciuto dal codice del link personale.
//  - { k, foto }            -> foto profilo del socio (bucket "avatar")
//  - { k, foto, progetto }  -> foto del progetto (bucket "progetti"); solo chi l'ha proposto o l'admin
//  - { k, foto, evento }    -> foto dell'evento (bucket "eventi"); solo l'admin
// Pubblicata con verify_jwt = false: l'autorizzazione è il codice personale.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function risposta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return risposta({ error: "Metodo non consentito." }, 405);

  let k = "", foto = "", progetto = "", evento = "";
  try {
    const body = await req.json();
    k = String(body.k ?? "");
    foto = String(body.foto ?? "");
    progetto = String(body.progetto ?? "");
    evento = String(body.evento ?? "");
  } catch {
    return risposta({ error: "Richiesta non valida." }, 400);
  }

  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(foto);
  if (!k || !m) return risposta({ error: "Formato immagine non valido." }, 400);
  const bytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
  const max = progetto || evento ? 2 * 1024 * 1024 : 1024 * 1024;
  if (bytes.length > max) return risposta({ error: "Immagine troppo grande." }, 400);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return risposta({ error: "Formato immagine non valido." }, 400);
  if (progetto && !/^[0-9a-f-]{36}$/i.test(progetto)) return risposta({ error: "Progetto non trovato." }, 404);
  if (evento && !/^[0-9a-f-]{36}$/i.test(evento)) return risposta({ error: "Evento non trovato." }, 404);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: socio, error: e1 } = await db
    .from("soci").select("id, foto_path, admin").eq("codice", k).eq("attivo", true).maybeSingle();
  if (e1) return risposta({ error: "Errore del server. Riprova tra poco." }, 500);
  if (!socio) return risposta({ error: "Link personale non valido." }, 403);

  // destinazione: profilo del socio o progetto
  let bucket = "avatar", tabella = "soci", idRiga = socio.id as string, vecchia = socio.foto_path as string | null;
  if (progetto) {
    const { data: p, error: e2 } = await db
      .from("progetti").select("id, foto_path, creato_da, stato").eq("id", progetto).maybeSingle();
    if (e2) return risposta({ error: "Errore del server. Riprova tra poco." }, 500);
    if (!p || p.stato === "eliminato") return risposta({ error: "Progetto non trovato." }, 404);
    if (p.creato_da !== socio.id && !socio.admin) {
      return risposta({ error: "Solo chi ha proposto il progetto può cambiarne la foto." }, 403);
    }
    bucket = "progetti"; tabella = "progetti"; idRiga = p.id; vecchia = p.foto_path;
  } else if (evento) {
    if (!socio.admin) return risposta({ error: "Solo l'admin può cambiare la foto di un evento." }, 403);
    const { data: ev, error: e4 } = await db.from("eventi").select("id, foto_path").eq("id", evento).maybeSingle();
    if (e4) return risposta({ error: "Errore del server. Riprova tra poco." }, 500);
    if (!ev) return risposta({ error: "Evento non trovato." }, 404);
    bucket = "eventi"; tabella = "eventi"; idRiga = ev.id; vecchia = ev.foto_path;
  }

  const path = `${idRiga}/${Date.now()}.jpg`;
  const up = await db.storage.from(bucket).upload(path, bytes, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (up.error) return risposta({ error: "Caricamento non riuscito. Riprova." }, 500);

  const { error: e3 } = await db.from(tabella).update({ foto_path: path }).eq("id", idRiga);
  if (e3) {
    await db.storage.from(bucket).remove([path]);
    return risposta({ error: "Errore del server. Riprova tra poco." }, 500);
  }
  if (vecchia) await db.storage.from(bucket).remove([vecchia]);

  return risposta({ foto: path, bucket });
});
