// Notifiche push dell'app Ranch (Web Push con chiavi VAPID).
//  * POST {azione:"setup"}: crea le chiavi VAPID la prima volta (la privata resta nel database)
//  * POST {azione:"coda"} (pg_cron ogni minuto): invia le notifiche in coda a tutti i dispositivi del socio
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json" } });
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const daB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function chiavi(): Promise<{ pub: string; priv: string }> {
  let { data: pub } = await db.rpc("push_chiave_pubblica");
  if (!pub) {
    const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", k.privateKey);
    const pubBytes = new Uint8Array([4, ...daB64u(jwk.x!), ...daB64u(jwk.y!)]);
    await db.rpc("push_salva_chiavi", { p_pubblica: b64u(pubBytes), p_privata: jwk.d });
    ({ data: pub } = await db.rpc("push_chiave_pubblica"));
  }
  const { data: priv } = await db.rpc("push_chiave");
  return { pub, priv };
}

async function inviaCoda() {
  const k = await chiavi();
  webpush.setVapidDetails("https://ermetecolaneri.github.io/Ranch/", k.pub, k.priv);
  const { data: coda } = await db.rpc("push_coda_prendi", { p_limite: 30 });
  let ok = 0;
  for (const n of (coda ?? []) as { id: number; titolo: string; testo: string; url: string; iscrizioni: { id: number; endpoint: string; p256dh: string; auth: string }[] }[]) {
    let consegnata = false, errore = "";
    for (const i of n.iscrizioni) {
      try {
        await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          JSON.stringify({ titolo: n.titolo, testo: n.testo, url: n.url, tag: "ranch-" + n.id }), { TTL: 86400 });
        consegnata = true;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.rpc("push_rimuovi", { p_id: i.id });   // dispositivo non più valido
        errore = String((e as Error).message ?? e).slice(0, 300);
      }
    }
    if (!n.iscrizioni.length) errore = "nessun dispositivo";
    await db.rpc("push_esito", { p_id: n.id, p_ok: consegnata || !n.iscrizioni.length, p_errore: consegnata ? null : errore });
    if (consegnata) ok++;
  }
  return { inviate: ok, totale: (coda ?? []).length };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true });
  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* vuoto */ }
  try {
    if (corpo.azione === "setup") { const k = await chiavi(); return json({ ok: true, pubblica: k.pub }); }
    if (corpo.azione === "coda") return json(await inviaCoda());
    return json({ ok: false }, 400);
  } catch (e) {
    return json({ errore: String((e as Error).message ?? e) }, 500);
  }
});
