-- Cuori sui progetti (uno per socio, si mette e si toglie) e dati per il grafico dell'andamento.

create table public.cuori (
  progetto_id uuid not null references public.progetti(id),
  socio_id    uuid not null references public.soci(id),
  creato_il   timestamptz not null default now(),
  primary key (progetto_id, socio_id)
);
create index cuori_socio on public.cuori (socio_id);
alter table public.cuori enable row level security;
revoke all on public.cuori from anon, authenticated;

-- il numero di cuori entra nel json del progetto
create or replace function public._progetto_json(p public.progetti) returns jsonb
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
revoke all on function public._progetto_json(public.progetti) from public, anon, authenticated;

-- l'elenco ora sa anche se il socio che guarda ha messo il cuore
drop function public.get_progetti();
create function public.get_progetti(p_k text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with io as (select id from public.soci where p_k is not null and codice = p_k and attivo)
  select jsonb_build_object(
    'progetti', coalesce(jsonb_agg(
        public._progetto_json(p) || jsonb_build_object('mioCuore',
          exists (select 1 from public.cuori c join io on io.id = c.socio_id where c.progetto_id = p.id))
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

create function public.cuore(p_k text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; acceso boolean;
begin
  s := public._socio_da_codice(p_k);
  if not exists (select 1 from public.progetti where id = p_id and stato <> 'eliminato') then
    raise exception 'Progetto non trovato.' using errcode = 'P0001';
  end if;
  delete from public.cuori where progetto_id = p_id and socio_id = s.id;
  acceso := not found;
  if acceso then insert into public.cuori (progetto_id, socio_id) values (p_id, s.id); end if;
  return jsonb_build_object('mioCuore', acceso, 'cuori', (select count(*) from public.cuori where progetto_id = p_id));
end $$;

-- andamento: totali dei progetti alle loro scadenze e raccolto giorno per giorno
create function public.get_andamento() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'oggi', (now() at time zone 'Europe/Rome')::date,
    'progetti', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'titolo', p.titolo, 'scadenza', p.scadenza, 'stato', p.stato,
                                          'totale', (p.quote_totali * p.costo_quota)::numeric(10,2))
                       order by p.scadenza, p.creato_il)
      from public.progetti p where p.stato <> 'eliminato'), '[]'::jsonb),
    'raccolta', coalesce((
      select jsonb_agg(jsonb_build_object('giorno', g.giorno, 'importo', g.importo) order by g.giorno)
      from (select (m.data at time zone 'Europe/Rome')::date as giorno, -sum(m.importo) as importo
            from public.movimenti m join public.progetti p on p.id = m.progetto_id
            where p.stato <> 'eliminato'
            group by 1) g), '[]'::jsonb)
  )
$$;

revoke all on function public.get_progetti(text), public.cuore(text, uuid), public.get_andamento() from public, anon, authenticated;
grant execute on function public.get_progetti(text), public.cuore(text, uuid), public.get_andamento() to anon, authenticated;
