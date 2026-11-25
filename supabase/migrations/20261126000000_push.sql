-- Notifiche push dell'app (Web Push): stesse notifiche del bot Telegram, direttamente sul telefono.
--  * ogni dispositivo che attiva le notifiche registra una "iscrizione"
--  * le notifiche finiscono in push_coda; ogni minuto pg_cron chiama la Edge Function "push" che le invia
--  * la chiave privata VAPID sta in app_segreti (leggibile solo dal service role)

create table if not exists public.app_segreti (chiave text primary key, valore text not null);
alter table public.app_segreti enable row level security;
revoke all on public.app_segreti from anon, authenticated;

create table if not exists public.push_iscrizioni (
  id        bigint generated always as identity primary key,
  socio_id  uuid not null references public.soci(id) on delete cascade,
  endpoint  text not null unique,
  p256dh    text not null,
  auth      text not null,
  creata_il timestamptz not null default now()
);
create table if not exists public.push_coda (
  id               bigint generated always as identity primary key,
  socio_id         uuid not null references public.soci(id),
  titolo           text not null default 'Ranch',
  testo            text not null,
  url              text not null default './',
  creata_il        timestamptz not null default now(),
  inviata_il       timestamptz,
  tentativi        int not null default 0,
  errore           text,
  comunicazione_id bigint references public.comunicazioni(id)
);
create index if not exists push_da_inviare on public.push_coda (id) where inviata_il is null;
alter table public.push_iscrizioni enable row level security;
alter table public.push_coda enable row level security;
revoke all on public.push_iscrizioni, public.push_coda from anon, authenticated;

-- dal testo con {APP}…: tolgo il link e tengo la pagina da aprire (#/progetti/…)
create or replace function public._push_testo(p text) returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(p, '\S*\{APP\}\S*', '', 'g'), '[ \t]*(·|👉)?[ \t]*$', '', 'gn'), '(\n\s*)+$', ''))
$$;
create or replace function public._push_url(p text) returns text language sql immutable as $$
  select './' || coalesce(substring(p from '\{APP\}(#\S*)'), '')
$$;

create or replace function public._push(p_socio uuid, p_testo text, p_com bigint default null) returns void
language sql security definer set search_path = public as $$
  insert into public.push_coda (socio_id, testo, url, comunicazione_id)
  select p_socio, public._push_testo(p_testo), public._push_url(p_testo), p_com
   where exists (select 1 from public.push_iscrizioni i join public.soci s on s.id = i.socio_id where i.socio_id = p_socio and s.attivo)
$$;

-- ogni notifica va su Telegram (se collegato) e in push (se attivate)
create or replace function public._notifica(p_socio uuid, p_testo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifiche (socio_id, chat_id, testo)
  select s.id, s.telegram_chat_id, replace(p_testo, '{APP}', public._link_socio(s.codice)) from public.soci s
   where s.id = p_socio and s.attivo and s.telegram_chat_id is not null;
  perform public._push(p_socio, p_testo);
end $$;

create or replace function public._notifica_tutti(p_testo text, p_escludi uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  for s in select id from public.soci where attivo and id is distinct from p_escludi loop
    perform public._notifica(s.id, p_testo);
  end loop;
end $$;

create or replace function public._notifica_admin(p_testo text) returns void
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  for s in select id from public.soci where attivo and admin loop
    perform public._notifica(s.id, p_testo);
  end loop;
end $$;

-- ============================================================ iscrizione dal dispositivo

create or replace function public.push_iscrivi(p_k text, p_endpoint text, p_p256dh text, p_auth text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci;
begin
  s := public._socio_da_codice(p_k);
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Iscrizione non valida.' using errcode = 'P0001';
  end if;
  insert into public.push_iscrizioni (socio_id, endpoint, p256dh, auth) values (s.id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set socio_id = excluded.socio_id, p256dh = excluded.p256dh, auth = excluded.auth;
  insert into public.push_coda (socio_id, testo) values (s.id, '🔔 Notifiche attivate! Da ora ti avviso qui per rate, progetti ed eventi.');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.push_disiscrivi(p_k text, p_endpoint text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci;
begin
  s := public._socio_da_codice(p_k);
  delete from public.push_iscrizioni where endpoint = p_endpoint and socio_id = s.id;
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================ usate dalla Edge Function

create or replace function public.push_coda_prendi(p_limite int default 30) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'titolo', c.titolo, 'testo', c.testo, 'url', c.url,
           'iscrizioni', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'endpoint', i.endpoint, 'p256dh', i.p256dh, 'auth', i.auth))
                                   from public.push_iscrizioni i where i.socio_id = c.socio_id), '[]'::jsonb)) order by c.id), '[]'::jsonb)
  from (select * from public.push_coda where inviata_il is null and tentativi < 5 order by id limit p_limite) c
$$;
create or replace function public.push_esito(p_id bigint, p_ok boolean, p_errore text default null) returns void
language sql security definer set search_path = public as $$
  update public.push_coda set inviata_il = case when p_ok then now() end, tentativi = tentativi + 1, errore = p_errore where id = p_id
$$;
create or replace function public.push_rimuovi(p_id bigint) returns void
language sql security definer set search_path = public as $$ delete from public.push_iscrizioni where id = p_id $$;
create or replace function public.push_chiave() returns text
language sql security definer set search_path = public as $$ select valore from public.app_segreti where chiave = 'vapid_privata' $$;

-- ============================================================ messaggi dell'admin anche in push

create or replace function public.admin_messaggi(p_k text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._admin_da_codice(p_k);
  return jsonb_build_object(
    'soci', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, ''),
                        'telegram', s.telegram_chat_id is not null,
                        'push', exists (select 1 from public.push_iscrizioni i where i.socio_id = s.id),
                        'collegato', s.telegram_chat_id is not null or exists (select 1 from public.push_iscrizioni i where i.socio_id = s.id))
                        order by (s.telegram_chat_id is null and not exists (select 1 from public.push_iscrizioni i where i.socio_id = s.id)), lower(s.nome))
                      from public.soci s where s.attivo), '[]'::jsonb),
    'storico', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'tipo', c.tipo, 'testo', c.testo, 'data', c.creata_il,
                          'destinatari', (select count(*) from public.notifiche n where n.comunicazione_id = c.id) + (select count(*) from public.push_coda n where n.comunicazione_id = c.id),
                          'consegnati', (select count(*) from public.notifiche n where n.comunicazione_id = c.id and n.inviata_il is not null) + (select count(*) from public.push_coda n where n.comunicazione_id = c.id and n.inviata_il is not null),
                          'falliti', (select count(*) from public.notifiche n where n.comunicazione_id = c.id and n.inviata_il is null and n.tentativi >= 5) + (select count(*) from public.push_coda n where n.comunicazione_id = c.id and n.inviata_il is null and n.tentativi >= 5))
                          order by c.creata_il desc)
                        from (select * from public.comunicazioni order by creata_il desc limit 30) c), '[]'::jsonb));
end $$;

create or replace function public.admin_messaggio_invia(p_k text, p_tipo text, p_testo text, p_soci uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.comunicazioni; n int; m int; v text := trim(coalesce(p_testo, '')); pre text;
begin
  perform public._admin_da_codice(p_k);
  if v = '' then raise exception 'Scrivi il messaggio.' using errcode = 'P0001'; end if;
  if length(v) > 2000 then raise exception 'Il messaggio può avere al massimo 2000 caratteri.' using errcode = 'P0001'; end if;
  if p_tipo not in ('comunicazione', 'promozione', 'urgente') then raise exception 'Tipo non valido.' using errcode = 'P0001'; end if;
  if p_soci is null or array_length(p_soci, 1) is null then raise exception 'Scegli almeno un socio.' using errcode = 'P0001'; end if;
  insert into public.comunicazioni (tipo, testo) values (p_tipo, v) returning * into c;
  pre := case p_tipo when 'promozione' then '🏷️ ' when 'urgente' then '🚨 ' else '📣 ' end;
  insert into public.notifiche (socio_id, chat_id, testo, comunicazione_id)
  select s.id, s.telegram_chat_id, pre || v, c.id from public.soci s
   where s.id = any(p_soci) and s.attivo and s.telegram_chat_id is not null;
  get diagnostics n = row_count;
  insert into public.push_coda (socio_id, testo, comunicazione_id)
  select s.id, pre || v, c.id from public.soci s
   where s.id = any(p_soci) and s.attivo and exists (select 1 from public.push_iscrizioni i where i.socio_id = s.id);
  get diagnostics m = row_count;
  if n + m = 0 then raise exception 'Nessuno dei soci scelti ha attivato le notifiche (Telegram o app).' using errcode = 'P0001'; end if;
  return jsonb_build_object('ok', true, 'destinatari', n + m);
end $$;

-- ============================================================ permessi e programmazione

revoke all on function public._push_testo(text), public._push_url(text), public._push(uuid, text, bigint),
  public.push_coda_prendi(int), public.push_esito(bigint, boolean, text), public.push_rimuovi(bigint), public.push_chiave()
  from public, anon, authenticated;
grant execute on function public.push_coda_prendi(int), public.push_esito(bigint, boolean, text), public.push_rimuovi(bigint), public.push_chiave() to service_role;
revoke all on function public.push_iscrivi(text, text, text, text), public.push_disiscrivi(text, text) from public;
grant execute on function public.push_iscrivi(text, text, text, text), public.push_disiscrivi(text, text) to anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'push-coda';
select cron.schedule('push-coda', '* * * * *', $$
  select net.http_post(
    url := 'https://uoekkwbpqffkqvoyizna.supabase.co/functions/v1/push',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_Zi2jn5C0hj5xMOCp-norPg_PQTswVsi"}'::jsonb,
    body := '{"azione": "coda"}'::jsonb)
  where exists (select 1 from public.push_coda where inviata_il is null and tentativi < 5)
$$);

-- le chiavi VAPID le genera la Edge Function al primo avvio; qui solo la lettura della pubblica e il salvataggio
create or replace function public.push_chiave_pubblica() returns text
language sql stable security definer set search_path = public as $$ select valore from public.app_segreti where chiave = 'vapid_pubblica' $$;
create or replace function public.push_salva_chiavi(p_pubblica text, p_privata text) returns void
language sql security definer set search_path = public as $$
  insert into public.app_segreti values ('vapid_pubblica', p_pubblica), ('vapid_privata', p_privata)
  on conflict (chiave) do nothing
$$;
revoke all on function public.push_chiave_pubblica(), public.push_salva_chiavi(text, text) from public, anon, authenticated;
grant execute on function public.push_chiave_pubblica() to anon, authenticated, service_role;
grant execute on function public.push_salva_chiavi(text, text) to service_role;
