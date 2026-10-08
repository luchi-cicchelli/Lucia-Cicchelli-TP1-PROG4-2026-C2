alter table public.alertas_estreno add column if not exists vista_en_app boolean not null default false;

create or replace function public.mis_avisos_estreno()
returns table (alerta_id uuid, pelicula_id uuid, pelicula text, preventa boolean)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, p.id, p.nombre, p.preventa and now() < public.inicio_estreno(p.fecha_estreno)
  from alertas_estreno a
  join peliculas p on p.id = a.pelicula_id
  where a.usuario_id = auth.uid()
    and not a.vista_en_app
    and p.activa
    and public.apertura_venta(p.id) <= now()
    and exists (select 1 from funciones f where f.pelicula_id = p.id and f.fecha_hora_inicio > now())
  order by p.nombre;
$$;

revoke execute on function public.mis_avisos_estreno() from anon, public;
grant execute on function public.mis_avisos_estreno() to authenticated;

drop function if exists public.guardar_suscripcion(text, text, text);
drop table if exists public.suscripciones_push;
