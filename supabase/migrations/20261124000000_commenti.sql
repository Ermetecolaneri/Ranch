-- Commenti ai progetti, con reazioni: 👍 pollice, 🖕 dito medio, DUCE.

create table if not exists public.progetto_commenti (
  id          bigint generated always as identity primary key,
  progetto_id uuid not null references public.progetti(id) on delete cascade,
  socio_id    uuid not null references public.soci(id),
  testo       text not null check (length(trim(testo)) between 1 and 500),
  creato_il   timestamptz not null default now(),
  eliminato   boolean not null default false
);
create index if not exists commenti_progetto on public.progetto_commenti (progetto_id, creato_il desc) where not eliminato;

create table if not exists public.commenti_reazioni (
  commento_id bigint not null references public.progetto_commenti(id) on delete cascade,
  socio_id    uuid not null references public.soci(id),
  tipo        text not null check (tipo in ('su', 'dito', 'duce')),
  creato_il   timestamptz not null default now(),
  primary key (commento_id, socio_id, tipo)
);
alter table public.progetto_commenti enable row level security;
alter table public.commenti_reazioni enable row level security;
revoke all on public.progetto_commenti, public.commenti_reazioni from anon, authenticated;

create or replace function public._commento_json(c public.progetto_commenti, p_io uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'testo', c.testo, 'data', c.creato_il,
    'autore', jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, '')),
    'reazioni', jsonb_build_object(
      'su',   (select count(*) from public.commenti_reazioni r where r.commento_id = c.id and r.tipo = 'su'),
      'dito', (select count(*) from public.commenti_reazioni r where r.commento_id = c.id and r.tipo = 'dito'),
      'duce', (select count(*) from public.commenti_reazioni r where r.commento_id = c.id and r.tipo = 'duce')),
    'mie', coalesce((select jsonb_agg(r.tipo) from public.commenti_reazioni r where r.commento_id = c.id and r.socio_id = p_io), '[]'::jsonb))
  from public.soci s where s.id = c.socio_id
$$;

create or replace function public.get_commenti(p_id uuid, p_k text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with io as (select id from public.soci where p_k is not null and codice = p_k and attivo)
  select coalesce(jsonb_agg(public._commento_json(c, (select id from io)) order by c.creato_il desc), '[]'::jsonb)
  from public.progetto_commenti c where c.progetto_id = p_id and not c.eliminato
$$;

create or replace function public.commenta(p_k text, p_id uuid, p_testo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; v text := trim(coalesce(p_testo, '')); c public.progetto_commenti;
begin
  s := public._socio_da_codice(p_k);
  if v = '' then raise exception 'Scrivi il commento.' using errcode = 'P0001'; end if;
  if length(v) > 500 then raise exception 'Il commento può avere al massimo 500 caratteri.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.progetti where id = p_id and stato <> 'eliminato') then
    raise exception 'Progetto non trovato.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.progetto_commenti where socio_id = s.id and creato_il > now() - interval '5 seconds') then
    raise exception 'Aspetta un attimo prima del prossimo commento.' using errcode = 'P0001';
  end if;
  insert into public.progetto_commenti (progetto_id, socio_id, testo) values (p_id, s.id, v) returning * into c;
  return public._commento_json(c, s.id);
end $$;

-- mette o toglie una reazione
create or replace function public.reagisci(p_k text, p_commento bigint, p_tipo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; c public.progetto_commenti;
begin
  s := public._socio_da_codice(p_k);
  if p_tipo not in ('su', 'dito', 'duce') then raise exception 'Reazione non valida.' using errcode = 'P0001'; end if;
  select * into c from public.progetto_commenti where id = p_commento and not eliminato;
  if not found then raise exception 'Commento non trovato.' using errcode = 'P0001'; end if;
  delete from public.commenti_reazioni where commento_id = c.id and socio_id = s.id and tipo = p_tipo;
  if not found then
    insert into public.commenti_reazioni (commento_id, socio_id, tipo) values (c.id, s.id, p_tipo);
  end if;
  return public._commento_json(c, s.id);
end $$;

create or replace function public.elimina_commento(p_k text, p_commento bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; c public.progetto_commenti;
begin
  s := public._socio_da_codice(p_k);
  select * into c from public.progetto_commenti where id = p_commento and not eliminato;
  if not found then raise exception 'Commento non trovato.' using errcode = 'P0001'; end if;
  if c.socio_id <> s.id and not s.admin then raise exception 'Puoi eliminare solo i tuoi commenti.' using errcode = 'P0001'; end if;
  update public.progetto_commenti set eliminato = true where id = c.id;
  return jsonb_build_object('ok', true);
end $$;

-- elenco progetti: numero di commenti e gli ultimi 5 per il carosello
create or replace function public.get_progetti(p_k text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with io as (select id from public.soci where p_k is not null and codice = p_k and attivo)
  select jsonb_build_object(
    'progetti', coalesce(jsonb_agg(
        public._progetto_json(p) || jsonb_build_object(
          'mioCuore', exists (select 1 from public.cuori c join io on io.id = c.socio_id where c.progetto_id = p.id),
          'commenti', (select count(*) from public.progetto_commenti k where k.progetto_id = p.id and not k.eliminato),
          'anteprimaCommenti', coalesce((
             select jsonb_agg(jsonb_build_object('testo', x.testo, 'nome', x.nome, 'foto', x.foto) order by x.creato_il desc)
             from (select k.testo, k.creato_il, s.nome, coalesce(s.foto_path, '') as foto
                     from public.progetto_commenti k join public.soci s on s.id = k.socio_id
                    where k.progetto_id = p.id and not k.eliminato order by k.creato_il desc limit 5) x), '[]'::jsonb))
        order by case p.stato when 'raccolta' then 0 when 'sviluppo' then 1 else 2 end, p.scadenza, p.creato_il desc), '[]'::jsonb),
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

revoke all on function public._commento_json(public.progetto_commenti, uuid) from public, anon, authenticated;
revoke all on function public.get_commenti(uuid, text), public.commenta(text, uuid, text), public.reagisci(text, bigint, text),
  public.elimina_commento(text, bigint) from public;
grant execute on function public.get_commenti(uuid, text), public.commenta(text, uuid, text), public.reagisci(text, bigint, text),
  public.elimina_commento(text, bigint) to anon, authenticated;
