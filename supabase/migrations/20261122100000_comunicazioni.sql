-- Comunicazioni dell'admin ai soci collegati a Telegram (avvisi, promozioni, notizie).

create table if not exists public.comunicazioni (
  id        bigint generated always as identity primary key,
  tipo      text not null default 'comunicazione' check (tipo in ('comunicazione', 'promozione', 'urgente')),
  testo     text not null check (length(trim(testo)) between 1 and 2000),
  creata_il timestamptz not null default now()
);
alter table public.comunicazioni enable row level security;
revoke all on public.comunicazioni from anon, authenticated;
alter table public.notifiche add column if not exists comunicazione_id bigint references public.comunicazioni(id);

create or replace function public.admin_messaggi(p_k text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._admin_da_codice(p_k);
  return jsonb_build_object(
    'soci', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, ''),
                        'collegato', s.telegram_chat_id is not null) order by s.telegram_chat_id is null, lower(s.nome))
                      from public.soci s where s.attivo), '[]'::jsonb),
    'storico', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'tipo', c.tipo, 'testo', c.testo, 'data', c.creata_il,
                          'destinatari', (select count(*) from public.notifiche n where n.comunicazione_id = c.id),
                          'consegnati', (select count(*) from public.notifiche n where n.comunicazione_id = c.id and n.inviata_il is not null),
                          'falliti', (select count(*) from public.notifiche n where n.comunicazione_id = c.id and n.inviata_il is null and n.tentativi >= 5))
                          order by c.creata_il desc)
                        from (select * from public.comunicazioni order by creata_il desc limit 30) c), '[]'::jsonb));
end $$;

create or replace function public.admin_messaggio_invia(p_k text, p_tipo text, p_testo text, p_soci uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.comunicazioni; n int; v text := trim(coalesce(p_testo, '')); pre text;
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
  if n = 0 then raise exception 'Nessuno dei soci scelti ha collegato Telegram.' using errcode = 'P0001'; end if;
  return jsonb_build_object('ok', true, 'destinatari', n);
end $$;

revoke all on function public.admin_messaggi(text), public.admin_messaggio_invia(text, text, text, uuid[]) from public;
grant execute on function public.admin_messaggi(text), public.admin_messaggio_invia(text, text, text, uuid[]) to anon, authenticated;
