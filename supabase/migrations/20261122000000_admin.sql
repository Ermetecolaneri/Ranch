-- Pagina admin: crediti (singoli e "applica a tutti"), storni, storico, gestione soci.
-- Ogni funzione verifica che il codice appartenga a un socio admin.

create function public._admin_da_codice(p_k text) returns public.soci
language plpgsql stable set search_path = public as $$
declare s public.soci;
begin
  s := public._socio_da_codice(p_k);
  if not s.admin then raise exception 'Funzione riservata all''admin.' using errcode = 'P0001'; end if;
  return s;
end $$;

-- ============================================================ panoramica

create function public.admin_get(p_k text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._admin_da_codice(p_k);
  return jsonb_build_object(
    'soci', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, ''), 'attivo', s.attivo, 'admin', s.admin,
          'dataIngresso', s.data_ingresso, 'codice', s.codice,
          'numeroGara', s.numero_gara, 'numeroFont', s.numero_font, 'numeroColore', s.numero_colore,
          'credito', coalesce(sa.credito, 0), 'investito', coalesce(sa.investito, 0))
        order by s.attivo desc, lower(s.nome))
      from public.soci s left join public.saldi_soci sa on sa.socio_id = s.id
    ), '[]'::jsonb),
    'fondocassa', coalesce((select sum(sa.credito) from public.saldi_soci sa join public.soci s on s.id = sa.socio_id where s.attivo), 0),
    'causaliRecenti', coalesce((
      select jsonb_agg(c) from (
        select causale as c from public.movimenti where tipo = 'accredito' and causale <> ''
        group by causale order by max(data) desc limit 6) t
    ), '[]'::jsonb)
  );
end $$;

-- ============================================================ crediti

-- Accredita (importo > 0) o addebita (importo < 0) a uno o più soci.
-- Se la stessa causale è già stata usata per qualcuno di loro e p_forza è falso, non scrive nulla
-- e restituisce l'elenco dei soci già accreditati, così l'app può chiedere conferma.
create function public.admin_accredita(p_k text, p_soci uuid[], p_importo numeric, p_causale text, p_forza boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.soci; v_causale text := trim(coalesce(p_causale, '')); doppi jsonb; r record; n int := 0;
begin
  a := public._admin_da_codice(p_k);
  if p_soci is null or array_length(p_soci, 1) is null then raise exception 'Scegli almeno un socio.' using errcode = 'P0001'; end if;
  if p_importo is null or p_importo = 0 or abs(p_importo) > 100000 or p_importo <> round(p_importo, 2) then
    raise exception 'Importo non valido.' using errcode = 'P0001';
  end if;
  if v_causale = '' then raise exception 'Scrivi una causale.' using errcode = 'P0001'; end if;
  if length(v_causale) > 120 then raise exception 'La causale può avere al massimo 120 caratteri.' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(p_soci) x where not exists (select 1 from public.soci s where s.id = x)) then
    raise exception 'Socio non trovato.' using errcode = 'P0001';
  end if;

  -- un'operazione alla volta sui soci coinvolti
  perform 1 from public.soci where id = any(p_soci) order by id for update;

  if not p_forza then
    select jsonb_agg(distinct s.nome) into doppi
    from public.movimenti m join public.soci s on s.id = m.socio_id
    where m.socio_id = any(p_soci) and m.tipo in ('accredito','addebito')
      and lower(m.causale) = lower(v_causale);
    if doppi is not null then
      return jsonb_build_object('ok', false, 'doppi', doppi);
    end if;
  end if;

  if p_importo < 0 then
    for r in
      select s.nome, coalesce(sa.credito, 0) as credito from public.soci s
      left join public.saldi_soci sa on sa.socio_id = s.id where s.id = any(p_soci)
    loop
      if r.credito + p_importo < 0 then
        raise exception 'Credito di % insufficiente: ha % €.', r.nome, replace(r.credito::text, '.', ',') using errcode = 'P0001';
      end if;
    end loop;
  end if;

  insert into public.movimenti (socio_id, tipo, importo, causale, fatto_da)
  select x, case when p_importo > 0 then 'accredito' else 'addebito' end, p_importo, v_causale, 'admin'
  from unnest(p_soci) x;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'soci', n, 'totale', n * p_importo);
end $$;

-- Storna in tutto o in parte un acquisto: il credito torna al socio, le quote escono dal progetto.
create function public.admin_storna(p_k text, p_movimento bigint, p_quote int, p_causale text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.soci; m public.movimenti; gia int; unit numeric; v_causale text := trim(coalesce(p_causale, ''));
begin
  a := public._admin_da_codice(p_k);
  select * into m from public.movimenti where id = p_movimento;
  if not found or m.tipo <> 'acquisto' then raise exception 'Si possono stornare solo gli acquisti.' using errcode = 'P0001'; end if;
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

-- ============================================================ storico

create function public.admin_storico(p_k text, p_socio uuid default null, p_mese text default null, p_tipo text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._admin_da_codice(p_k);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', m.id, 'data', m.data, 'tipo', m.tipo, 'importo', m.importo, 'quote', m.quote,
        'causale', m.causale, 'messaggio', m.messaggio, 'fattoDa', m.fatto_da, 'rif', m.rif_movimento,
        'socio', jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, '')),
        'progetto', case when p.id is null then null else jsonb_build_object('id', p.id, 'titolo', p.titolo, 'stato', p.stato) end,
        'stornabili', case when m.tipo = 'acquisto'
          then m.quote + coalesce((select sum(x.quote) from public.movimenti x where x.rif_movimento = m.id and x.tipo = 'storno'), 0)
          else 0 end)
      order by m.data desc, m.id desc)
    from (select * from public.movimenti mm
          where (p_socio is null or mm.socio_id = p_socio)
            and (p_tipo is null or p_tipo = '' or mm.tipo = p_tipo)
            and (p_mese is null or p_mese = '' or to_char(mm.data at time zone 'Europe/Rome', 'YYYY-MM') = p_mese)
          order by mm.data desc, mm.id desc limit 300) m
    join public.soci s on s.id = m.socio_id
    left join public.progetti p on p.id = m.progetto_id
  ), '[]'::jsonb);
end $$;

-- ============================================================ soci

create function public.admin_socio_salva(p_k text, p_id uuid, p_nome text, p_data_ingresso date, p_attivo boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.soci; s public.soci; v_nome text := trim(coalesce(p_nome, ''));
begin
  a := public._admin_da_codice(p_k);
  if v_nome = '' then raise exception 'Scrivi il nome.' using errcode = 'P0001'; end if;
  if length(v_nome) > 60 then raise exception 'Il nome può avere al massimo 60 caratteri.' using errcode = 'P0001'; end if;
  if p_id is null then
    insert into public.soci (nome, data_ingresso) values (v_nome, p_data_ingresso) returning * into s;
  else
    if p_id = a.id and not coalesce(p_attivo, true) then
      raise exception 'Non puoi disattivare te stesso.' using errcode = 'P0001';
    end if;
    begin
      update public.soci set nome = v_nome, data_ingresso = p_data_ingresso, attivo = coalesce(p_attivo, attivo)
       where id = p_id returning * into s;
    exception when unique_violation then
      raise exception 'Non si può riattivare: il suo numero di gara ora è di un altro socio.' using errcode = 'P0001';
    end;
    if not found then raise exception 'Socio non trovato.' using errcode = 'P0001'; end if;
  end if;
  return jsonb_build_object('id', s.id, 'nome', s.nome, 'codice', s.codice);
end $$;

create function public.admin_rigenera_codice(p_k text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.soci; v text;
begin
  a := public._admin_da_codice(p_k);
  if p_id = a.id then raise exception 'Il tuo link non si rigenera da qui: perderesti l''accesso admin da questo dispositivo.' using errcode = 'P0001'; end if;
  update public.soci set codice = encode(extensions.gen_random_bytes(9), 'hex') where id = p_id returning codice into v;
  if not found then raise exception 'Socio non trovato.' using errcode = 'P0001'; end if;
  return jsonb_build_object('codice', v);
end $$;

create function public.admin_rimuovi_foto(p_k text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.soci;
begin
  a := public._admin_da_codice(p_k);
  update public.soci set foto_path = null where id = p_id;
  if not found then raise exception 'Socio non trovato.' using errcode = 'P0001'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================ permessi

revoke all on function public._admin_da_codice(text) from public, anon, authenticated;
revoke all on function public.admin_get(text), public.admin_accredita(text, uuid[], numeric, text, boolean),
  public.admin_storna(text, bigint, int, text), public.admin_storico(text, uuid, text, text),
  public.admin_socio_salva(text, uuid, text, date, boolean), public.admin_rigenera_codice(text, uuid),
  public.admin_rimuovi_foto(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_get(text), public.admin_accredita(text, uuid[], numeric, text, boolean),
  public.admin_storna(text, bigint, int, text), public.admin_storico(text, uuid, text, text),
  public.admin_socio_salva(text, uuid, text, date, boolean), public.admin_rigenera_codice(text, uuid),
  public.admin_rimuovi_foto(text, uuid) to anon, authenticated;
