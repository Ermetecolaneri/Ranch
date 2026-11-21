-- Stile del numero di gara scelto dal socio: font (3) e colore (12).

alter table public.soci
  add column numero_font   text not null default 'corsa'
    check (numero_font in ('corsa','squadrato','stencil')),
  add column numero_colore text not null default 'rosso'
    check (numero_colore in ('rosso','arancione','giallo','oro','verde','acqua',
                             'azzurro','blu','viola','rosa','nero','bianco'));

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
    'credito', coalesce(sa.credito, 0),
    'investito', coalesce(sa.investito, 0)
  )
  from (select 1) x
  left join public.saldi_soci sa on sa.socio_id = s.id
$$;
revoke all on function public._socio_json(public.soci) from public, anon, authenticated;

drop function public.aggiorna_profilo(text, int, text);

create function public.aggiorna_profilo(p_k text, p_numero_gara int, p_bio text,
                                        p_numero_font text default 'corsa',
                                        p_numero_colore text default 'rosso') returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.soci; altro text; v_bio text := trim(coalesce(p_bio, ''));
begin
  select * into s from public.soci where codice = p_k and attivo for update;
  if not found then raise exception 'Link personale non valido.' using errcode = 'P0001'; end if;
  if length(v_bio) > 200 then raise exception 'La bio può avere al massimo 200 caratteri.' using errcode = 'P0001'; end if;
  if p_numero_gara is not null and (p_numero_gara < 1 or p_numero_gara > 999) then
    raise exception 'Il numero di gara va da 1 a 999.' using errcode = 'P0001';
  end if;
  if p_numero_font not in ('corsa','squadrato','stencil') then
    raise exception 'Stile del numero non valido.' using errcode = 'P0001';
  end if;
  if p_numero_colore not in ('rosso','arancione','giallo','oro','verde','acqua','azzurro','blu','viola','rosa','nero','bianco') then
    raise exception 'Colore del numero non valido.' using errcode = 'P0001';
  end if;
  if p_numero_gara is not null then
    select nome into altro from public.soci where attivo and numero_gara = p_numero_gara and id <> s.id;
    if found then raise exception 'Il numero % è già di %.', p_numero_gara, altro using errcode = 'P0001'; end if;
  end if;
  update public.soci
     set numero_gara = p_numero_gara, bio = v_bio, numero_font = p_numero_font, numero_colore = p_numero_colore
   where id = s.id returning * into s;
  return public._socio_json(s);
end $$;

revoke all on function public.aggiorna_profilo(text, int, text, text, text) from public, anon, authenticated;
grant execute on function public.aggiorna_profilo(text, int, text, text, text) to anon, authenticated;
