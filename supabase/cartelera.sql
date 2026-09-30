create or replace function public.resumen_peliculas()
returns table (pelicula_id uuid, entradas_vendidas bigint, promedio numeric, cantidad_resenas bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    (select count(*)
       from entradas e
       join funciones f on f.id = e.funcion_id
      where f.pelicula_id = p.id and e.estado <> 'cancelada'),
    (select round(avg(r.estrellas)::numeric, 1) from resenas r where r.pelicula_id = p.id),
    (select count(*) from resenas r where r.pelicula_id = p.id)
  from peliculas p
  where p.activa;
$$;

grant execute on function public.resumen_peliculas() to anon, authenticated;

create or replace function public.resenas_de_pelicula(p_pelicula_id uuid)
returns table (id uuid, estrellas int, comentario text, fecha timestamptz, autor text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.estrellas, r.comentario, r.fecha,
         pf.nombre || ' ' || left(pf.apellido, 1) || '.'
  from resenas r
  join perfiles pf on pf.id = r.usuario_id
  where r.pelicula_id = p_pelicula_id
  order by r.fecha desc
  limit 50;
$$;

grant execute on function public.resenas_de_pelicula(uuid) to anon, authenticated;
