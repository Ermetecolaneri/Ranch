-- Rate visibili / non visibili: quelle non visibili si vedono in grigio chiaro e non si possono pagare.
-- (Il 22/11/2026 il registro movimenti è stato svuotato su richiesta dell'admin, ripartendo da zero.)

alter table public.rate add column if not exists visibile boolean not null default true;

create or replace function public._rata_json(r public.rate) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'titolo', r.titolo, 'importo', r.importo, 'scadenza', r.scadenza, 'visibile', r.visibile,
    'soci', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, ''),
                                          'pagataIl', rs.pagata_il) order by lower(s.nome))
      from public.rate_soci rs join public.soci s on s.id = rs.socio_id where rs.rata_id = r.id), '[]'::jsonb))
$$;

create or replace function public.get_rate_socio(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'titolo', r.titolo, 'importo', r.importo,
                                               'scadenza', r.scadenza, 'visibile', r.visibile, 'pagataIl', rs.pagata_il)
                            order by rs.pagata_il is not null, r.scadenza, r.titolo), '[]'::jsonb)
  from public.rate_soci rs join public.rate r on r.id = rs.rata_id where rs.socio_id = p_id
$$;

create or replace function public.rata_paga(p_k text, p_rata uuid, p_socio uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; r public.rate; rs public.rate_soci; mid bigint;
begin
  s := public._socio_da_codice(p_k);
  if s.id <> p_socio and not s.admin then
    raise exception 'Puoi segnare come pagate solo le tue rate.' using errcode = 'P0001';
  end if;
  select * into r from public.rate where id = p_rata;
  if not found then raise exception 'Rata non trovata.' using errcode = 'P0001'; end if;
  if not r.visibile then raise exception 'Questa rata non è ancora aperta: non si può pagare.' using errcode = 'P0001'; end if;
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

create function public.admin_rata_visibile(p_k text, p_id uuid, p_visibile boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.rate;
begin
  perform public._admin_da_codice(p_k);
  update public.rate set visibile = coalesce(p_visibile, true) where id = p_id returning * into r;
  if not found then raise exception 'Rata non trovata.' using errcode = 'P0001'; end if;
  return public._rata_json(r);
end $$;

revoke all on function public.admin_rata_visibile(text, uuid, boolean) from public;
grant execute on function public.admin_rata_visibile(text, uuid, boolean) to anon, authenticated;
