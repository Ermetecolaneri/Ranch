-- App del Ranch: schema di base (soci, progetti, registro movimenti) e funzioni della sezione Soci.
-- Niente login: il browser usa solo la chiave pubblica (ruolo anon) e può soltanto chiamare le funzioni qui sotto.
-- Le tabelle non sono leggibili né scrivibili direttamente dal browser.

create extension if not exists pgcrypto with schema extensions;

-- ============================================================ tabelle

create table public.soci (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(trim(nome)) > 0),
  foto_path     text,
  numero_gara   int  check (numero_gara between 1 and 999),
  bio           text not null default '' check (length(bio) <= 200),
  data_ingresso date,
  codice        text not null unique default encode(extensions.gen_random_bytes(9), 'hex'),
  attivo        boolean not null default true,
  creato_il     timestamptz not null default now()
);
comment on column public.soci.codice is 'Codice segreto del link personale (?k=). Mai esposto dalle funzioni pubbliche.';

-- un numero di gara non può essere di due soci attivi
create unique index soci_numero_gara_attivi on public.soci (numero_gara)
  where attivo and numero_gara is not null;

create table public.progetti (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null check (length(trim(nome)) > 0),
  foto_path    text,
  descrizione  text not null default '',
  budget       numeric(10,2) not null check (budget > 0),
  prezzo_quota numeric(10,2) not null check (prezzo_quota > 0),
  stato        text not null default 'aperto' check (stato in ('aperto','finanziato','chiuso','annullato')),
  creato_il    timestamptz not null default now()
);

create table public.movimenti (
  id            bigint generated always as identity primary key,
  data          timestamptz not null default now(),
  socio_id      uuid not null references public.soci(id),
  tipo          text not null check (tipo in ('accredito','addebito','acquisto','storno','rimborso')),
  importo       numeric(10,2) not null,
  progetto_id   uuid references public.progetti(id),
  quote         int  not null default 0,
  causale       text not null default '',
  messaggio     text not null default '' check (length(messaggio) <= 200),
  fatto_da      text not null default 'admin',
  rif_movimento bigint references public.movimenti(id),
  -- il segno dell'importo dipende dal tipo
  constraint movimenti_segno check (
    (tipo in ('accredito','storno','rimborso') and importo > 0) or
    (tipo in ('addebito','acquisto') and importo < 0)
  ),
  -- acquisti, storni e rimborsi riguardano sempre un progetto; accrediti e addebiti mai
  constraint movimenti_progetto check (
    (tipo in ('acquisto','storno','rimborso')) = (progetto_id is not null)
  )
);
create index movimenti_socio on public.movimenti (socio_id, data desc);
create index movimenti_progetto on public.movimenti (progetto_id);
create index movimenti_rif on public.movimenti (rif_movimento);

-- il registro si può solo allungare: niente modifiche, niente cancellazioni
create function public.movimenti_immutabili() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Il registro movimenti non si modifica: aggiungi un movimento di correzione.';
end $$;

create trigger movimenti_no_update_delete
  before update or delete on public.movimenti
  for each row execute function public.movimenti_immutabili();

-- ============================================================ sicurezza

alter table public.soci      enable row level security;
alter table public.progetti  enable row level security;
alter table public.movimenti enable row level security;
-- nessuna policy per anon/authenticated: accesso alle tabelle negato, si passa solo dalle funzioni
revoke all on public.soci, public.progetti, public.movimenti from anon, authenticated;

-- ============================================================ funzioni interne

-- credito e investito per socio
create view public.saldi_soci with (security_invoker = true) as
select s.id as socio_id,
       coalesce(sum(m.importo), 0)::numeric(10,2) as credito,
       coalesce(-sum(m.importo) filter (where m.progetto_id is not null), 0)::numeric(10,2) as investito
from public.soci s
left join public.movimenti m on m.socio_id = s.id
group by s.id;
revoke all on public.saldi_soci from anon, authenticated;

create function public._socio_json(s public.soci) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', s.id,
    'nome', s.nome,
    'numeroGara', s.numero_gara,
    'bio', s.bio,
    'dataIngresso', s.data_ingresso,
    'foto', coalesce(s.foto_path, ''),
    'credito', coalesce(sa.credito, 0),
    'investito', coalesce(sa.investito, 0)
  )
  from (select 1) x
  left join public.saldi_soci sa on sa.socio_id = s.id
$$;

-- ============================================================ funzioni pubbliche (sezione Soci)

-- elenco soci attivi in ordine alfabetico + totali
create function public.get_soci() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'soci', coalesce(jsonb_agg(public._socio_json(s) order by lower(s.nome)), '[]'::jsonb),
    'totali', jsonb_build_object(
      'soci', count(*),
      'credito', coalesce((select sum(sa.credito) from public.saldi_soci sa
                           join public.soci x on x.id = sa.socio_id where x.attivo), 0)
    )
  )
  from public.soci s
  where s.attivo
$$;

-- scheda di un socio: dati, progetti finanziati, ultimi 10 movimenti
create function public.get_socio(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.soci;
begin
  select * into s from public.soci where id = p_id and attivo;
  if not found then raise exception 'Socio non trovato.' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'socio', public._socio_json(s),
    'progetti', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'quote', t.quote, 'importo', t.importo) order by p.nome)
      from (select progetto_id, sum(quote) as quote, -sum(importo) as importo
            from public.movimenti where socio_id = s.id and progetto_id is not null
            group by progetto_id having sum(quote) > 0) t
      join public.progetti p on p.id = t.progetto_id
    ), '[]'::jsonb),
    'movimenti', coalesce((
      select jsonb_agg(jsonb_build_object('data', m.data, 'tipo', m.tipo, 'importo', m.importo,
                                          'causale', m.causale, 'progetto', coalesce(p.nome, '')) order by m.data desc, m.id desc)
      from (select * from public.movimenti where socio_id = s.id order by data desc, id desc limit 10) m
      left join public.progetti p on p.id = m.progetto_id
    ), '[]'::jsonb)
  );
end $$;

-- chi sono, dato il codice del link personale
create function public.whoami(p_k text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'nome', nome, 'foto', coalesce(foto_path, ''))
  from public.soci where codice = p_k and attivo
$$;

-- il socio modifica numero di gara e bio
create function public.aggiorna_profilo(p_k text, p_numero_gara int, p_bio text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; altro text; v_bio text := trim(coalesce(p_bio, ''));
begin
  select * into s from public.soci where codice = p_k and attivo for update;
  if not found then raise exception 'Link personale non valido.' using errcode = 'P0001'; end if;
  if length(v_bio) > 200 then raise exception 'La bio può avere al massimo 200 caratteri.' using errcode = 'P0001'; end if;
  if p_numero_gara is not null and (p_numero_gara < 1 or p_numero_gara > 999) then
    raise exception 'Il numero di gara va da 1 a 999.' using errcode = 'P0001';
  end if;
  if p_numero_gara is not null then
    select nome into altro from public.soci where attivo and numero_gara = p_numero_gara and id <> s.id;
    if found then raise exception 'Il numero % è già di %.', p_numero_gara, altro using errcode = 'P0001'; end if;
  end if;
  update public.soci set numero_gara = p_numero_gara, bio = v_bio where id = s.id returning * into s;
  return public._socio_json(s);
end $$;

-- funzioni interne: nessun accesso dal browser
revoke all on function public._socio_json(public.soci), public.movimenti_immutabili() from public, anon, authenticated;

-- funzioni pubbliche: solo queste sono chiamabili con la chiave pubblica
revoke all on function public.get_soci(), public.get_socio(uuid), public.whoami(text),
  public.aggiorna_profilo(text, int, text) from public, anon, authenticated;
grant execute on function public.get_soci(), public.get_socio(uuid), public.whoami(text),
  public.aggiorna_profilo(text, int, text) to anon, authenticated;

-- ============================================================ foto profilo

-- bucket pubblico in lettura; il caricamento passa dalla edge function carica-foto
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatar', 'avatar', true, 1048576, array['image/jpeg'])
on conflict (id) do nothing;
