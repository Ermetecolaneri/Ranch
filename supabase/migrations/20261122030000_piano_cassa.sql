-- Piano di cassa: rate per socio e uscite della società, modificabili solo dall'admin.
-- Dati iniziali: business case "4 moto in 8" (20/11/2026).

create table public.piano_cassa (
  id          int primary key default 1 check (id = 1),
  titolo      text not null default 'Piano' check (length(titolo) <= 80),
  soci        int not null check (soci between 1 and 100),
  note        text not null default '' check (length(note) <= 500),
  aggiornato_il timestamptz not null default now()
);

create table public.piano_rate (
  id          uuid primary key default gen_random_uuid(),
  mese        date not null,                          -- primo giorno del mese
  voce        text not null check (length(voce) <= 60),
  quota_moto  numeric(10,4) not null default 0 check (quota_moto >= 0),
  quota_cassa numeric(10,4) not null default 0 check (quota_cassa >= 0)
);

create table public.piano_uscite (
  id       uuid primary key default gen_random_uuid(),
  mese     date not null,
  voce     text not null check (length(voce) <= 60),
  importo  numeric(10,2) not null check (importo > 0)
);

alter table public.piano_cassa enable row level security;
alter table public.piano_rate enable row level security;
alter table public.piano_uscite enable row level security;
revoke all on public.piano_cassa, public.piano_rate, public.piano_uscite from anon, authenticated;

insert into public.piano_cassa (titolo, soci, note) values
  ('4 moto in 8', 8, 'Moto da 1.400 €. Ingresso in due metà (nov–dic) che compra la prima coppia a dicembre; rate gen–apr per la seconda coppia ad aprile.');

insert into public.piano_rate (mese, voce, quota_moto, quota_cassa) values
  ('2026-11-01', 'Ingresso (1/2)', 175, 0),
  ('2026-12-01', 'Ingresso (2/2)', 175, 0),
  ('2027-01-01', 'Rata', 87.5, 15.625),
  ('2027-02-01', 'Rata', 87.5, 15.625),
  ('2027-03-01', 'Rata', 87.5, 15.625),
  ('2027-04-01', 'Rata', 87.5, 15.625);

insert into public.piano_uscite (mese, voce, importo) values
  ('2026-12-01', 'Prima coppia di moto (2 × 1.400 €)', 2800),
  ('2027-04-01', 'Seconda coppia di moto (2 × 1.400 €)', 2800);

-- ============================================================ lettura (tutti)

create function public.get_piano() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'titolo', p.titolo, 'soci', p.soci, 'note', p.note, 'aggiornatoIl', p.aggiornato_il,
    'rate', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'mese', r.mese, 'voce', r.voce,
                        'quotaMoto', r.quota_moto, 'quotaCassa', r.quota_cassa) order by r.mese, r.voce)
                      from public.piano_rate r), '[]'::jsonb),
    'uscite', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'mese', u.mese, 'voce', u.voce, 'importo', u.importo)
                        order by u.mese, u.voce) from public.piano_uscite u), '[]'::jsonb)
  )
  from public.piano_cassa p where p.id = 1
$$;

-- ============================================================ modifica (admin)

-- Sostituisce il piano con quello inviato (rate e uscite complete).
create function public.admin_piano_salva(p_k text, p_titolo text, p_soci int, p_note text, p_rate jsonb, p_uscite jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.soci; x jsonb; m date; qm numeric; qc numeric; imp numeric; v text;
begin
  a := public._admin_da_codice(p_k);
  if length(trim(coalesce(p_titolo, ''))) = 0 then raise exception 'Scrivi un titolo per il piano.' using errcode = 'P0001'; end if;
  if p_soci is null or p_soci < 1 or p_soci > 100 then raise exception 'Il numero di soci va da 1 a 100.' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_rate) <> 'array' or jsonb_typeof(p_uscite) <> 'array' then raise exception 'Dati non validi.' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_rate) = 0 then raise exception 'Serve almeno una rata.' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_rate) > 60 or jsonb_array_length(p_uscite) > 60 then raise exception 'Troppe righe.' using errcode = 'P0001'; end if;

  delete from public.piano_rate where true;
  delete from public.piano_uscite where true;

  for x in select * from jsonb_array_elements(p_rate) loop
    begin
      m := date_trunc('month', (x->>'mese')::date)::date;
      qm := coalesce(nullif(x->>'quotaMoto', '')::numeric, 0);
      qc := coalesce(nullif(x->>'quotaCassa', '')::numeric, 0);
    exception when others then raise exception 'Una rata ha valori non validi.' using errcode = 'P0001'; end;
    v := trim(coalesce(x->>'voce', ''));
    if m is null then raise exception 'Ogni rata deve avere un mese.' using errcode = 'P0001'; end if;
    if qm < 0 or qc < 0 or qm + qc = 0 then raise exception 'Ogni rata deve avere un importo maggiore di zero.' using errcode = 'P0001'; end if;
    insert into public.piano_rate (mese, voce, quota_moto, quota_cassa) values (m, coalesce(nullif(v, ''), 'Rata'), qm, qc);
  end loop;

  for x in select * from jsonb_array_elements(p_uscite) loop
    begin
      m := date_trunc('month', (x->>'mese')::date)::date;
      imp := (x->>'importo')::numeric;
    exception when others then raise exception 'Un''uscita ha valori non validi.' using errcode = 'P0001'; end;
    v := trim(coalesce(x->>'voce', ''));
    if m is null or imp is null or imp <= 0 then raise exception 'Ogni uscita deve avere mese e importo maggiore di zero.' using errcode = 'P0001'; end if;
    insert into public.piano_uscite (mese, voce, importo) values (m, coalesce(nullif(v, ''), 'Uscita'), round(imp, 2));
  end loop;

  update public.piano_cassa set titolo = trim(p_titolo), soci = p_soci, note = trim(coalesce(p_note, '')), aggiornato_il = now()
   where id = 1;
  return public.get_piano();
end $$;

revoke all on function public.get_piano(), public.admin_piano_salva(text, text, int, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.get_piano(), public.admin_piano_salva(text, text, int, text, jsonb, jsonb) to anon, authenticated;
