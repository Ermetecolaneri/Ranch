-- Notifiche Telegram: i soci collegano il bot dal profilo e ricevono avvisi su rate, progetti ed eventi.
-- Le notifiche finiscono in una coda; ogni minuto pg_cron chiama la Edge Function "telegram" che le invia.

create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.soci
  add column if not exists telegram_chat_id bigint unique,
  add column if not exists telegram_token text unique,
  add column if not exists telegram_token_scade timestamptz;

create table if not exists public.telegram_config (chiave text primary key, valore text not null);
create table if not exists public.notifiche (
  id          bigint generated always as identity primary key,
  socio_id    uuid not null references public.soci(id),
  chat_id     bigint not null,
  testo       text not null,
  creata_il   timestamptz not null default now(),
  inviata_il  timestamptz,
  tentativi   int not null default 0,
  errore      text
);
create index if not exists notifiche_da_inviare on public.notifiche (id) where inviata_il is null;
alter table public.telegram_config enable row level security;
alter table public.notifiche enable row level security;
revoke all on public.telegram_config, public.notifiche from anon, authenticated;

-- ============================================================ helper

create or replace function public._euro(n numeric) returns text
language sql immutable as $$
  select translate(case when n = trunc(n) then to_char(n, 'FM999G999G990') else to_char(n, 'FM999G999G990D00') end, ',.', '.,') || ' €'
$$;

create or replace function public._app_url() returns text language sql immutable as $$ select 'https://ermetecolaneri.github.io/Ranch/' $$;

create or replace function public._notifica(p_socio uuid, p_testo text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifiche (socio_id, chat_id, testo)
  select s.id, s.telegram_chat_id, p_testo from public.soci s
   where s.id = p_socio and s.attivo and s.telegram_chat_id is not null
$$;

create or replace function public._notifica_tutti(p_testo text, p_escludi uuid default null) returns void
language sql security definer set search_path = public as $$
  insert into public.notifiche (socio_id, chat_id, testo)
  select s.id, s.telegram_chat_id, p_testo from public.soci s
   where s.attivo and s.telegram_chat_id is not null and s.id is distinct from p_escludi
$$;

create or replace function public._notifica_admin(p_testo text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifiche (socio_id, chat_id, testo)
  select s.id, s.telegram_chat_id, p_testo from public.soci s
   where s.attivo and s.admin and s.telegram_chat_id is not null
$$;

-- ============================================================ eventi che generano avvisi

-- rata aperta (diventa visibile) → a chi la deve pagare
create or replace function public._tg_rata_visibile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.visibile and not old.visibile then
    perform public._notifica(rs.socio_id,
      '📢 Nuova rata aperta: ' || new.titolo || E'\n' || public._euro(new.importo) || ', scade il ' || to_char(new.scadenza, 'DD/MM/YYYY') ||
      E'\n\nQuando l''hai pagata segnala qui 👉 ' || public._app_url())
    from public.rate_soci rs where rs.rata_id = new.id and rs.pagata_il is null;
  end if;
  return new;
end $$;
drop trigger if exists tg_rata_visibile on public.rate;
create trigger tg_rata_visibile after update of visibile on public.rate for each row execute function public._tg_rata_visibile();

-- socio aggiunto a una rata già aperta
create or replace function public._tg_rata_assegnata() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.rate;
begin
  select * into r from public.rate where id = new.rata_id;
  if r.visibile and new.pagata_il is null then
    perform public._notifica(new.socio_id,
      '📢 Nuova rata: ' || r.titolo || E'\n' || public._euro(r.importo) || ', scade il ' || to_char(r.scadenza, 'DD/MM/YYYY') ||
      E'\n\nQuando l''hai pagata segnala qui 👉 ' || public._app_url());
  end if;
  return new;
end $$;
drop trigger if exists tg_rata_assegnata on public.rate_soci;
create trigger tg_rata_assegnata after insert on public.rate_soci for each row execute function public._tg_rata_assegnata();

-- un socio segna pagata la sua rata → avviso all'admin
create or replace function public._tg_rata_pagata() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.rate; nome text; da_socio boolean;
begin
  if new.pagata_il is not null and old.pagata_il is null then
    select * into r from public.rate where id = new.rata_id;
    select s.nome into nome from public.soci s where s.id = new.socio_id;
    select m.fatto_da = 'socio' into da_socio from public.movimenti m where m.id = new.movimento_id;
    if coalesce(da_socio, false) then
      perform public._notifica_admin('💶 ' || nome || ' ha segnato pagata «' || r.titolo || '» (' || public._euro(r.importo) || ')');
    end if;
    perform public._notifica(new.socio_id, '✅ Rata «' || r.titolo || '» registrata: +' || public._euro(r.importo) || ' di credito da usare sui progetti.');
  end if;
  return new;
end $$;
drop trigger if exists tg_rata_pagata on public.rate_soci;
create trigger tg_rata_pagata after update of pagata_il on public.rate_soci for each row execute function public._tg_rata_pagata();

-- progetto finanziato al 100%
create or replace function public._tg_acquisto() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.progetti; vendute int;
begin
  if new.tipo = 'acquisto' and new.progetto_id is not null then
    select * into p from public.progetti where id = new.progetto_id;
    select coalesce(sum(quote), 0) into vendute from public.movimenti where progetto_id = p.id;
    if vendute >= p.quote_totali and vendute - new.quote < p.quote_totali then
      perform public._notifica_tutti('🎉 «' || p.titolo || '» è finanziato al 100%! (' || public._euro(p.quote_totali * p.costo_quota) || ')');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tg_acquisto on public.movimenti;
create trigger tg_acquisto after insert on public.movimenti for each row execute function public._tg_acquisto();

-- nuovo progetto proposto
create or replace function public._tg_progetto_nuovo() returns trigger
language plpgsql security definer set search_path = public as $$
declare nome text;
begin
  select s.nome into nome from public.soci s where s.id = new.creato_da;
  perform public._notifica_tutti('💡 Nuovo progetto: «' || new.titolo || '» proposto da ' || coalesce(nome, '?') || E'\n' ||
    new.quote_totali || ' quote da ' || public._euro(new.costo_quota) || ' · ' || public._app_url() || '#/progetti/' || new.id, new.creato_da);
  return new;
end $$;
drop trigger if exists tg_progetto_nuovo on public.progetti;
create trigger tg_progetto_nuovo after insert on public.progetti for each row execute function public._tg_progetto_nuovo();

-- progetto in esecuzione / chiuso
create or replace function public._tg_progetto_stato() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stato = 'sviluppo' and old.stato = 'raccolta' then
    perform public._notifica_tutti('🛠️ «' || new.titolo || '» passa in esecuzione.');
  elsif new.stato = 'chiuso' and old.stato <> 'chiuso' then
    perform public._notifica_tutti('🏁 «' || new.titolo || '» è completato! Grazie a tutti i sostenitori.');
  end if;
  return new;
end $$;
drop trigger if exists tg_progetto_stato on public.progetti;
create trigger tg_progetto_stato after update of stato on public.progetti for each row execute function public._tg_progetto_stato();

-- eventi: nuovo da votare, data fissata
create or replace function public._tg_evento() returns trigger
language plpgsql security definer set search_path = public as $$
declare quando text;
begin
  if new.stato = 'programmato' and (tg_op = 'INSERT' or old.stato is distinct from 'programmato') then
    quando := to_char(new.data_inizio, 'DD/MM/YYYY') || case when new.data_fine > new.data_inizio then ' – ' || to_char(new.data_fine, 'DD/MM/YYYY') else '' end;
    perform public._notifica_tutti('📅 ' || new.titolo || ': ' || quando || E'\n' || public._app_url() || '#/eventi/' || new.id);
  elsif tg_op = 'INSERT' and new.stato = 'da_programmare' then
    perform public._notifica_tutti('🗳️ Nuovo evento: ' || new.titolo || E'\nScegli le date che ti vanno bene 👉 ' || public._app_url() || '#/eventi/' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists tg_evento on public.eventi;
create trigger tg_evento after insert or update of stato on public.eventi for each row execute function public._tg_evento();

-- promemoria giornaliero: rate aperte non pagate che scadono tra 3 giorni o oggi
create or replace function public.telegram_promemoria() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  for r in
    select rs.socio_id, ra.titolo, ra.importo, ra.scadenza
      from public.rate_soci rs join public.rate ra on ra.id = rs.rata_id
     where ra.visibile and rs.pagata_il is null and ra.scadenza in (oggi, oggi + 3)
  loop
    perform public._notifica(r.socio_id,
      '⏰ Promemoria: «' || r.titolo || '» (' || public._euro(r.importo) || ') scade ' ||
      case when r.scadenza = oggi then 'oggi' else 'il ' || to_char(r.scadenza, 'DD/MM') end ||
      E'.\nQuando l''hai pagata segnala qui 👉 ' || public._app_url());
    n := n + 1;
  end loop;
  return n;
end $$;

-- ============================================================ collegamento dal profilo

create or replace function public.telegram_stato(p_k text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.soci;
begin
  s := public._socio_da_codice(p_k);
  return jsonb_build_object('collegato', s.telegram_chat_id is not null,
                            'bot', (select valore from public.telegram_config where chiave = 'bot'));
end $$;

create or replace function public.telegram_collega(p_k text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; tok text := replace(gen_random_uuid()::text, '-', ''); bot text;
begin
  s := public._socio_da_codice(p_k);
  select valore into bot from public.telegram_config where chiave = 'bot';
  if bot is null then raise exception 'Il bot Telegram non è ancora configurato.' using errcode = 'P0001'; end if;
  update public.soci set telegram_token = tok, telegram_token_scade = now() + interval '30 minutes' where id = s.id;
  return jsonb_build_object('bot', bot, 'url', 'https://t.me/' || bot || '?start=' || tok);
end $$;

create or replace function public.telegram_scollega(p_k text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci;
begin
  s := public._socio_da_codice(p_k);
  update public.soci set telegram_chat_id = null, telegram_token = null where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================ usate solo dalla Edge Function (service role)

create or replace function public.tg_avvia(p_token text, p_chat bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci;
begin
  select * into s from public.soci where telegram_token = p_token and telegram_token_scade > now() and attivo for update;
  if not found then return jsonb_build_object('ok', false); end if;
  update public.soci set telegram_chat_id = null where telegram_chat_id = p_chat and id <> s.id;
  update public.soci set telegram_chat_id = p_chat, telegram_token = null, telegram_token_scade = null where id = s.id;
  return jsonb_build_object('ok', true, 'nome', s.nome);
end $$;

create or replace function public.tg_info(p_chat bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.soci;
begin
  select * into s from public.soci where telegram_chat_id = p_chat and attivo;
  if not found then return null; end if;
  return jsonb_build_object('nome', s.nome,
    'credito', coalesce((select sum(importo) from public.movimenti where socio_id = s.id), 0),
    'rate', coalesce((select jsonb_agg(jsonb_build_object('titolo', r.titolo, 'importo', r.importo, 'scadenza', r.scadenza) order by r.scadenza)
                      from public.rate_soci rs join public.rate r on r.id = rs.rata_id
                      where rs.socio_id = s.id and rs.pagata_il is null and r.visibile), '[]'::jsonb));
end $$;

create or replace function public.tg_scollega_chat(p_chat bigint) returns void
language sql security definer set search_path = public as $$
  update public.soci set telegram_chat_id = null where telegram_chat_id = p_chat
$$;

create or replace function public.tg_coda(p_limite int default 30) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'chat', chat_id, 'testo', testo) order by id), '[]'::jsonb)
  from (select id, chat_id, testo from public.notifiche where inviata_il is null and tentativi < 5 order by id limit p_limite) t
$$;

create or replace function public.tg_esito(p_id bigint, p_ok boolean, p_errore text default null) returns void
language sql security definer set search_path = public as $$
  update public.notifiche set inviata_il = case when p_ok then now() end, tentativi = tentativi + 1, errore = p_errore where id = p_id
$$;

create or replace function public.tg_config(p_chiave text, p_valore text) returns void
language sql security definer set search_path = public as $$
  insert into public.telegram_config values (p_chiave, p_valore) on conflict (chiave) do update set valore = excluded.valore
$$;

-- ============================================================ permessi

revoke all on function public._euro(numeric), public._app_url(), public._notifica(uuid, text), public._notifica_tutti(text, uuid),
  public._notifica_admin(text), public._tg_rata_visibile(), public._tg_rata_assegnata(), public._tg_rata_pagata(), public._tg_acquisto(),
  public._tg_progetto_nuovo(), public._tg_progetto_stato(), public._tg_evento(), public.telegram_promemoria(),
  public.tg_avvia(text, bigint), public.tg_info(bigint), public.tg_scollega_chat(bigint), public.tg_coda(int),
  public.tg_esito(bigint, boolean, text), public.tg_config(text, text) from public, anon, authenticated;
grant execute on function public.tg_avvia(text, bigint), public.tg_info(bigint), public.tg_scollega_chat(bigint), public.tg_coda(int),
  public.tg_esito(bigint, boolean, text), public.tg_config(text, text) to service_role;
revoke all on function public.telegram_stato(text), public.telegram_collega(text), public.telegram_scollega(text) from public;
grant execute on function public.telegram_stato(text), public.telegram_collega(text), public.telegram_scollega(text) to anon, authenticated;

-- ============================================================ programmazione

select cron.unschedule(jobid) from cron.job where jobname in ('telegram-coda', 'telegram-promemoria');
select cron.schedule('telegram-coda', '* * * * *', $$
  select net.http_post(
    url := 'https://uoekkwbpqffkqvoyizna.supabase.co/functions/v1/telegram',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_Zi2jn5C0hj5xMOCp-norPg_PQTswVsi"}'::jsonb,
    body := '{"azione": "coda"}'::jsonb)
  where exists (select 1 from public.notifiche where inviata_il is null and tentativi < 5)
$$);
select cron.schedule('telegram-promemoria', '5 8 * * *', $$ select public.telegram_promemoria() $$);
