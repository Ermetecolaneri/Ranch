// Carica la foto profilo di un socio. Il socio è riconosciuto dal codice del link personale.
// Riceve JSON { k, foto } con foto = "data:image/jpeg;base64,..." già ritagliata 256x256 nel browser.
// Da pubblicare con verify_jwt = false: l'autorizzazione è il codice personale.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_BYTES = 1024 * 1024;

function risposta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return risposta({ error: "Metodo non consentito." }, 405);

  let k = "", foto = "";
  try {
    const body = await req.json();
    k = String(body.k ?? "");
    foto = String(body.foto ?? "");
  } catch {
    return risposta({ error: "Richiesta non valida." }, 400);
  }

  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(foto);
  if (!k || !m) return risposta({ error: "Formato immagine non valido." }, 400);
  const bytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
  if (bytes.length > MAX_BYTES) return risposta({ error: "Immagine troppo grande." }, 400);
  // un JPEG inizia sempre con FF D8
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return risposta({ error: "Formato immagine non valido." }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: socio, error: e1 } = await db
    .from("soci").select("id, foto_path").eq("codice", k).eq("attivo", true).maybeSingle();
  if (e1) return risposta({ error: "Errore del server. Riprova tra poco." }, 500);
  if (!socio) return risposta({ error: "Link personale non valido." }, 403);

  const path = `${socio.id}/${Date.now()}.jpg`;
  const up = await db.storage.from("avatar").upload(path, bytes, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
  });
  if (up.error) return risposta({ error: "Caricamento non riuscito. Riprova." }, 500);

  const { error: e2 } = await db.from("soci").update({ foto_path: path }).eq("id", socio.id);
  if (e2) {
    await db.storage.from("avatar").remove([path]);
    return risposta({ error: "Errore del server. Riprova tra poco." }, 500);
  }
  if (socio.foto_path) await db.storage.from("avatar").remove([socio.foto_path]);

  return risposta({ foto: path });
});
