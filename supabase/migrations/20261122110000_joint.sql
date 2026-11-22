-- Joint 🌿: punti di attività. Chi ne ha di più gestisce una fetta più grande della cassa.
--  * le azioni sull'app fanno guadagnare Joint (ricompense modificabili dall'admin)
--  * credito Ranch (spendibile sui progetti) = versato totale × (versato + Joint) / Σ(versato + Joint) − già speso
--    La somma dei crediti Ranch resta uguale alla cassa libera; il credito reale in euro non cambia.
--  * interruttore: spento = niente punti, niente redistribuzione, tutto nascosto (i Joint restano congelati)

create table if not exists public.joint_config (
  id          int primary key default 1 check (id = 1),
  attivo      boolean not null default false,
  attivato_il timestamptz,
  reward      jsonb not null default '{"cuore":10,"quote_per_euro":1,"rata_in_tempo":20,"voto_evento":5,"progetto_proposto":15,"profilo_completo":10}'
);
insert into public.joint_config (id) values (1) on conflict do nothing;

create table if not exists public.joint_movimenti (
  id          bigint generated always as identity primary key,
  socio_id    uuid not null references public.soci(id),
  punti       int not null check (punti <> 0),
  azione      text not null,
  rif         text not null default '',
  descrizione text not null default '',
  fatto_da    text not null default 'auto',
  creato_il   timestamptz not null default now()
);
create index if not exists joint_socio_rif on public.joint_movimenti (socio_id, rif);
alter table public.joint_config enable row level security;
alter table public.joint_movimenti enable row level security;
revoke all on public.joint_config, public.joint_movimenti from anon, authenticated;

-- ============================================================ helper

create or replace function public._joint_attivo() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce((select attivo from public.joint_config where id = 1), false) $$;

create or replace function public._joint_reward(p_azione text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select (reward ->> p_azione)::numeric from public.joint_config where id = 1), 0)
$$;

create or replace function public._joint_netto(p_socio uuid, p_rif text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(punti), 0)::int from public.joint_movimenti where socio_id = p_socio and rif = p_rif
$$;

create or replace function public._joint_dai(p_socio uuid, p_azione text, p_rif text, p_punti int, p_descr text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._joint_attivo() or coalesce(p_punti, 0) = 0 or p_socio is null then return; end if;
  insert into public.joint_movimenti (socio_id, punti, azione, rif, descrizione) values (p_socio, p_punti, p_azione, p_rif, p_descr);
end $$;

-- una sola volta per riferimento (es. un cuore per progetto)
create or replace function public._joint_una_volta(p_socio uuid, p_azione text, p_rif text, p_descr text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public._joint_netto(p_socio, p_rif) = 0 then
    perform public._joint_dai(p_socio, p_azione, p_rif, round(public._joint_reward(p_azione))::int, p_descr);
  end if;
end $$;

-- toglie (in tutto o in parte) i punti dati per un riferimento
create or replace function public._joint_togli(p_socio uuid, p_azione text, p_rif text, p_descr text, p_max int default null) returns void
language plpgsql security definer set search_path = public as $$
declare n int := public._joint_netto(p_socio, p_rif);
begin
  if n <= 0 then return; end if;
  if p_max is not null then n := least(n, p_max); end if;
  perform public._joint_dai(p_socio, p_azione, p_rif, -n, p_descr);
end $$;

-- ============================================================ regole automatiche

create or replace function public._jt_cuore() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if tg_op = 'INSERT' then
    select titolo into t from public.progetti where id = new.progetto_id;
    perform public._joint_una_volta(new.socio_id, 'cuore', 'cuore:' || new.progetto_id, 'Cuore su «' || coalesce(t, '?') || '»');
    return new;
  else
    select titolo into t from public.progetti where id = old.progetto_id;
    perform public._joint_togli(old.socio_id, 'cuore', 'cuore:' || old.progetto_id, 'Cuore tolto da «' || coalesce(t, '?') || '»');
    return old;
  end if;
end $$;
drop trigger if exists jt_cuore on public.cuori;
create trigger jt_cuore after insert or delete on public.cuori for each row execute function public._jt_cuore();

create or replace function public._jt_movimento() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text; pts int;
begin
  if new.progetto_id is null then return new; end if;
  select titolo into t from public.progetti where id = new.progetto_id;
  pts := round(abs(new.importo) * public._joint_reward('quote_per_euro'))::int;
  if new.tipo = 'acquisto' then
    perform public._joint_dai(new.socio_id, 'quote', 'quote:' || new.progetto_id, pts, 'Quote di «' || coalesce(t, '?') || '»');
  elsif new.tipo in ('storno', 'rimborso') then
    perform public._joint_togli(new.socio_id, 'quote', 'quote:' || new.progetto_id,
      case when new.tipo = 'storno' then 'Storno quote di «' else 'Partecipazione annullata a «' end || coalesce(t, '?') || '»', pts);
  end if;
  return new;
end $$;
drop trigger if exists jt_movimento on public.movimenti;
create trigger jt_movimento after insert on public.movimenti for each row execute function public._jt_movimento();

create or replace function public._jt_rata() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.rate;
begin
  select * into r from public.rate where id = new.rata_id;
  if new.pagata_il is not null and old.pagata_il is null then
    if (new.pagata_il at time zone 'Europe/Rome')::date <= r.scadenza then
      perform public._joint_una_volta(new.socio_id, 'rata_in_tempo', 'rata:' || r.id, 'Rata «' || r.titolo || '» pagata in tempo');
    end if;
  elsif new.pagata_il is null and old.pagata_il is not null then
    perform public._joint_togli(new.socio_id, 'rata_in_tempo', 'rata:' || r.id, 'Pagamento annullato: «' || r.titolo || '»');
  end if;
  return new;
end $$;
drop trigger if exists jt_rata on public.rate_soci;
create trigger jt_rata after update of pagata_il on public.rate_soci for each row execute function public._jt_rata();

create or replace function public._jt_voto() returns trigger
language plpgsql security definer set search_path = public as $$
declare ev uuid; t text;
begin
  if tg_op = 'INSERT' then
    select d.evento_id, e.titolo into ev, t from public.eventi_date d join public.eventi e on e.id = d.evento_id where d.id = new.data_id;
    perform public._joint_una_volta(new.socio_id, 'voto_evento', 'voto:' || ev, 'Date votate per «' || coalesce(t, '?') || '»');
    return new;
  else
    select d.evento_id, e.titolo into ev, t from public.eventi_date d join public.eventi e on e.id = d.evento_id where d.id = old.data_id;
    if ev is not null and not exists (select 1 from public.eventi_voti v join public.eventi_date d on d.id = v.data_id
                                       where d.evento_id = ev and v.socio_id = old.socio_id) then
      perform public._joint_togli(old.socio_id, 'voto_evento', 'voto:' || ev, 'Voti tolti da «' || coalesce(t, '?') || '»');
    end if;
    return old;
  end if;
end $$;
drop trigger if exists jt_voto on public.eventi_voti;
create trigger jt_voto after insert or delete on public.eventi_voti for each row execute function public._jt_voto();

create or replace function public._jt_progetto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._joint_una_volta(new.creato_da, 'progetto_proposto', 'progetto:' || new.id, 'Progetto proposto: «' || new.titolo || '»');
  return new;
end $$;
drop trigger if exists jt_progetto on public.progetti;
create trigger jt_progetto after insert on public.progetti for each row execute function public._jt_progetto();

create or replace function public._jt_profilo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.foto_path is not null and new.numero_gara is not null and length(trim(coalesce(new.bio, ''))) > 0 then
    perform public._joint_una_volta(new.id, 'profilo_completo', 'profilo', 'Profilo completo (foto, numero e bio)');
  end if;
  return new;
end $$;
drop trigger if exists jt_profilo on public.soci;
create trigger jt_profilo after update of foto_path, numero_gara, bio on public.soci for each row execute function public._jt_profilo();

-- ============================================================ credito Ranch

create or replace function public._crediti_ranch()
returns table (socio_id uuid, versato numeric, speso numeric, reale numeric, joint int, ranch numeric)
language sql stable security definer set search_path = public as $$
  with b as (
    select s.id,
           coalesce(sum(m.importo) filter (where m.tipo in ('accredito', 'addebito')), 0) as versato,
           coalesce(-sum(m.importo) filter (where m.progetto_id is not null), 0) as speso,
           coalesce(sum(m.importo), 0) as reale
      from public.soci s left join public.movimenti m on m.socio_id = s.id group by s.id),
  w as (
    select b.*, greatest(coalesce((select sum(j.punti) from public.joint_movimenti j where j.socio_id = b.id), 0), 0)::int as joint
      from b),
  p as (select w.*, case when w.versato > 0 then w.versato + w.joint else 0 end as peso from w),
  t as (select sum(versato) as vtot, sum(peso) as ptot from p)
  select p.id, p.versato, p.speso, p.reale, p.joint,
         case when not public._joint_attivo() or t.ptot <= 0 then p.reale
              else round(t.vtot * p.peso / t.ptot - p.speso, 2) end
    from p, t
$$;

create or replace function public._socio_json(s public.soci) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', s.id,
    'nome', s.nome,
    'numeroGara', s.numero_gara,
    'numeroFont', s.numero_font,
    'numeroColore', s.numero_colore,
    'bio', s.bio,
    'dataIngresso', s.data_ingresso,
    'foto', coalesce(s.foto_path, ''),
    'credito', coalesce(c.ranch, 0),
    'creditoReale', coalesce(c.reale, 0),
    'versato', coalesce(c.versato, 0),
    'joint', case when public._joint_attivo() then coalesce(c.joint, 0) end,
    'investito', coalesce(sa.investito, 0)
  )
  from (select 1) x
  left join public.saldi_soci sa on sa.socio_id = s.id
  left join public._crediti_ranch() c on c.socio_id = s.id
$$;

create or replace function public.get_soci() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'soci', coalesce(jsonb_agg(public._socio_json(s) order by lower(s.nome)), '[]'::jsonb),
    'totali', jsonb_build_object(
      'soci', count(*),
      'credito', coalesce((select sum(sa.credito) from public.saldi_soci sa join public.soci x on x.id = sa.socio_id where x.attivo), 0)
    ),
    'jointAttivo', public._joint_attivo()
  )
  from public.soci s
  where s.attivo
$$;

create or replace function public.whoami(p_k text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, ''), 'admin', s.admin,
                            'credito', coalesce(c.ranch, 0), 'creditoReale', coalesce(c.reale, 0), 'versato', coalesce(c.versato, 0),
                            'jointAttivo', public._joint_attivo(),
                            'joint', case when public._joint_attivo() then coalesce(c.joint, 0) end)
  from public.soci s left join public._crediti_ranch() c on c.socio_id = s.id
  where s.codice = p_k and s.attivo
$$;

-- l'acquisto usa il credito Ranch quando i Joint sono attivi
create or replace function public.acquista_quote(p_k text, p_id uuid, p_quote int, p_messaggio text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; p public.progetti; venduti int; credito numeric; costo numeric; v_msg text := trim(coalesce(p_messaggio, ''));
begin
  s := public._socio_da_codice(p_k);
  perform 1 from public.soci where id = s.id for update;
  select * into p from public.progetti where id = p_id and stato <> 'eliminato' for update;
  if not found then raise exception 'Progetto non trovato.' using errcode = 'P0001'; end if;
  if p.stato <> 'raccolta' then raise exception 'La raccolta per questo progetto è chiusa.' using errcode = 'P0001'; end if;
  if p.scadenza < (now() at time zone 'Europe/Rome')::date then
    raise exception 'Il progetto è scaduto.' using errcode = 'P0001';
  end if;
  if p_quote is null or p_quote < 1 then raise exception 'Scegli almeno una quota.' using errcode = 'P0001'; end if;
  if length(v_msg) > 200 then raise exception 'Il messaggio può avere al massimo 200 caratteri.' using errcode = 'P0001'; end if;
  select coalesce(sum(quote), 0) into venduti from public.movimenti where progetto_id = p.id;
  if p_quote > p.quote_totali - venduti then
    raise exception 'Restano solo % quote.', p.quote_totali - venduti using errcode = 'P0001';
  end if;
  costo := p_quote * p.costo_quota;
  select c.ranch into credito from public._crediti_ranch() c where c.socio_id = s.id;
  credito := coalesce(credito, 0);
  if costo > credito then
    raise exception 'Credito insufficiente: hai % €, servono % €.', replace(credito::text, '.', ','), replace(costo::text, '.', ',') using errcode = 'P0001';
  end if;
  insert into public.movimenti (socio_id, tipo, importo, progetto_id, quote, causale, messaggio, fatto_da)
  values (s.id, 'acquisto', -costo, p.id, p_quote, p_quote || case when p_quote = 1 then ' quota' else ' quote' end, v_msg, 'socio');
  return jsonb_build_object('progetto', public._progetto_json(p), 'credito', credito - costo);
end $$;

-- ============================================================ lettura pubblica e admin

create or replace function public.get_joint() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public._joint_attivo() then jsonb_build_object('attivo', false) else
    jsonb_build_object('attivo', true,
      'classifica', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, ''),
                         'numeroGara', s.numero_gara, 'numeroFont', s.numero_font, 'numeroColore', s.numero_colore,
                         'joint', c.joint, 'credito', c.ranch, 'versato', c.versato) order by c.joint desc, lower(s.nome))
                       from public.soci s join public._crediti_ranch() c on c.socio_id = s.id where s.attivo), '[]'::jsonb))
  end
$$;

create or replace function public.admin_joint(p_k text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._admin_da_codice(p_k);
  return (select jsonb_build_object('attivo', j.attivo, 'attivatoIl', j.attivato_il, 'reward', j.reward,
    'soci', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, ''),
                        'joint', c.joint, 'versato', c.versato, 'credito', c.ranch, 'reale', c.reale) order by c.joint desc, lower(s.nome))
                      from public.soci s join public._crediti_ranch() c on c.socio_id = s.id where s.attivo), '[]'::jsonb),
    'storico', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'data', m.creato_il, 'punti', m.punti, 'azione', m.azione,
                          'descrizione', m.descrizione, 'fattoDa', m.fatto_da, 'socio', s.nome) order by m.id desc)
                        from (select * from public.joint_movimenti order by id desc limit 100) m join public.soci s on s.id = m.socio_id), '[]'::jsonb))
    from public.joint_config j where j.id = 1);
end $$;

create or replace function public.admin_joint_config(p_k text, p_attivo boolean, p_reward jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text; chiavi text[] := array['cuore','quote_per_euro','rata_in_tempo','voto_evento','progetto_proposto','profilo_completo'];
        r jsonb := '{}'::jsonb; v numeric;
begin
  perform public._admin_da_codice(p_k);
  foreach k in array chiavi loop
    begin v := (p_reward ->> k)::numeric; exception when others then v := null; end;
    if v is null or v < 0 or v > 1000 then raise exception 'Valore non valido per "%": da 0 a 1000.', k using errcode = 'P0001'; end if;
    r := r || jsonb_build_object(k, v);
  end loop;
  update public.joint_config
     set attivo = coalesce(p_attivo, attivo), reward = r,
         attivato_il = case when coalesce(p_attivo, attivo) and not attivo then now() else attivato_il end
   where id = 1;
  return public.admin_joint(p_k);
end $$;

create or replace function public.admin_joint_dai(p_k text, p_socio uuid, p_punti int, p_causale text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := trim(coalesce(p_causale, ''));
begin
  perform public._admin_da_codice(p_k);
  if not public._joint_attivo() then raise exception 'Accendi prima i Joint.' using errcode = 'P0001'; end if;
  if p_punti is null or p_punti = 0 or abs(p_punti) > 100000 then raise exception 'Punti non validi.' using errcode = 'P0001'; end if;
  if v = '' then raise exception 'Scrivi una causale.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.soci where id = p_socio) then raise exception 'Socio non trovato.' using errcode = 'P0001'; end if;
  insert into public.joint_movimenti (socio_id, punti, azione, rif, descrizione, fatto_da)
  values (p_socio, p_punti, 'admin', 'admin', left(v, 120), 'admin');
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================ permessi

revoke all on function public._joint_attivo(), public._joint_reward(text), public._joint_netto(uuid, text),
  public._joint_dai(uuid, text, text, int, text), public._joint_una_volta(uuid, text, text, text),
  public._joint_togli(uuid, text, text, text, int), public._jt_cuore(), public._jt_movimento(), public._jt_rata(),
  public._jt_voto(), public._jt_progetto(), public._jt_profilo(), public._crediti_ranch() from public, anon, authenticated;
revoke all on function public.get_joint(), public.admin_joint(text), public.admin_joint_config(text, boolean, jsonb),
  public.admin_joint_dai(text, uuid, int, text) from public;
grant execute on function public.get_joint(), public.admin_joint(text), public.admin_joint_config(text, boolean, jsonb),
  public.admin_joint_dai(text, uuid, int, text) to anon, authenticated;

-- le ricompense sono pubbliche (servono per mostrarle accanto alle azioni)
create or replace function public.get_joint() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public._joint_attivo() then jsonb_build_object('attivo', false) else
    jsonb_build_object('attivo', true,
      'reward', (select reward from public.joint_config where id = 1),
      'classifica', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'foto', coalesce(s.foto_path, ''),
                         'numeroGara', s.numero_gara, 'numeroFont', s.numero_font, 'numeroColore', s.numero_colore,
                         'joint', c.joint, 'credito', c.ranch, 'versato', c.versato) order by c.joint desc, lower(s.nome))
                       from public.soci s join public._crediti_ranch() c on c.socio_id = s.id where s.attivo), '[]'::jsonb))
  end
$$;
