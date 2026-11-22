-- Cassa allineata ai progetti:
--  * le uscite previste sono i progetti (costo totale nel mese di scadenza) + eventuali altre uscite manuali
--  * un progetto passa "in esecuzione" (o chiuso) solo se è finanziato al 100%
--  * situazione reale: versato dai soci, speso per i progetti in esecuzione, in cassa ora, quadratura

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
  update public.progetti set stato = p_stato, aggiornato_il = now() where id = p.id returning * into p;
  return public._progetto_json(p);
end $$;

create or replace function public.get_piano() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'titolo', p.titolo, 'soci', p.soci, 'note', p.note, 'aggiornatoIl', p.aggiornato_il,
    'rate', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'mese', r.mese, 'voce', r.voce,
                        'quotaMoto', r.quota_moto, 'quotaCassa', r.quota_cassa) order by r.mese, r.voce)
                      from public.piano_rate r), '[]'::jsonb),
    'uscite', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'mese', u.mese, 'voce', u.voce, 'importo', u.importo)
                        order by u.mese, u.voce) from public.piano_uscite u), '[]'::jsonb),
    'progetti', coalesce((select jsonb_agg(jsonb_build_object(
                          'id', x.id, 'titolo', x.titolo, 'descrizione', x.descrizione, 'stato', x.stato, 'scadenza', x.scadenza,
                          'quoteTotali', x.quote_totali, 'costoQuota', x.costo_quota,
                          'totale', (x.quote_totali * x.costo_quota)::numeric(10,2),
                          'raccolto', coalesce(r.raccolto, 0), 'quoteVendute', coalesce(r.quote_vendute, 0))
                          order by x.scadenza, x.titolo)
                        from public.progetti x left join public.raccolta_progetti r on r.progetto_id = x.id
                        where x.stato <> 'eliminato'), '[]'::jsonb),
    'reale', jsonb_build_object(
      'versato', coalesce((select sum(importo) from public.movimenti where tipo in ('accredito','addebito')), 0),
      'creditoLibero', coalesce((select sum(importo) from public.movimenti), 0),
      'quoteAperte', coalesce((select sum(r.raccolto) from public.progetti x join public.raccolta_progetti r on r.progetto_id = x.id
                               where x.stato = 'raccolta'), 0),
      'raccoltoEsecuzione', coalesce((select sum(r.raccolto) from public.progetti x join public.raccolta_progetti r on r.progetto_id = x.id
                                      where x.stato in ('sviluppo','chiuso')), 0),
      'speso', coalesce((select sum(x.quote_totali * x.costo_quota) from public.progetti x where x.stato in ('sviluppo','chiuso')), 0)
    )
  )
  from public.piano_cassa p where p.id = 1
$$;

-- le uscite delle moto e del movimento terra ora arrivano dai progetti
delete from public.piano_uscite where voce in ('Ordine 4 moto (4 × 1.300 €)', 'Movimento terra');
update public.piano_cassa set note =
  '4 moto da 1.300 € in comproprietà in parti uguali, ordine il 1° gennaio (soldi in cassa entro il 31/12). Le uscite sono i progetti, nel mese della loro scadenza.',
  aggiornato_il = now() where id = 1;

-- progetti allineati al piano: moto da 1.300 € (26 quote da 50 €), movimento terra 300 € (60 quote da 5 €)
update public.progetti set quote_totali = 26, aggiornato_il = now()
 where titolo like 'Valtinsu EM5 Ultra #%' and stato <> 'eliminato' and costo_quota = 50 and quote_totali = 27;
update public.progetti set quote_totali = 60, aggiornato_il = now()
 where titolo = 'Movimento terra circuito' and stato <> 'eliminato' and costo_quota = 5 and quote_totali = 50;

-- un progetto in esecuzione o chiuso non cambia quote e costo (altrimenti la cassa non quadra più)
create or replace function public.modifica_progetto(p_k text, p_id uuid, p_titolo text, p_descrizione text,
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
         quote_totali = p_quote_totali, costo_quota = p_costo_quota, scadenza = p_scadenza, aggiornato_il = now()
   where id = p.id returning * into p;
  return public._progetto_json(p);
end $$;
