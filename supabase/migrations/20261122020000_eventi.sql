-- Sezione Eventi: li crea solo l'admin. Un evento è "da programmare" (con date candidate su cui i soci
-- mettono cuori, anche su più date) oppure "programmato" (con data di inizio e fine).

create table public.eventi (
  id           uuid primary key default gen_random_uuid(),
  titolo       text not null check (length(trim(titolo)) between 1 and 80),
  descrizione  text not null default '' check (length(descrizione) <= 1000),
  foto_path    text,
  stato        text not null default 'da_programmare' check (stato in ('da_programmare','programmato')),
  data_inizio  date,
  data_fine    date,
  creato_da    uuid not null references public.soci(id),
  creato_il    timestamptz not null default now(),
  constraint eventi_date_ok check (
    (stato = 'da_programmare') or (data_inizio is not null and data_fine is not null and data_fine >= data_inizio)
  )
);
create index eventi_creato_da on public.eventi (creato_da);

create table public.eventi_date (
  id          uuid primary key default gen_random_uuid(),
  evento_id   uuid not null references public.eventi(id) on delete cascade,
  data_inizio date not null,
  data_fine   date not null,
  constraint eventi_date_ordine check (data_fine >= data_inizio)
);
create index eventi_date_evento on public.eventi_date (evento_id);

create table public.eventi_voti (
  data_id   uuid not null references public.eventi_date(id) on delete cascade,
  socio_id  uuid not null references public.soci(id),
  creato_il timestamptz not null default now(),
  primary key (data_id, socio_id)
);
create index eventi_voti_socio on public.eventi_voti (socio_id);

alter table public.eventi enable row level security;
alter table public.eventi_date enable row level security;
alter table public.eventi_voti enable row level security;
revoke all on public.eventi, public.eventi_date, public.eventi_voti from anon, authenticated;

-- ============================================================ json

create function public._evento_json(e public.eventi, p_socio uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'titolo', e.titolo, 'descrizione', e.descrizione, 'foto', coalesce(e.foto_path, ''),
    'stato', e.stato, 'dataInizio', e.data_inizio, 'dataFine', e.data_fine, 'creatoIl', e.creato_il,
    'concluso', e.stato = 'programmato' and e.data_fine < (now() at time zone 'Europe/Rome')::date,
    'date', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', d.id, 'dataInizio', d.data_inizio, 'dataFine', d.data_fine,
          'voti', (select count(*) from public.eventi_voti v where v.data_id = d.id),
          'mioVoto', p_socio is not null and exists (select 1 from public.eventi_voti v where v.data_id = d.id and v.socio_id = p_socio),
          'votanti', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, '')) order by v.creato_il)
                               from public.eventi_voti v join public.soci s on s.id = v.socio_id where v.data_id = d.id), '[]'::jsonb))
        order by d.data_inizio, d.data_fine)
      from public.eventi_date d where d.evento_id = e.id), '[]'::jsonb)
  )
$$;

create function public._socio_opzionale(p_k text) returns uuid
language sql stable set search_path = public as $$
  select id from public.soci where p_k is not null and codice = p_k and attivo
$$;

-- ============================================================ lettura

create function public.get_eventi(p_k text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public._evento_json(e, public._socio_opzionale(p_k)) order by
      case when e.stato = 'programmato' and e.data_fine >= (now() at time zone 'Europe/Rome')::date then 0
           when e.stato = 'da_programmare' then 1 else 2 end,
      case when e.stato = 'programmato' and e.data_fine < (now() at time zone 'Europe/Rome')::date then null else e.data_inizio end,
      e.data_inizio desc nulls last, e.creato_il desc), '[]'::jsonb)
  from public.eventi e
$$;

create function public.get_evento(p_id uuid, p_k text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e public.eventi;
begin
  select * into e from public.eventi where id = p_id;
  if not found then raise exception 'Evento non trovato.' using errcode = 'P0001'; end if;
  return public._evento_json(e, public._socio_opzionale(p_k));
end $$;

-- ============================================================ voti dei soci

create function public.vota_data(p_k text, p_data uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; st text; acceso boolean;
begin
  s := public._socio_da_codice(p_k);
  select e.stato into st from public.eventi_date d join public.eventi e on e.id = d.evento_id where d.id = p_data;
  if not found then raise exception 'Data non trovata.' using errcode = 'P0001'; end if;
  if st <> 'da_programmare' then raise exception 'L''evento è già programmato: non si vota più.' using errcode = 'P0001'; end if;
  delete from public.eventi_voti where data_id = p_data and socio_id = s.id;
  acceso := not found;
  if acceso then insert into public.eventi_voti (data_id, socio_id) values (p_data, s.id); end if;
  return jsonb_build_object('mioVoto', acceso, 'voti', (select count(*) from public.eventi_voti where data_id = p_data));
end $$;

-- ============================================================ admin

-- Crea (p_id null) o modifica un evento. p_date = [{id?, dataInizio, dataFine?}] sono le date candidate:
-- quelle che mantengono l'id conservano i voti, quelle tolte vengono cancellate con i loro voti.
create function public.admin_evento_salva(p_k text, p_id uuid, p_titolo text, p_descrizione text, p_stato text,
                                          p_inizio date, p_fine date, p_date jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.soci; e public.eventi; x jsonb; ids uuid[] := '{}'; di date; df date; did uuid;
begin
  a := public._admin_da_codice(p_k);
  if length(trim(coalesce(p_titolo, ''))) = 0 then raise exception 'Scrivi un titolo.' using errcode = 'P0001'; end if;
  if length(trim(p_titolo)) > 80 then raise exception 'Il titolo può avere al massimo 80 caratteri.' using errcode = 'P0001'; end if;
  if length(coalesce(p_descrizione, '')) > 1000 then raise exception 'La descrizione può avere al massimo 1000 caratteri.' using errcode = 'P0001'; end if;
  if p_stato not in ('da_programmare','programmato') then raise exception 'Stato non valido.' using errcode = 'P0001'; end if;
  if p_stato = 'programmato' then
    if p_inizio is null then raise exception 'Scegli la data di inizio.' using errcode = 'P0001'; end if;
    if coalesce(p_fine, p_inizio) < p_inizio then raise exception 'La data di fine non può essere prima dell''inizio.' using errcode = 'P0001'; end if;
  end if;
  if jsonb_typeof(coalesce(p_date, '[]'::jsonb)) <> 'array' then raise exception 'Date non valide.' using errcode = 'P0001'; end if;
  if p_stato = 'da_programmare' and jsonb_array_length(coalesce(p_date, '[]'::jsonb)) = 0 then
    raise exception 'Aggiungi almeno una data da proporre.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p_date, '[]'::jsonb)) > 20 then raise exception 'Al massimo 20 date candidate.' using errcode = 'P0001'; end if;

  if p_id is null then
    insert into public.eventi (titolo, descrizione, stato, data_inizio, data_fine, creato_da)
    values (trim(p_titolo), trim(coalesce(p_descrizione, '')), p_stato,
            case when p_stato = 'programmato' then p_inizio end,
            case when p_stato = 'programmato' then coalesce(p_fine, p_inizio) end, a.id)
    returning * into e;
  else
    update public.eventi set titolo = trim(p_titolo), descrizione = trim(coalesce(p_descrizione, '')), stato = p_stato,
           data_inizio = case when p_stato = 'programmato' then p_inizio end,
           data_fine = case when p_stato = 'programmato' then coalesce(p_fine, p_inizio) end
     where id = p_id returning * into e;
    if not found then raise exception 'Evento non trovato.' using errcode = 'P0001'; end if;
  end if;

  -- date candidate
  for x in select * from jsonb_array_elements(coalesce(p_date, '[]'::jsonb)) loop
    begin
      di := (x->>'dataInizio')::date;
      df := coalesce(nullif(x->>'dataFine', '')::date, di);
    exception when others then
      raise exception 'Data candidata non valida.' using errcode = 'P0001';
    end;
    if di is null then raise exception 'Ogni data candidata deve avere un giorno di inizio.' using errcode = 'P0001'; end if;
    if df < di then raise exception 'In una data candidata la fine è prima dell''inizio.' using errcode = 'P0001'; end if;
    did := null;
    if nullif(x->>'id', '') is not null then
      update public.eventi_date set data_inizio = di, data_fine = df
       where id = (x->>'id')::uuid and evento_id = e.id returning id into did;
    end if;
    if did is null then
      insert into public.eventi_date (evento_id, data_inizio, data_fine) values (e.id, di, df) returning id into did;
    end if;
    ids := ids || did;
  end loop;
  delete from public.eventi_date where evento_id = e.id and not (id = any(ids));

  return public._evento_json(e, a.id);
end $$;

-- fissa una delle date candidate: l'evento diventa programmato con quelle date
create function public.admin_evento_fissa(p_k text, p_data uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.soci; d public.eventi_date; e public.eventi;
begin
  a := public._admin_da_codice(p_k);
  select * into d from public.eventi_date where id = p_data;
  if not found then raise exception 'Data non trovata.' using errcode = 'P0001'; end if;
  update public.eventi set stato = 'programmato', data_inizio = d.data_inizio, data_fine = d.data_fine
   where id = d.evento_id returning * into e;
  return public._evento_json(e, a.id);
end $$;

create function public.admin_evento_elimina(p_k text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.soci; f text;
begin
  a := public._admin_da_codice(p_k);
  delete from public.eventi where id = p_id returning foto_path into f;
  if not found then raise exception 'Evento non trovato.' using errcode = 'P0001'; end if;
  return jsonb_build_object('ok', true, 'foto', f);
end $$;

-- ============================================================ permessi

revoke all on function public._evento_json(public.eventi, uuid), public._socio_opzionale(text) from public, anon, authenticated;
revoke all on function public.get_eventi(text), public.get_evento(uuid, text), public.vota_data(text, uuid),
  public.admin_evento_salva(text, uuid, text, text, text, date, date, jsonb),
  public.admin_evento_fissa(text, uuid), public.admin_evento_elimina(text, uuid) from public, anon, authenticated;
grant execute on function public.get_eventi(text), public.get_evento(uuid, text), public.vota_data(text, uuid),
  public.admin_evento_salva(text, uuid, text, text, text, date, date, jsonb),
  public.admin_evento_fissa(text, uuid), public.admin_evento_elimina(text, uuid) to anon, authenticated;

-- foto degli eventi
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('eventi', 'eventi', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;
