-- Data di chiusura del progetto: da lì il suo costo diventa capitale immobilizzato (beni della società).
alter table public.progetti add column if not exists chiuso_il timestamptz;
update public.progetti set chiuso_il = coalesce(eseguito_il, aggiornato_il) where stato = 'chiuso' and chiuso_il is null;

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
         eseguito_il = case when p_stato = 'raccolta' then null else coalesce(eseguito_il, now()) end,
         chiuso_il   = case when p_stato = 'chiuso' then coalesce(chiuso_il, now()) else null end
   where id = p.id returning * into p;
  return public._progetto_json(p);
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
          'id', x.id, 'titolo', x.titolo, 'descrizione', x.descrizione, 'stato', x.stato, 'scadenza', x.scadenza,
          'eseguitoIl', x.eseguito_il, 'chiusoIl', x.chiuso_il, 'quoteTotali', x.quote_totali, 'costoQuota', x.costo_quota,
          'totale', (x.quote_totali * x.costo_quota)::numeric(10,2),
          'raccolto', coalesce(r.raccolto, 0), 'quoteVendute', coalesce(r.quote_vendute, 0),
          'sostenitori', (select count(*) from (select 1 from public.movimenti m where m.progetto_id = x.id group by m.socio_id having sum(m.quote) > 0) q))
        order by x.scadenza, x.titolo)
      from public.progetti x left join public.raccolta_progetti r on r.progetto_id = x.id
      where x.stato <> 'eliminato'), '[]'::jsonb),
    'creditoLibero', coalesce((select sum(importo) from public.movimenti), 0)
  )
$$;
