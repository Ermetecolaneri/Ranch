-- Joint: il credito Ranch diventa versato × fattore.
--   fattore base = 1 + (tuoi Joint / Joint totali)
--   riequilibrio = versato totale / Σ(versato × fattore base)   → la somma torna sempre uguale alla cassa
--   gestibile    = versato × fattore base × riequilibrio
--   credito Ranch = gestibile − già speso in quote
-- Esempio: tu 300 € e 100 Joint, Fabio 300 € e 0 Joint → fattori 2 e 1, riequilibrio 600/900 → gestisci 400 €, Fabio 200 €.

drop function if exists public._crediti_ranch();
create function public._crediti_ranch()
returns table (socio_id uuid, versato numeric, speso numeric, reale numeric, joint int, ranch numeric,
               quota numeric, fattore_base numeric, riequilibrio numeric, fattore numeric, gestibile numeric)
language sql stable security definer set search_path = public as $$
  with b as (
    select s.id,
           coalesce(sum(m.importo) filter (where m.tipo in ('accredito', 'addebito')), 0) as versato,
           coalesce(-sum(m.importo) filter (where m.progetto_id is not null), 0) as speso,
           coalesce(sum(m.importo), 0) as reale
      from public.soci s left join public.movimenti m on m.socio_id = s.id group by s.id),
  w as (select b.*, greatest(coalesce((select sum(j.punti) from public.joint_movimenti j where j.socio_id = b.id), 0), 0)::int as joint from b),
  t as (select sum(versato) as vtot, sum(case when versato > 0 then joint else 0 end) as jtot from w),
  f as (select w.*, case when t.jtot > 0 and w.versato > 0 then w.joint::numeric / t.jtot else 0 end as quota from w, t),
  g as (select f.*, case when f.versato > 0 then 1 + f.quota else 0 end as fbase from f),
  k as (select case when sum(versato * fbase) > 0 then (select vtot from t) / sum(versato * fbase) else 1 end as k from g where versato > 0)
  select g.id, g.versato, g.speso, g.reale, g.joint,
         case when not public._joint_attivo() then g.reale else round(g.versato * g.fbase * k.k - g.speso, 2) end,
         round(g.quota, 4), round(g.fbase, 4), round(k.k, 4), round(g.fbase * k.k, 4),
         case when not public._joint_attivo() then g.versato else round(g.versato * g.fbase * k.k, 2) end
    from g, k
$$;
revoke all on function public._crediti_ranch() from public, anon, authenticated;

create or replace function public.whoami(p_k text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, ''), 'admin', s.admin,
                            'credito', coalesce(c.ranch, 0), 'creditoReale', coalesce(c.reale, 0), 'versato', coalesce(c.versato, 0),
                            'jointAttivo', public._joint_attivo(),
                            'joint', case when public._joint_attivo() then coalesce(c.joint, 0) end,
                            'calcolo', case when public._joint_attivo() then jsonb_build_object(
                               'jointTotali', (select sum(x.joint) from public._crediti_ranch() x where x.versato > 0),
                               'quota', c.quota, 'fattoreBase', c.fattore_base, 'riequilibrio', c.riequilibrio,
                               'fattore', c.fattore, 'gestibile', c.gestibile, 'speso', c.speso) end)
  from public.soci s left join public._crediti_ranch() c on c.socio_id = s.id
  where s.codice = p_k and s.attivo
$$;

create or replace function public.get_joint() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public._joint_attivo() then jsonb_build_object('attivo', false) else
    jsonb_build_object('attivo', true,
      'reward', (select reward from public.joint_config where id = 1),
      'jointTotali', (select sum(x.joint) from public._crediti_ranch() x where x.versato > 0),
      'riequilibrio', (select max(x.riequilibrio) from public._crediti_ranch() x),
      'classifica', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, ''),
                         'numeroGara', s.numero_gara, 'numeroFont', s.numero_font, 'numeroColore', s.numero_colore,
                         'joint', c.joint, 'credito', c.ranch, 'versato', c.versato, 'quota', c.quota,
                         'fattoreBase', c.fattore_base, 'fattore', c.fattore, 'gestibile', c.gestibile, 'speso', c.speso)
                         order by c.joint desc, lower(s.nome))
                       from public.soci s join public._crediti_ranch() c on c.socio_id = s.id where s.attivo), '[]'::jsonb))
  end
$$;

create or replace function public.admin_joint(p_k text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._admin_da_codice(p_k);
  return (select jsonb_build_object('attivo', j.attivo, 'attivatoIl', j.attivato_il, 'reward', j.reward,
    'soci', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, ''),
                        'joint', c.joint, 'versato', c.versato, 'credito', c.ranch, 'reale', c.reale,
                        'fattore', c.fattore, 'gestibile', c.gestibile) order by c.joint desc, lower(s.nome))
                      from public.soci s join public._crediti_ranch() c on c.socio_id = s.id where s.attivo), '[]'::jsonb),
    'storico', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'data', m.creato_il, 'punti', m.punti, 'azione', m.azione,
                          'descrizione', m.descrizione, 'fattoDa', m.fatto_da, 'socio', s.nome) order by m.id desc)
                        from (select * from public.joint_movimenti order by id desc limit 100) m join public.soci s on s.id = m.socio_id), '[]'::jsonb))
    from public.joint_config j where j.id = 1);
end $$;
