-- Rate dei soci al posto del piano di cassa.
--  * l'admin crea le rate (titolo, importo, scadenza) e le assegna ai soci
--  * il socio (o l'admin) segna "pagata": nasce un accredito sul suo credito
--  * l'admin può annullare un pagamento: nasce un addebito uguale (solo se il credito c'è ancora)
--  * flusso di cassa = entrate effettive (accrediti/addebiti) − progetti realizzati (in esecuzione o chiusi)
--  * disponibile = credito libero dei soci + quote bloccate nei progetti in raccolta

-- ============================================================ tabelle

create table public.rate (
  id        uuid primary key default gen_random_uuid(),
  titolo    text not null check (length(trim(titolo)) between 1 and 80),
  importo   numeric(10,2) not null check (importo > 0 and importo <= 100000),
  scadenza  date not null,
  creata_il timestamptz not null default now()
);

create table public.rate_soci (
  rata_id      uuid not null references public.rate(id) on delete cascade,
  socio_id     uuid not null references public.soci(id),
  pagata_il    timestamptz,
  movimento_id bigint references public.movimenti(id),
  primary key (rata_id, socio_id),
  constraint rate_soci_pagamento check ((pagata_il is null) = (movimento_id is null))
);
create index rate_soci_socio on public.rate_soci (socio_id);

alter table public.rate enable row level security;
alter table public.rate_soci enable row level security;
revoke all on public.rate, public.rate_soci from anon, authenticated;

-- quando un progetto è passato in esecuzione: è il giorno dell'uscita di cassa
alter table public.progetti add column if not exists eseguito_il timestamptz;

-- ============================================================ via il vecchio piano

drop function if exists public.get_piano();
drop function if exists public.admin_piano_salva(text, text, int, text, jsonb, jsonb);
drop table if exists public.piano_uscite;
drop table if exists public.piano_rate;
drop table if exists public.piano_cassa;

-- ============================================================ json

create function public._rata_json(r public.rate) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'titolo', r.titolo, 'importo', r.importo, 'scadenza', r.scadenza,
    'soci', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, ''),
                                          'pagataIl', rs.pagata_il) order by lower(s.nome))
      from public.rate_soci rs join public.soci s on s.id = rs.socio_id where rs.rata_id = r.id), '[]'::jsonb))
$$;

-- ============================================================ lettura

create function public.get_cassa() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'rate', coalesce((select jsonb_agg(public._rata_json(r) order by r.scadenza, r.titolo) from public.rate r), '[]'::jsonb),
    'entrate', coalesce((
      select jsonb_agg(jsonb_build_object('mese', t.mese, 'causale', t.causale, 'importo', t.importo, 'soci', t.n) order by t.mese, t.causale)
      from (select to_char(m.data at time zone 'Europe/Rome', 'YYYY-MM') as mese, m.causale, sum(m.importo) as importo, count(*) as n
            from public.movimenti m where m.tipo in ('accredito','addebito') group by 1, 2) t), '[]'::jsonb),
    'progetti', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', x.id, 'titolo', x.titolo, 'descrizione', x.descrizione, 'stato', x.stato, 'scadenza', x.scadenza,
          'eseguitoIl', x.eseguito_il, 'quoteTotali', x.quote_totali, 'costoQuota', x.costo_quota,
          'totale', (x.quote_totali * x.costo_quota)::numeric(10,2),
          'raccolto', coalesce(r.raccolto, 0), 'quoteVendute', coalesce(r.quote_vendute, 0),
          'sostenitori', (select count(distinct m.socio_id) from public.movimenti m where m.progetto_id = x.id and m.tipo = 'acquisto'))
        order by x.scadenza, x.titolo)
      from public.progetti x left join public.raccolta_progetti r on r.progetto_id = x.id
      where x.stato <> 'eliminato'), '[]'::jsonb),
    'creditoLibero', coalesce((select sum(importo) from public.movimenti), 0)
  )
$$;

create function public.get_rate_socio(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'titolo', r.titolo, 'importo', r.importo,
                                               'scadenza', r.scadenza, 'pagataIl', rs.pagata_il)
                            order by rs.pagata_il is not null, r.scadenza, r.titolo), '[]'::jsonb)
  from public.rate_soci rs join public.rate r on r.id = rs.rata_id where rs.socio_id = p_id
$$;

-- ============================================================ pagamenti

create function public.rata_paga(p_k text, p_rata uuid, p_socio uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; r public.rate; rs public.rate_soci; mid bigint;
begin
  s := public._socio_da_codice(p_k);
  if s.id <> p_socio and not s.admin then
    raise exception 'Puoi segnare come pagate solo le tue rate.' using errcode = 'P0001';
  end if;
  select * into r from public.rate where id = p_rata;
  if not found then raise exception 'Rata non trovata.' using errcode = 'P0001'; end if;
  perform 1 from public.soci where id = p_socio for update;
  select * into rs from public.rate_soci where rata_id = p_rata and socio_id = p_socio for update;
  if not found then raise exception 'Questa rata non è assegnata a questo socio.' using errcode = 'P0001'; end if;
  if rs.pagata_il is not null then raise exception 'Questa rata è già segnata come pagata.' using errcode = 'P0001'; end if;
  insert into public.movimenti (socio_id, tipo, importo, causale, fatto_da)
  values (p_socio, 'accredito', r.importo, 'Rata: ' || r.titolo, case when s.id = p_socio then 'socio' else 'admin' end)
  returning id into mid;
  update public.rate_soci set pagata_il = now(), movimento_id = mid where rata_id = p_rata and socio_id = p_socio;
  return jsonb_build_object('ok', true, 'importo', r.importo);
end $$;

create function public.admin_rata_annulla(p_k text, p_rata uuid, p_socio uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.rate; rs public.rate_soci; cred numeric; v_nome text;
begin
  perform public._admin_da_codice(p_k);
  select * into r from public.rate where id = p_rata;
  if not found then raise exception 'Rata non trovata.' using errcode = 'P0001'; end if;
  select s.nome into v_nome from public.soci s where s.id = p_socio for update;
  select * into rs from public.rate_soci where rata_id = p_rata and socio_id = p_socio for update;
  if not found or rs.pagata_il is null then raise exception 'Questa rata non risulta pagata.' using errcode = 'P0001'; end if;
  select coalesce(sum(importo), 0) into cred from public.movimenti where socio_id = p_socio;
  if cred < r.importo then
    raise exception '% ha già usato questi soldi per comprare quote (credito libero %): prima storna gli acquisti.',
      v_nome, replace(cred::numeric(10,2)::text, '.', ',') || ' €' using errcode = 'P0001';
  end if;
  insert into public.movimenti (socio_id, tipo, importo, causale, fatto_da, rif_movimento)
  values (p_socio, 'addebito', -r.importo, 'Annullata rata: ' || r.titolo, 'admin', rs.movimento_id);
  update public.rate_soci set pagata_il = null, movimento_id = null where rata_id = p_rata and socio_id = p_socio;
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================ gestione rate (admin)

create function public.admin_rata_salva(p_k text, p_id uuid, p_titolo text, p_importo numeric, p_scadenza date, p_soci uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.rate; pagati int; tolti text;
begin
  perform public._admin_da_codice(p_k);
  if length(trim(coalesce(p_titolo, ''))) = 0 then raise exception 'Scrivi il nome della rata.' using errcode = 'P0001'; end if;
  if length(trim(p_titolo)) > 80 then raise exception 'Il nome può avere al massimo 80 caratteri.' using errcode = 'P0001'; end if;
  if p_importo is null or p_importo <= 0 or p_importo > 100000 or p_importo <> round(p_importo, 2) then
    raise exception 'Importo non valido.' using errcode = 'P0001';
  end if;
  if p_scadenza is null then raise exception 'Scegli la scadenza.' using errcode = 'P0001'; end if;
  if p_soci is null or array_length(p_soci, 1) is null then raise exception 'Scegli almeno un socio.' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(p_soci) x where not exists (select 1 from public.soci s where s.id = x)) then
    raise exception 'Socio non trovato.' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.rate (titolo, importo, scadenza) values (trim(p_titolo), p_importo, p_scadenza) returning * into r;
  else
    select * into r from public.rate where id = p_id for update;
    if not found then raise exception 'Rata non trovata.' using errcode = 'P0001'; end if;
    select count(*) into pagati from public.rate_soci where rata_id = r.id and pagata_il is not null;
    if pagati > 0 and p_importo <> r.importo then
      raise exception 'L''importo non si può cambiare: qualcuno ha già pagato questa rata.' using errcode = 'P0001';
    end if;
    select string_agg(s.nome, ', ') into tolti from public.rate_soci rs join public.soci s on s.id = rs.socio_id
     where rs.rata_id = r.id and rs.pagata_il is not null and not (rs.socio_id = any(p_soci));
    if tolti is not null then
      raise exception 'Non puoi togliere chi ha già pagato (%): annulla prima il pagamento.', tolti using errcode = 'P0001';
    end if;
    delete from public.rate_soci where rata_id = r.id and pagata_il is null and not (socio_id = any(p_soci));
    update public.rate set titolo = trim(p_titolo), importo = p_importo, scadenza = p_scadenza where id = r.id returning * into r;
  end if;
  insert into public.rate_soci (rata_id, socio_id) select r.id, x from unnest(p_soci) x on conflict do nothing;
  return public._rata_json(r);
end $$;

create function public.admin_rata_elimina(p_k text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._admin_da_codice(p_k);
  if exists (select 1 from public.rate_soci where rata_id = p_id and pagata_il is not null) then
    raise exception 'Qualcuno ha già pagato questa rata: annulla prima i pagamenti.' using errcode = 'P0001';
  end if;
  delete from public.rate where id = p_id;
  if not found then raise exception 'Rata non trovata.' using errcode = 'P0001'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================ coerenza con i progetti

-- data di esecuzione = giorno in cui i soldi escono dalla cassa
create or replace function public.imposta_stato_progetto(p_k text, p_id uuid, p_stato text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; p public.progetti; venduti int; mancano int;
begin
  s := public._socio_da_codice(p_k);
  if not s.admin then raise exception 'Solo l''admin può cambiare lo stato.' using errcode = 'P0001'; end if;
  if p_stato not in ('raccolta','sviluppo','chiuso') then raise exception 'Stato non valido.' using errcode = 'P0001'; end if;
  select * into p from public.progetti where id = p_id and stato <> 'eliminato' for update;
  if not found then raise exception 'Progetto non trovato.' using errcode = 'P0001'; end if;
  if p_stato in ('sviluppo','chiuso') then
    select coalesce(sum(quote), 0) into venduti from public.movimenti where progetto_id = p.id;
    mancano := p.quote_totali - venduti;
    if mancano > 0 then
      raise exception 'Per passare in esecuzione il progetto deve essere finanziato al 100%%: % (% €).',
        case when mancano = 1 then 'manca 1 quota' else 'mancano ' || mancano || ' quote' end,
        replace((mancano * p.costo_quota)::numeric(10,2)::text, '.', ',') using errcode = 'P0001';
    end if;
  end if;
  update public.progetti
     set stato = p_stato, aggiornato_il = now(),
         eseguito_il = case when p_stato = 'raccolta' then null else coalesce(eseguito_il, now()) end
   where id = p.id returning * into p;
  return public._progetto_json(p);
end $$;

-- i soldi di un progetto in esecuzione sono già usciti: niente storni né rimborsi
create or replace function public.elimina_progetto(p_k text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; p public.progetti; r record; n int := 0; tot numeric := 0;
begin
  s := public._socio_da_codice(p_k);
  if not s.admin then raise exception 'Solo l''admin può eliminare un progetto.' using errcode = 'P0001'; end if;
  select * into p from public.progetti where id = p_id and stato <> 'eliminato' for update;
  if not found then raise exception 'Progetto non trovato.' using errcode = 'P0001'; end if;
  if p.stato in ('sviluppo','chiuso') then
    raise exception 'Il progetto è già realizzato e pagato: riportalo prima in raccolta per eliminarlo e rimborsare i soci.' using errcode = 'P0001';
  end if;
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

create or replace function public.admin_storna(p_k text, p_movimento bigint, p_quote int, p_causale text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.soci; m public.movimenti; gia int; unit numeric; v_causale text := trim(coalesce(p_causale, ''));
begin
  a := public._admin_da_codice(p_k);
  select * into m from public.movimenti where id = p_movimento;
  if not found or m.tipo <> 'acquisto' then raise exception 'Si possono stornare solo gli acquisti.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.progetti where id = m.progetto_id and stato in ('sviluppo','chiuso')) then
    raise exception 'Il progetto è già realizzato e pagato: riportalo prima in raccolta per stornare.' using errcode = 'P0001';
  end if;
  perform 1 from public.soci where id = m.socio_id for update;
  select coalesce(-sum(quote), 0) into gia from public.movimenti where rif_movimento = m.id and tipo = 'storno';
  if m.quote - gia <= 0 then raise exception 'Questo acquisto è già stato stornato del tutto.' using errcode = 'P0001'; end if;
  if p_quote is null or p_quote < 1 or p_quote > m.quote - gia then
    raise exception 'Puoi stornare da 1 a % quote di questo acquisto.', m.quote - gia using errcode = 'P0001';
  end if;
  unit := round(-m.importo / m.quote, 2);
  insert into public.movimenti (socio_id, tipo, importo, progetto_id, quote, causale, fatto_da, rif_movimento)
  values (m.socio_id, 'storno', p_quote * unit, m.progetto_id, -p_quote,
          coalesce(nullif(v_causale, ''), 'Storno ' || p_quote || case when p_quote = 1 then ' quota' else ' quote' end),
          'admin', m.id);
  return jsonb_build_object('ok', true, 'importo', p_quote * unit);
end $$;

-- ============================================================ permessi

revoke all on function public._rata_json(public.rate) from public, anon, authenticated;
revoke all on function public.get_cassa(), public.get_rate_socio(uuid), public.rata_paga(text, uuid, uuid),
  public.admin_rata_annulla(text, uuid, uuid), public.admin_rata_salva(text, uuid, text, numeric, date, uuid[]),
  public.admin_rata_elimina(text, uuid) from public;
grant execute on function public.get_cassa(), public.get_rate_socio(uuid), public.rata_paga(text, uuid, uuid),
  public.admin_rata_annulla(text, uuid, uuid), public.admin_rata_salva(text, uuid, text, numeric, date, uuid[]),
  public.admin_rata_elimina(text, uuid) to anon, authenticated;

-- ============================================================ rate dell'ultimo piano (8 soci attivi)

with nuove as (
  insert into public.rate (titolo, importo, scadenza) values
    ('1ª rata moto', 300, '2026-11-30'),
    ('2ª rata moto', 350, '2026-12-31'),
    ('Terra e fondocassa · gennaio', 25, '2027-01-31'),
    ('Terra e fondocassa · febbraio', 25, '2027-02-28'),
    ('Terra e fondocassa · marzo', 25, '2027-03-31'),
    ('Terra e fondocassa · aprile', 25, '2027-04-30')
  returning id
)
insert into public.rate_soci (rata_id, socio_id)
select n.id, s.id from nuove n cross join public.soci s where s.attivo;

-- la "Quota novembre 2026" già accreditata (300 € a testa) è la 1ª rata moto: la segno pagata
update public.rate_soci rs
   set pagata_il = m.data, movimento_id = m.id
  from public.rate r, public.movimenti m
 where r.id = rs.rata_id and r.titolo = '1ª rata moto'
   and m.socio_id = rs.socio_id and m.tipo = 'accredito' and m.causale = 'Quota novembre 2026' and m.importo = 300;
