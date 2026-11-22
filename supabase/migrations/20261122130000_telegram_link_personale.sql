-- Nei messaggi del bot il link all'app è quello personale del socio (con il suo codice),
-- così aprendolo è già riconosciuto e può segnare pagamenti, comprare quote, votare.
-- I testi usano il segnaposto {APP}; ogni notifica lo sostituisce con il link di chi la riceve.

create or replace function public._app_url() returns text language sql immutable as $$ select '{APP}' $$;
create or replace function public._link_socio(p_codice text) returns text language sql immutable as $$
  select 'https://ermetecolaneri.github.io/Ranch/?k=' || p_codice
$$;

create or replace function public._notifica(p_socio uuid, p_testo text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifiche (socio_id, chat_id, testo)
  select s.id, s.telegram_chat_id, replace(p_testo, '{APP}', public._link_socio(s.codice)) from public.soci s
   where s.id = p_socio and s.attivo and s.telegram_chat_id is not null
$$;

create or replace function public._notifica_tutti(p_testo text, p_escludi uuid default null) returns void
language sql security definer set search_path = public as $$
  insert into public.notifiche (socio_id, chat_id, testo)
  select s.id, s.telegram_chat_id, replace(p_testo, '{APP}', public._link_socio(s.codice)) from public.soci s
   where s.attivo and s.telegram_chat_id is not null and s.id is distinct from p_escludi
$$;

create or replace function public._notifica_admin(p_testo text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifiche (socio_id, chat_id, testo)
  select s.id, s.telegram_chat_id, replace(p_testo, '{APP}', public._link_socio(s.codice)) from public.soci s
   where s.attivo and s.admin and s.telegram_chat_id is not null
$$;

create or replace function public.tg_info(p_chat bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.soci;
begin
  select * into s from public.soci where telegram_chat_id = p_chat and attivo;
  if not found then return null; end if;
  return jsonb_build_object('nome', s.nome, 'link', public._link_socio(s.codice),
    'credito', coalesce((select ranch from public._crediti_ranch() c where c.socio_id = s.id), 0),
    'rate', coalesce((select jsonb_agg(jsonb_build_object('titolo', r.titolo, 'importo', r.importo, 'scadenza', r.scadenza) order by r.scadenza)
                      from public.rate_soci rs join public.rate r on r.id = rs.rata_id
                      where rs.socio_id = s.id and rs.pagata_il is null and r.visibile), '[]'::jsonb));
end $$;

-- avvio riuscito: restituisce anche il link personale
create or replace function public.tg_avvia(p_token text, p_chat bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci;
begin
  select * into s from public.soci where telegram_token = p_token and telegram_token_scade > now() and attivo for update;
  if not found then return jsonb_build_object('ok', false); end if;
  update public.soci set telegram_chat_id = null where telegram_chat_id = p_chat and id <> s.id;
  update public.soci set telegram_chat_id = p_chat, telegram_token = null, telegram_token_scade = null where id = s.id;
  return jsonb_build_object('ok', true, 'nome', s.nome, 'link', public._link_socio(s.codice));
end $$;

revoke all on function public._link_socio(text) from public, anon, authenticated;
