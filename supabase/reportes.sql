create or replace function public.reporte_ventas(p_desde date, p_hasta date)
returns table (dia date, compras int, entradas int, facturacion numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.rol_actual() is distinct from 'admin' then
    raise exception 'Solo el admin puede ver los reportes';
  end if;

  return query
    with ventas as (
      select (c.fecha at time zone 'America/Argentina/Buenos_Aires')::date as dia,
             c.total,
             (select count(*) from entradas e where e.compra_id = c.id) as cant_entradas
      from compras c
      where c.cancelada_en is null
        and (c.fecha at time zone 'America/Argentina/Buenos_Aires')::date between p_desde and p_hasta
    )
    select d::date,
           count(v.dia)::int,
           coalesce(sum(v.cant_entradas), 0)::int,
           coalesce(sum(v.total), 0)::numeric
    from generate_series(p_desde, p_hasta, interval '1 day') as d
    left join ventas v on v.dia = d::date
    group by d
    order by d;
end;
$$;

create or replace function public.peliculas_mas_vistas(p_desde date, p_hasta date)
returns table (pelicula text, entradas int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.rol_actual() is distinct from 'admin' then
    raise exception 'Solo el admin puede ver los reportes';
  end if;

  return query
    select p.nombre, count(*)::int
    from entradas e
    join funciones f on f.id = e.funcion_id
    join peliculas p on p.id = f.pelicula_id
    where e.estado <> 'cancelada'
      and (f.fecha_hora_inicio at time zone 'America/Argentina/Buenos_Aires')::date between p_desde and p_hasta
    group by p.nombre
    order by 2 desc, 1
    limit 10;
end;
$$;

create or replace function public.candy_mas_vendido(p_desde date, p_hasta date)
returns table (producto text, unidades int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.rol_actual() is distinct from 'admin' then
    raise exception 'Solo el admin puede ver los reportes';
  end if;

  return query
    with vendidos as (
      select ci.referencia_id as producto_id, ci.cantidad
      from compra_items ci
      join compras c on c.id = ci.compra_id
      where ci.tipo = 'producto'
        and c.cancelada_en is null
        and (c.fecha at time zone 'America/Argentina/Buenos_Aires')::date between p_desde and p_hasta
      union all
      select it.producto_id, ci.cantidad * it.cantidad
      from compra_items ci
      join compras c on c.id = ci.compra_id
      join combo_items it on it.combo_id = ci.referencia_id
      where ci.tipo = 'combo'
        and c.cancelada_en is null
        and (c.fecha at time zone 'America/Argentina/Buenos_Aires')::date between p_desde and p_hasta
    )
    select pr.nombre, sum(v.cantidad)::int
    from vendidos v
    join productos_candy pr on pr.id = v.producto_id
    group by pr.nombre
    order by 2 desc, 1
    limit 10;
end;
$$;

revoke execute on function public.reporte_ventas(date, date) from anon, public;
revoke execute on function public.peliculas_mas_vistas(date, date) from anon, public;
revoke execute on function public.candy_mas_vendido(date, date) from anon, public;
grant execute on function public.reporte_ventas(date, date) to authenticated;
grant execute on function public.peliculas_mas_vistas(date, date) to authenticated;
grant execute on function public.candy_mas_vendido(date, date) to authenticated;

create or replace function public.cambiar_precio_funcion(p_funcion_id uuid, p_precio_base numeric, p_precio_vip numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_funcion funciones%rowtype;
  v_pelicula text;
begin
  if public.rol_actual() is distinct from 'admin' then
    raise exception 'Solo el admin puede cambiar precios';
  end if;
  if p_precio_base <= 0 or p_precio_vip <= 0 then
    raise exception 'Los precios tienen que ser mayores a cero';
  end if;

  select * into v_funcion from funciones where id = p_funcion_id for update;
  if not found then
    raise exception 'La función no existe';
  end if;

  update funciones set precio_base = p_precio_base, precio_vip = p_precio_vip where id = p_funcion_id;

  select nombre into v_pelicula from peliculas where id = v_funcion.pelicula_id;

  insert into logs_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (
    auth.uid(), 'modifico_precio', 'funcion', p_funcion_id::text,
    v_pelicula || ' ' || to_char(v_funcion.fecha_hora_inicio at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI')
      || ': $' || trim_scale(v_funcion.precio_base) || ' → $' || trim_scale(p_precio_base)
      || ' (VIP $' || trim_scale(v_funcion.precio_vip) || ' → $' || trim_scale(p_precio_vip) || ')'
  );
end;
$$;

revoke execute on function public.cambiar_precio_funcion(uuid, numeric, numeric) from anon, public;
grant execute on function public.cambiar_precio_funcion(uuid, numeric, numeric) to authenticated;

create or replace function public.log_pelicula()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into logs_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (
    auth.uid(),
    case when tg_op = 'INSERT' then 'creo_pelicula' else 'edito_pelicula' end,
    'pelicula', new.id::text, new.nombre
  );
  return new;
end;
$$;

drop trigger if exists log_pelicula on public.peliculas;
create trigger log_pelicula
  after insert or update on public.peliculas
  for each row execute function public.log_pelicula();

create or replace function public.log_precio_candy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes numeric;
  v_ahora numeric;
begin
  if tg_table_name = 'productos_candy' then
    v_antes := old.precio;
    v_ahora := new.precio;
  else
    v_antes := old.precio_fijo;
    v_ahora := new.precio_fijo;
  end if;

  if v_antes is distinct from v_ahora then
    insert into logs_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (
      auth.uid(), 'modifico_precio',
      case when tg_table_name = 'productos_candy' then 'producto' else 'combo' end,
      new.id::text, new.nombre || ': $' || trim_scale(v_antes) || ' → $' || trim_scale(v_ahora)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists log_precio_producto on public.productos_candy;
create trigger log_precio_producto
  after update on public.productos_candy
  for each row execute function public.log_precio_candy();

drop trigger if exists log_precio_combo on public.combos;
create trigger log_precio_combo
  after update on public.combos
  for each row execute function public.log_precio_candy();

create or replace function public.log_cupon()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into logs_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (
    auth.uid(),
    case when tg_op = 'INSERT' then 'creo_cupon' else 'modifico_cupon' end,
    'cupon', new.id::text, new.codigo || ' (' || trim_scale(new.porcentaje_descuento) || '%)'
  );
  return new;
end;
$$;

drop trigger if exists log_cupon on public.cupones;
create trigger log_cupon
  after insert or update on public.cupones
  for each row execute function public.log_cupon();
