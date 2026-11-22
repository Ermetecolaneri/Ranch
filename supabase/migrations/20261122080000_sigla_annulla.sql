-- Progetti: sigla breve (max 4 caratteri) per il grafico del bilancio
-- e possibilità per il socio di annullare la propria partecipazione finché il progetto è in raccolta.

alter table public.progetti add column if not exists sigla text not null default '' check (length(sigla) <= 4);

-- sigla di partenza: iniziali delle prime 3 parole + ultimo carattere
update public.progetti p set sigla = upper(left(
  (select string_agg(left(w, 1), '' order by n) from unnest(regexp_split_to_array(trim(p.titolo), '\s+')) with ordinality as t(w, n) where n <= 3)
  || right(trim(p.titolo), 1), 4))
 where sigla = '';

create or replace function public._sigla(p text) returns text
language plpgsql immutable set search_path = public as $$
declare v text := upper(trim(coalesce(p, '')));
begin
  if length(v) > 4 then raise exception 'La sigla può avere al massimo 4 caratteri.' using errcode = 'P0001'; end if;
  return v;
end $$;

create or replace function public._progetto_json(p public.progetti) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', p.id,
    'titolo', p.titolo,
    'sigla', p.sigla,
    'descrizione', p.descrizione,
    'foto', coalesce(p.foto_path, ''),
    'quoteTotali', p.quote_totali,
    'costoQuota', p.costo_quota,
    'totale', (p.quote_totali * p.costo_quota)::numeric(10,2),
    'raccolto', coalesce(r.raccolto, 0),
    'quoteVendute', coalesce(r.quote_vendute, 0),
    'sostenitori', coalesce(r.sostenitori, 0),
    'cuori', (select count(*) from public.cuori c where c.progetto_id = p.id),
    'scadenza', p.scadenza,
    'scaduto', p.scadenza < (now() at time zone 'Europe/Rome')::date,
    'stato', p.stato,
    'creatoIl', p.creato_il,
    'creatoDa', jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, ''),
                                   'numeroGara', s.numero_gara, 'numeroFont', s.numero_font, 'numeroColore', s.numero_colore)
  )
  from (select 1) x
  left join public.raccolta_progetti r on r.progetto_id = p.id
  left join public.soci s on s.id = p.creato_da
$$;

drop function if exists public.crea_progetto(text, text, text, int, numeric, date);
create function public.crea_progetto(p_k text, p_titolo text, p_descrizione text,
                                     p_quote_totali int, p_costo_quota numeric, p_scadenza date, p_sigla text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; p public.progetti;
begin
  s := public._socio_da_codice(p_k);
  perform public._controlla_campi_progetto(p_titolo, p_descrizione, p_quote_totali, p_costo_quota, p_scadenza);
  if p_scadenza < (now() at time zone 'Europe/Rome')::date then
    raise exception 'La scadenza non può essere nel passato.' using errcode = 'P0001';
  end if;
  insert into public.progetti (titolo, descrizione, quote_totali, costo_quota, scadenza, creato_da, sigla)
  values (trim(p_titolo), trim(coalesce(p_descrizione, '')), p_quote_totali, p_costo_quota, p_scadenza, s.id, public._sigla(p_sigla))
  returning * into p;
  return public._progetto_json(p);
end $$;

drop function if exists public.modifica_progetto(text, uuid, text, text, int, numeric, date);
create function public.modifica_progetto(p_k text, p_id uuid, p_titolo text, p_descrizione text,
                                         p_quote_totali int, p_costo_quota numeric, p_scadenza date, p_sigla text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; p public.progetti; venduti int;
begin
  s := public._socio_da_codice(p_k);
  select * into p from public.progetti where id = p_id and stato <> 'eliminato' for update;
  if not found then raise exception 'Progetto non trovato.' using errcode = 'P0001'; end if;
  if p.creato_da <> s.id and not s.admin then
    raise exception 'Solo chi ha proposto il progetto può modificarlo.' using errcode = 'P0001';
  end if;
  perform public._controlla_campi_progetto(p_titolo, p_descrizione, p_quote_totali, p_costo_quota, p_scadenza);
  if p.stato in ('sviluppo','chiuso') and (p_quote_totali <> p.quote_totali or p_costo_quota <> p.costo_quota) then
    raise exception 'Il progetto è in esecuzione: per cambiare quote o costo riportalo prima in raccolta.' using errcode = 'P0001';
  end if;
  select coalesce(sum(quote), 0) into venduti from public.movimenti where progetto_id = p.id;
  if exists (select 1 from public.movimenti where progetto_id = p.id) then
    if p_costo_quota <> p.costo_quota then
      raise exception 'Il costo quota non si può cambiare dopo il primo acquisto.' using errcode = 'P0001';
    end if;
    if p_quote_totali < venduti then
      raise exception 'Sono già state vendute % quote: le quote totali non possono essere meno.', venduti using errcode = 'P0001';
    end if;
  end if;
  update public.progetti
     set titolo = trim(p_titolo), descrizione = trim(coalesce(p_descrizione, '')),
         quote_totali = p_quote_totali, costo_quota = p_costo_quota, scadenza = p_scadenza,
         sigla = case when p_sigla is null then sigla else public._sigla(p_sigla) end, aggiornato_il = now()
   where id = p.id returning * into p;
  return public._progetto_json(p);
end $$;

-- il socio ritira tutte le sue quote da un progetto ancora in raccolta: il credito gli torna
create function public.annulla_partecipazione(p_k text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; p public.progetti; q int; imp numeric;
begin
  s := public._socio_da_codice(p_k);
  select * into p from public.progetti where id = p_id and stato <> 'eliminato' for update;
  if not found then raise exception 'Progetto non trovato.' using errcode = 'P0001'; end if;
  if p.stato <> 'raccolta' then
    raise exception 'Il progetto è già in esecuzione: la partecipazione non si può più annullare.' using errcode = 'P0001';
  end if;
  perform 1 from public.soci where id = s.id for update;
  select coalesce(sum(quote), 0), coalesce(-sum(importo), 0) into q, imp from public.movimenti where progetto_id = p.id and socio_id = s.id;
  if q <= 0 or imp <= 0 then raise exception 'Non hai quote in questo progetto.' using errcode = 'P0001'; end if;
  insert into public.movimenti (socio_id, tipo, importo, progetto_id, quote, causale, fatto_da)
  values (s.id, 'rimborso', imp, p.id, -q, 'Partecipazione annullata', 'socio');
  return jsonb_build_object('ok', true, 'quote', q, 'importo', imp, 'progetto', public._progetto_json(p));
end $$;

create or replace function public.get_cassa() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'rate', coalesce((select jsonb_agg(public._rata_json(r) order by r.scadenza, r.titolo) from public.rate r), '[]'::jsonb),
    'entrate', coalesce((
      select jsonb_agg(jsonb_build_object('mese', t.mese, 'causale', t.causale, 'importo', t.importo, 'soci', t.n) order by t.mese, t.causale)
      from (select to_char(m.data at time zone 'Europe/Rome', 'YYYY-MM') as mese, m.causale, sum(m.importo) as importo, count(*) as n
            from public.movimenti m where m.tipo in ('accredito','addebito') group by 1, 2) t), '[]'::jsonb),
    'progetti', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', x.id, 'titolo', x.titolo, 'sigla', x.sigla, 'descrizione', x.descrizione, 'stato', x.stato, 'scadenza', x.scadenza,
          'eseguitoIl', x.eseguito_il, 'chiusoIl', x.chiuso_il, 'quoteTotali', x.quote_totali, 'costoQuota', x.costo_quota,
          'totale', (x.quote_totali * x.costo_quota)::numeric(10,2),
          'raccolto', coalesce(r.raccolto, 0), 'quoteVendute', coalesce(r.quote_vendute, 0),
          'sostenitori', coalesce(r.sostenitori, 0))
        order by x.scadenza, x.titolo)
      from public.progetti x left join public.raccolta_progetti r on r.progetto_id = x.id
      where x.stato <> 'eliminato'), '[]'::jsonb),
    'creditoLibero', coalesce((select sum(importo) from public.movimenti), 0)
  )
$$;

revoke all on function public._sigla(text) from public, anon, authenticated;
revoke all on function public.crea_progetto(text, text, text, int, numeric, date, text),
  public.modifica_progetto(text, uuid, text, text, int, numeric, date, text),
  public.annulla_partecipazione(text, uuid) from public;
grant execute on function public.crea_progetto(text, text, text, int, numeric, date, text),
  public.modifica_progetto(text, uuid, text, text, int, numeric, date, text),
  public.annulla_partecipazione(text, uuid) to anon, authenticated;
