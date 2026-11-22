// Bot Telegram del ranch.
//  * POST da Telegram (webhook, con header segreto): /start <token> collega il socio, /credito, /rate, /stop
//  * POST {azione:"coda"}  (da pg_cron ogni minuto): invia le notifiche in coda
//  * POST {azione:"setup"}: legge il nome del bot e registra il webhook
import { createClient } from "npm:@supabase/supabase-js@2";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const API = `https://api.telegram.org/bot${TOKEN}`;
const APP = "https://ermetecolaneri.github.io/Ranch/";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function segreto(): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ranch:" + TOKEN));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}
async function tg(metodo: string, corpo: unknown) {
  const r = await fetch(`${API}/${metodo}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  return await r.json();
}
const scrivi = (chat: number, text: string) => tg("sendMessage", { chat_id: chat, text, disable_web_page_preview: true });
function euro(n: number) {
  return new Intl.NumberFormat("it-IT", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2, useGrouping: "always" } as Intl.NumberFormatOptions).format(n) + " €";
}
function data(iso: string) { const [a, m, g] = iso.slice(0, 10).split("-"); return `${g}/${m}/${a}`; }
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json" } });

async function messaggio(msg: { chat: { id: number }; text?: string }) {
  const chat = msg.chat.id, testo = (msg.text ?? "").trim();
  if (testo.startsWith("/start")) {
    const tok = testo.split(/\s+/)[1] ?? "";
    if (!tok) {
      const { data: info } = await db.rpc("tg_info", { p_chat: chat });
      return scrivi(chat, info ? `Ciao ${info.nome}! Sei già collegato. Comandi: /credito, /rate, /stop`
        : `Ciao! Per ricevere gli avvisi del ranch apri il tuo profilo nell'app e premi "Collega Telegram".\n${APP}`);
    }
    const { data: r } = await db.rpc("tg_avvia", { p_token: tok, p_chat: chat });
    if (!r?.ok) return scrivi(chat, `Link scaduto o non valido. Riprova da "Collega Telegram" nel tuo profilo:\n${APP}`);
    return scrivi(chat, `Ciao ${r.nome}! 🏍️ Da ora ti scrivo qui per rate, progetti ed eventi del ranch.\n\nComandi: /credito, /rate, /stop`);
  }
  const { data: info } = await db.rpc("tg_info", { p_chat: chat });
  if (!info) return scrivi(chat, `Non ti conosco ancora: apri il tuo profilo nell'app e premi "Collega Telegram".\n${APP}`);
  if (testo.startsWith("/credito")) return scrivi(chat, `💰 Il tuo credito: ${euro(Number(info.credito))}`);
  if (testo.startsWith("/rate")) {
    const rate = info.rate as { titolo: string; importo: number; scadenza: string }[];
    if (!rate.length) return scrivi(chat, "✅ Nessuna rata da pagare.");
    const tot = rate.reduce((t, r) => t + Number(r.importo), 0);
    return scrivi(chat, "📋 Rate da pagare:\n" + rate.map((r) => `• ${r.titolo}: ${euro(Number(r.importo))} (entro il ${data(r.scadenza)})`).join("\n") +
      `\n\nTotale: ${euro(tot)}\nSegna il pagamento nell'app: ${APP}`);
  }
  if (testo.startsWith("/stop")) {
    await db.rpc("tg_scollega_chat", { p_chat: chat });
    return scrivi(chat, "Ok, non ti scrivo più. Per ricollegarti usa \"Collega Telegram\" nel tuo profilo.");
  }
  return scrivi(chat, `Comandi: /credito, /rate, /stop\nApp: ${APP}`);
}

async function inviaCoda() {
  const { data: coda } = await db.rpc("tg_coda", { p_limite: 30 });
  let ok = 0;
  for (const n of (coda ?? []) as { id: number; chat: number; testo: string }[]) {
    try {
      const r = await scrivi(n.chat, n.testo);
      await db.rpc("tg_esito", { p_id: n.id, p_ok: !!r.ok, p_errore: r.ok ? null : String(r.description ?? "errore") });
      if (r.ok) ok++;
      // chat bloccata dal socio: lo scollego
      if (!r.ok && r.error_code === 403) await db.rpc("tg_scollega_chat", { p_chat: n.chat });
    } catch (e) {
      await db.rpc("tg_esito", { p_id: n.id, p_ok: false, p_errore: String(e) });
    }
  }
  return { inviate: ok, totale: (coda ?? []).length };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true });
  if (!TOKEN) return json({ errore: "TELEGRAM_BOT_TOKEN mancante" }, 500);
  const header = req.headers.get("x-telegram-bot-api-secret-token");
  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* corpo vuoto */ }

  if (header) {
    if (header !== await segreto()) return json({ ok: false }, 403);
    const msg = (corpo.message ?? corpo.edited_message) as { chat: { id: number }; text?: string } | undefined;
    if (msg?.chat?.id) await messaggio(msg);
    return json({ ok: true });
  }
  if (corpo.azione === "coda") return json(await inviaCoda());
  if (corpo.azione === "setup") {
    const me = await tg("getMe", {});
    if (!me.ok) return json({ errore: me.description }, 400);
    await db.rpc("tg_config", { p_chiave: "bot", p_valore: me.result.username });
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram`;
    const wh = await tg("setWebhook", { url, secret_token: await segreto(), allowed_updates: ["message"] });
    await tg("setMyCommands", { commands: [
      { command: "credito", description: "Il tuo credito" },
      { command: "rate", description: "Le rate da pagare" },
      { command: "stop", description: "Non ricevere più avvisi" },
    ] });
    return json({ bot: me.result.username, webhook: wh.ok, descrizione: wh.description });
  }
  return json({ ok: false }, 400);
});
