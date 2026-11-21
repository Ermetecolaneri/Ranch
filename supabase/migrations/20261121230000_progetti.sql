-- Sezione Progetti: proposte dei soci, raccolta quote con il credito, stati, eliminazione con rimborso.

-- ============================================================ admin

alter table public.soci add column admin boolean not null default false;

-- ============================================================ progetti: nuova forma

alter table public.progetti drop constraint if exists progetti_stato_check;
alter table public.progetti drop column budget;
alter table public.progetti rename column nome to titolo;
alter table public.progetti rename column prezzo_quota to costo_quota;
alter table public.progetti
  add column quote_totali int  not null check (quote_totali between 1 and 10000),
  add column scadenza     date not null,
  add column creato_da    uuid not null references public.soci(id),
  add column aggiornato_il timestamptz not null default now(),
  alter column stato set default 'raccolta',
  add constraint progetti_stato_check check (stato in ('raccolta','sviluppo','chiuso','eliminato')),
  add constraint progetti_titolo_len check (length(titolo) <= 80),
  add constraint progetti_descrizione_len check (length(descrizione) <= 1000);
create index progetti_creato_da on public.progetti (creato_da);

-- ============================================================ funzioni interne

-- socio dal codice del link personale, o errore
create function public._socio_da_codice(p_k text) returns public.soci
language plpgsql stable set search_path = public as $$
declare s public.soci;
begin
  select * into s from public.soci where codice = p_k and attivo;
  if not found then raise exception 'Link personale non valido.' using errcode = 'P0001'; end if;
  return s;
end $$;

-- numeri della raccolta di un progetto
create view public.raccolta_progetti with (security_invoker = true) as
select p.id as progetto_id,
       coalesce(-sum(m.importo), 0)::numeric(10,2) as raccolto,
       coalesce(sum(m.quote), 0)::int as quote_vendute,
       (select count(*) from (
          select socio_id from public.movimenti x where x.progetto_id = p.id
          group by socio_id having sum(x.quote) > 0) t)::int as sostenitori
from public.progetti p
left join public.movimenti m on m.progetto_id = p.id
group by p.id;
revoke all on public.raccolta_progetti from anon, authenticated;

create function public._progetto_json(p public.progetti) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', p.id,
    'titolo', p.titolo,
    'descrizione', p.descrizione,
    'foto', coalesce(p.foto_path, ''),
    'quoteTotali', p.quote_totali,
    'costoQuota', p.costo_quota,
    'totale', (p.quote_totali * p.costo_quota)::numeric(10,2),
    'raccolto', coalesce(r.raccolto, 0),
    'quoteVendute', coalesce(r.quote_vendute, 0),
    'sostenitori', coalesce(r.sostenitori, 0),
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

create function public._controlla_campi_progetto(p_titolo text, p_descrizione text, p_quote int, p_costo numeric, p_scadenza date)
returns void language plpgsql immutable set search_path = public as $$
begin
  if length(trim(coalesce(p_titolo, ''))) = 0 then raise exception 'Scrivi un titolo.' using errcode = 'P0001'; end if;
  if length(trim(p_titolo)) > 80 then raise exception 'Il titolo può avere al massimo 80 caratteri.' using errcode = 'P0001'; end if;
  if length(coalesce(p_descrizione, '')) > 1000 then raise exception 'La descrizione può avere al massimo 1000 caratteri.' using errcode = 'P0001'; end if;
  if p_quote is null or p_quote < 1 or p_quote > 10000 then raise exception 'Le quote totali vanno da 1 a 10000.' using errcode = 'P0001'; end if;
  if p_costo is null or p_costo <= 0 or p_costo > 10000 or p_costo <> round(p_costo, 2) then
    raise exception 'Il costo quota deve essere tra 0,01 e 10000 euro.' using errcode = 'P0001';
  end if;
  if p_scadenza is null then raise exception 'Scegli una data di scadenza.' using errcode = 'P0001'; end if;
end $$;

-- ============================================================ lettura

create function public.get_progetti() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'progetti', coalesce(jsonb_agg(public._progetto_json(p) order by
        case p.stato when 'raccolta' then 0 when 'sviluppo' then 1 else 2 end, p.scadenza, p.creato_il desc), '[]'::jsonb),
    'kpi', jsonb_build_object(
      'progetti', count(*),
      'raccolto', coalesce(sum(r.raccolto), 0),
      'totale', coalesce(sum(p.quote_totali * p.costo_quota), 0)
    )
  )
  from public.progetti p
  left join public.raccolta_progetti r on r.progetto_id = p.id
  where p.stato <> 'eliminato'
$$;

create function public.get_progetto(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.progetti;
begin
  select * into p from public.progetti where id = p_id and stato <> 'eliminato';
  if not found then raise exception 'Progetto non trovato.' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'progetto', public._progetto_json(p),
    'finanziatori', coalesce((
      select jsonb_agg(jsonb_build_object(
          'socio', jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, ''),
                                      'numeroGara', s.numero_gara, 'numeroFont', s.numero_font, 'numeroColore', s.numero_colore),
          'data', m.data, 'tipo', m.tipo, 'quote', m.quote, 'importo', -m.importo, 'messaggio', m.messaggio)
        order by m.data desc, m.id desc)
      from public.movimenti m join public.soci s on s.id = m.socio_id
      where m.progetto_id = p.id
    ), '[]'::jsonb)
  );
end $$;

-- ============================================================ scrittura (soci)

create function public.crea_progetto(p_k text, p_titolo text, p_descrizione text,
                                     p_quote_totali int, p_costo_quota numeric, p_scadenza date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; p public.progetti;
begin
  s := public._socio_da_codice(p_k);
  perform public._controlla_campi_progetto(p_titolo, p_descrizione, p_quote_totali, p_costo_quota, p_scadenza);
  if p_scadenza < (now() at time zone 'Europe/Rome')::date then
    raise exception 'La scadenza non può essere nel passato.' using errcode = 'P0001';
  end if;
  insert into public.progetti (titolo, descrizione, quote_totali, costo_quota, scadenza, creato_da)
  values (trim(p_titolo), trim(coalesce(p_descrizione, '')), p_quote_totali, p_costo_quota, p_scadenza, s.id)
  returning * into p;
  return public._progetto_json(p);
end $$;

-- il creatore o l'admin modificano il progetto; quote e costo solo se nessuno ha ancora comprato
create function public.modifica_progetto(p_k text, p_id uuid, p_titolo text, p_descrizione text,
                                         p_quote_totali int, p_costo_quota numeric, p_scadenza date) returns jsonb
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
         quote_totali = p_quote_totali, costo_quota = p_costo_quota, scadenza = p_scadenza, aggiornato_il = now()
   where id = p.id returning * into p;
  return public._progetto_json(p);
end $$;

create function public.acquista_quote(p_k text, p_id uuid, p_quote int, p_messaggio text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; p public.progetti; venduti int; credito numeric; costo numeric; v_msg text := trim(coalesce(p_messaggio, ''));
begin
  s := public._socio_da_codice(p_k);
  perform 1 from public.soci where id = s.id for update;                       -- un acquisto alla volta per socio
  select * into p from public.progetti where id = p_id and stato <> 'eliminato' for update;  -- e per progetto
  if not found then raise exception 'Progetto non trovato.' using errcode = 'P0001'; end if;
  if p.stato <> 'raccolta' then raise exception 'La raccolta per questo progetto è chiusa.' using errcode = 'P0001'; end if;
  if p.scadenza < (now() at time zone 'Europe/Rome')::date then
    raise exception 'Il progetto è scaduto.' using errcode = 'P0001';
  end if;
  if p_quote is null or p_quote < 1 then raise exception 'Scegli almeno una quota.' using errcode = 'P0001'; end if;
  if length(v_msg) > 200 then raise exception 'Il messaggio può avere al massimo 200 caratteri.' using errcode = 'P0001'; end if;
  select coalesce(sum(quote), 0) into venduti from public.movimenti where progetto_id = p.id;
  if p_quote > p.quote_totali - venduti then
    raise exception 'Restano solo % quote.', p.quote_totali - venduti using errcode = 'P0001';
  end if;
  costo := p_quote * p.costo_quota;
  select coalesce(sum(importo), 0) into credito from public.movimenti where socio_id = s.id;
  if costo > credito then
    raise exception 'Credito insufficiente: hai % €, servono % €.', replace(credito::text, '.', ','), replace(costo::text, '.', ',') using errcode = 'P0001';
  end if;
  insert into public.movimenti (socio_id, tipo, importo, progetto_id, quote, causale, messaggio, fatto_da)
  values (s.id, 'acquisto', -costo, p.id, p_quote, p_quote || case when p_quote = 1 then ' quota' else ' quote' end, v_msg, 'socio');
  return jsonb_build_object('progetto', public._progetto_json(p), 'credito', credito - costo);
end $$;

-- ============================================================ scrittura (admin)

create function public.imposta_stato_progetto(p_k text, p_id uuid, p_stato text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; p public.progetti;
begin
  s := public._socio_da_codice(p_k);
  if not s.admin then raise exception 'Solo l''admin può cambiare lo stato.' using errcode = 'P0001'; end if;
  if p_stato not in ('raccolta','sviluppo','chiuso') then raise exception 'Stato non valido.' using errcode = 'P0001'; end if;
  update public.progetti set stato = p_stato, aggiornato_il = now()
   where id = p_id and stato <> 'eliminato' returning * into p;
  if not found then raise exception 'Progetto non trovato.' using errcode = 'P0001'; end if;
  return public._progetto_json(p);
end $$;

-- elimina = nasconde il progetto e restituisce il credito a chi aveva comprato quote
create function public.elimina_progetto(p_k text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; p public.progetti; r record; n int := 0; tot numeric := 0;
begin
  s := public._socio_da_codice(p_k);
  if not s.admin then raise exception 'Solo l''admin può eliminare un progetto.' using errcode = 'P0001'; end if;
  select * into p from public.progetti where id = p_id and stato <> 'eliminato' for update;
  if not found then raise exception 'Progetto non trovato.' using errcode = 'P0001'; end if;
  for r in
    select socio_id, sum(quote) as quote, -sum(importo) as importo
    from public.movimenti where progetto_id = p.id
    group by socio_id having -sum(importo) > 0
  loop
    insert into public.movimenti (socio_id, tipo, importo, progetto_id, quote, causale, fatto_da)
    values (r.socio_id, 'rimborso', r.importo, p.id, -r.quote, 'Rimborso: progetto eliminato', 'admin');
    n := n + 1; tot := tot + r.importo;
  end loop;
  update public.progetti set stato = 'eliminato', aggiornato_il = now() where id = p.id;
  return jsonb_build_object('rimborsati', n, 'importo', tot);
end $$;

-- ============================================================ aggiornamenti a funzioni esistenti

-- whoami ora dice anche se sei admin e quanto credito hai
create or replace function public.whoami(p_k text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, ''), 'admin', s.admin,
                            'credito', coalesce((select sum(importo) from public.movimenti where socio_id = s.id), 0))
  from public.soci s where s.codice = p_k and s.attivo
$$;

-- la scheda socio usa il nuovo nome della colonna (titolo) e ignora i progetti eliminati
create or replace function public.get_socio(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.soci;
begin
  select * into s from public.soci where id = p_id and attivo;
  if not found then raise exception 'Socio non trovato.' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'socio', public._socio_json(s),
    'progetti', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.titolo, 'quote', t.quote, 'importo', t.importo) order by p.titolo)
      from (select progetto_id, sum(quote) as quote, -sum(importo) as importo
            from public.movimenti where socio_id = s.id and progetto_id is not null
            group by progetto_id having sum(quote) > 0) t
      join public.progetti p on p.id = t.progetto_id and p.stato <> 'eliminato'
    ), '[]'::jsonb),
    'movimenti', coalesce((
      select jsonb_agg(jsonb_build_object('data', m.data, 'tipo', m.tipo, 'importo', m.importo,
                                          'causale', m.causale, 'progetto', coalesce(p.titolo, '')) order by m.data desc, m.id desc)
      from (select * from public.movimenti where socio_id = s.id order by data desc, id desc limit 10) m
      left join public.progetti p on p.id = m.progetto_id
    ), '[]'::jsonb)
  );
end $$;

-- ============================================================ permessi

revoke all on function public._socio_da_codice(text), public._progetto_json(public.progetti),
  public._controlla_campi_progetto(text, text, int, numeric, date) from public, anon, authenticated;

revoke all on function public.get_progetti(), public.get_progetto(uuid),
  public.crea_progetto(text, text, text, int, numeric, date),
  public.modifica_progetto(text, uuid, text, text, int, numeric, date),
  public.acquista_quote(text, uuid, int, text),
  public.imposta_stato_progetto(text, uuid, text),
  public.elimina_progetto(text, uuid) from public, anon, authenticated;
grant execute on function public.get_progetti(), public.get_progetto(uuid),
  public.crea_progetto(text, text, text, int, numeric, date),
  public.modifica_progetto(text, uuid, text, text, int, numeric, date),
  public.acquista_quote(text, uuid, int, text),
  public.imposta_stato_progetto(text, uuid, text),
  public.elimina_progetto(text, uuid) to anon, authenticated;

-- ============================================================ foto dei progetti

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progetti', 'progetti', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- Ermete è l'admin
update public.soci set admin = true where nome = 'Ermete Cola';
