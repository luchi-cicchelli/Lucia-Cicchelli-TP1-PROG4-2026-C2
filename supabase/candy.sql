alter table public.compras add column if not exists candy_retirado_en timestamptz;
alter table public.compras add column if not exists candy_entregado_por uuid references public.perfiles(id);

alter table public.productos_candy drop constraint if exists productos_precio_positivo;
alter table public.productos_candy add constraint productos_precio_positivo check (precio > 0);

alter table public.combos drop constraint if exists combos_precio_positivo;
alter table public.combos add constraint combos_precio_positivo check (precio_fijo > 0);

alter table public.combo_items drop constraint if exists combo_items_cantidad_positiva;
alter table public.combo_items add constraint combo_items_cantidad_positiva check (cantidad > 0);

alter table public.productos_candy enable row level security;
alter table public.combos enable row level security;
alter table public.combo_items enable row level security;

drop policy if exists "productos: lectura publica" on public.productos_candy;
create policy "productos: lectura publica" on public.productos_candy for select
  using (activo or public.rol_actual() = 'admin');

drop policy if exists "productos: admin escribe" on public.productos_candy;
create policy "productos: admin escribe" on public.productos_candy for all to authenticated
  using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');

drop policy if exists "combos: lectura publica" on public.combos;
create policy "combos: lectura publica" on public.combos for select
  using (activo or public.rol_actual() = 'admin');

drop policy if exists "combos: admin escribe" on public.combos;
create policy "combos: admin escribe" on public.combos for all to authenticated
  using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');

drop policy if exists "combo_items: lectura publica" on public.combo_items;
create policy "combo_items: lectura publica" on public.combo_items for select using (true);

drop policy if exists "combo_items: admin escribe" on public.combo_items;
create policy "combo_items: admin escribe" on public.combo_items for all to authenticated
  using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');

create or replace function public.items_candy(p_compra_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
    'tipo', ci.tipo,
    'nombre', coalesce(pc.nombre, co.nombre),
    'cantidad', ci.cantidad,
    'precio_unitario', ci.precio_unitario,
    'detalle', case when ci.tipo = 'combo' then (
      select '1 entrada + ' || string_agg(cit.cantidad || ' ' || p2.nombre, ' + ' order by p2.nombre)
      from combo_items cit join productos_candy p2 on p2.id = cit.producto_id
      where cit.combo_id = co.id
    ) end
  ) order by ci.tipo desc, coalesce(pc.nombre, co.nombre)), '[]'::json)
  from compra_items ci
  left join productos_candy pc on ci.tipo = 'producto' and pc.id = ci.referencia_id
  left join combos co on ci.tipo = 'combo' and co.id = ci.referencia_id
  where ci.compra_id = p_compra_id;
$$;

drop function if exists public.confirmar_compra(uuid, text, text);
drop function if exists public.confirmar_compra(uuid, text, text, jsonb);

create function public.confirmar_compra(
  p_funcion_id uuid,
  p_sesion text,
  p_metodo_pago text,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_funcion funciones%rowtype;
  v_restriccion int;
  v_usuario uuid := auth.uid();
  v_perfil perfiles%rowtype;
  v_cupon cupones%rowtype;
  v_precio_general numeric(10,2);
  v_cant_butacas int;
  v_cant_combos int := 0;
  v_subtotal numeric(10,2) := 0;
  v_descuento numeric(10,2) := 0;
  v_total numeric(10,2);
  v_puntos int := 0;
  v_compra_id uuid;
  v_codigo text;
  v_reserva record;
  v_item record;
  v_precio numeric(10,2);
  v_i int := 0;
begin
  if p_metodo_pago not in ('tarjeta_credito', 'tarjeta_debito', 'mercado_pago') then
    raise exception 'Método de pago inválido';
  end if;

  select * into v_funcion from funciones where id = p_funcion_id;
  if not found then
    raise exception 'La función no existe';
  end if;
  if v_funcion.fecha_hora_inicio <= now() then
    raise exception 'La función ya empezó';
  end if;

  delete from reservas_temporales where expira_en < now();

  select count(*) into v_cant_butacas
  from reservas_temporales where funcion_id = p_funcion_id and session_id = p_sesion;

  if v_cant_butacas = 0 then
    raise exception 'Tu reserva venció. Volvé a elegir las butacas.';
  end if;

  select restriccion_edad into v_restriccion from peliculas where id = v_funcion.pelicula_id;
  if v_usuario is not null then
    select * into v_perfil from perfiles where id = v_usuario;
    if v_restriccion is not null
       and extract(year from age(current_date, v_perfil.fecha_nacimiento)) < v_restriccion then
      raise exception 'Esta película es para mayores de % años', v_restriccion;
    end if;
  end if;

  v_precio_general := case
    when v_funcion.es_preventa and v_funcion.fecha_fin_preventa > now() then v_funcion.precio_preventa
    else v_funcion.precio_base
  end;

  select coalesce(sum(case when b.tipo = 'vip' then v_funcion.precio_vip else v_precio_general end), 0)
  into v_subtotal
  from reservas_temporales r
  join butacas b on b.id = r.butaca_id
  where r.funcion_id = p_funcion_id and r.session_id = p_sesion;

  for v_item in
    select x.tipo, x.id, x.cantidad
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(tipo text, id uuid, cantidad int)
  loop
    if v_item.cantidad is null or v_item.cantidad < 1 or v_item.cantidad > 20 then
      raise exception 'Cantidad inválida';
    end if;

    if v_item.tipo = 'producto' then
      select precio into v_precio from productos_candy where id = v_item.id and activo;
      if not found then
        raise exception 'Un producto del candy ya no está disponible';
      end if;
      v_subtotal := v_subtotal + v_precio * v_item.cantidad;
    elsif v_item.tipo = 'combo' then
      select precio_fijo into v_precio from combos where id = v_item.id and activo;
      if not found then
        raise exception 'Un combo ya no está disponible';
      end if;
      v_cant_combos := v_cant_combos + v_item.cantidad;
      v_subtotal := v_subtotal + (v_precio - v_precio_general) * v_item.cantidad;
    else
      raise exception 'Tipo de producto inválido';
    end if;
  end loop;

  if v_cant_combos > v_cant_butacas then
    raise exception 'Cada combo incluye una entrada: elegiste % combos y % butacas', v_cant_combos, v_cant_butacas;
  end if;

  if v_usuario is not null and not v_perfil.cupon_bienvenida_usado then
    select * into v_cupon from cupones
    where codigo = 'BIENVENIDA' and activo
      and fecha_inicio <= now() and (fecha_fin is null or fecha_fin > now());
    if found then
      v_descuento := round(v_subtotal * v_cupon.porcentaje_descuento / 100, 2);
    end if;
  end if;

  v_total := v_subtotal - v_descuento;
  if v_usuario is not null then
    v_puntos := floor(v_total);
  end if;

  insert into compras (usuario_id, total, subtotal, descuento, metodo_pago, cupon_id, puntos_ganados, tiene_candy)
  values (v_usuario, v_total, v_subtotal, v_descuento, p_metodo_pago, v_cupon.id, v_puntos,
          jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0)
  returning id into v_compra_id;

  for v_reserva in
    select r.butaca_id, b.tipo
    from reservas_temporales r join butacas b on b.id = r.butaca_id
    where r.funcion_id = p_funcion_id and r.session_id = p_sesion
    order by (b.tipo = 'vip'), b.fila, b.numero
  loop
    v_i := v_i + 1;
    v_precio := case when v_reserva.tipo = 'vip' then v_funcion.precio_vip else v_precio_general end;
    if v_i <= v_cant_combos then
      v_precio := v_precio - v_precio_general;
    end if;

    loop
      v_codigo := upper(substr(md5(random()::text), 1, 8));
      exit when not exists (select 1 from entradas where codigo_manual = v_codigo);
    end loop;

    insert into entradas (compra_id, funcion_id, butaca_id, precio_pagado, qr_codigo, codigo_manual)
    values (v_compra_id, p_funcion_id, v_reserva.butaca_id, v_precio, gen_random_uuid()::text, v_codigo);
  end loop;

  insert into compra_items (compra_id, tipo, referencia_id, cantidad, precio_unitario)
  select v_compra_id, x.tipo::tipo_item_compra, x.id, x.cantidad,
         case when x.tipo = 'producto'
              then (select precio from productos_candy where id = x.id)
              else (select precio_fijo from combos where id = x.id) end
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(tipo text, id uuid, cantidad int);

  delete from reservas_temporales where funcion_id = p_funcion_id and session_id = p_sesion;

  if v_usuario is not null then
    update perfiles
    set puntos_acumulados = puntos_acumulados + v_puntos,
        cupon_bienvenida_usado = cupon_bienvenida_usado or v_descuento > 0
    where id = v_usuario;

    if v_puntos > 0 then
      insert into puntos_historial (usuario_id, tipo, cantidad, compra_id)
      values (v_usuario, 'ganado', v_puntos, v_compra_id);
    end if;
  end if;

  return v_compra_id;
end;
$$;

grant execute on function public.confirmar_compra(uuid, text, text, jsonb) to anon, authenticated;

create or replace function public.detalle_compra(p_compra_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'id', c.id,
    'fecha', c.fecha,
    'subtotal', coalesce(c.subtotal, c.total),
    'descuento', c.descuento,
    'total', c.total,
    'metodo_pago', c.metodo_pago,
    'puntos_ganados', c.puntos_ganados,
    'candy', public.items_candy(c.id),
    'candy_retirado', c.candy_retirado,
    'pelicula', json_build_object('nombre', p.nombre, 'restriccion_edad', p.restriccion_edad, 'imagen_url', p.imagen_url),
    'funcion', json_build_object('inicio', f.fecha_hora_inicio, 'fin', f.fecha_hora_fin,
                                 'formato', f.formato, 'idioma', f.idioma, 'sala', s.nombre),
    'entradas', (
      select json_agg(json_build_object(
        'id', e.id, 'fila', b.fila, 'numero', b.numero, 'tipo', b.tipo,
        'precio_pagado', e.precio_pagado, 'qr_codigo', e.qr_codigo,
        'codigo_manual', e.codigo_manual, 'estado', e.estado
      ) order by b.fila, b.numero)
      from entradas e join butacas b on b.id = e.butaca_id
      where e.compra_id = c.id
    )
  )
  from compras c
  join entradas e0 on e0.compra_id = c.id
  join funciones f on f.id = e0.funcion_id
  join peliculas p on p.id = f.pelicula_id
  join salas s on s.id = f.sala_id
  where c.id = p_compra_id
  limit 1;
$$;

create or replace function public.validar_candy(p_codigo text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := trim(p_codigo);
  v_entrada entradas%rowtype;
  v_compra compras%rowtype;
  v_funcion funciones%rowtype;
  v_pelicula text;
  v_sala text;
  v_zona text := 'America/Argentina/Buenos_Aires';
begin
  if public.rol_actual() is null or public.rol_actual() not in ('empleado', 'admin') then
    raise exception 'Solo el personal del cine puede entregar el candy';
  end if;

  select * into v_entrada from entradas
  where qr_codigo = v_codigo or codigo_manual = upper(v_codigo);
  if not found then
    raise exception 'El código no corresponde a ninguna entrada';
  end if;

  select * into v_compra from compras where id = v_entrada.compra_id for update;

  if not v_compra.tiene_candy then
    raise exception 'Esta compra no incluye candy';
  end if;

  if v_compra.candy_retirado then
    raise exception 'El candy de esta compra ya se entregó el % a las % hs',
      to_char(v_compra.candy_retirado_en at time zone v_zona, 'DD/MM'),
      to_char(v_compra.candy_retirado_en at time zone v_zona, 'HH24:MI');
  end if;

  if v_entrada.estado = 'cancelada' then
    raise exception 'Esta compra fue cancelada';
  end if;

  select * into v_funcion from funciones where id = v_entrada.funcion_id;
  select nombre into v_pelicula from peliculas where id = v_funcion.pelicula_id;
  select nombre into v_sala from salas where id = v_funcion.sala_id;

  if v_funcion.fecha_hora_fin < now() then
    raise exception 'La función ya terminó';
  end if;
  if v_funcion.fecha_hora_inicio > now() + interval '3 hours' then
    raise exception 'Todavía no se puede retirar: la función es el % a las % hs',
      to_char(v_funcion.fecha_hora_inicio at time zone v_zona, 'DD/MM'),
      to_char(v_funcion.fecha_hora_inicio at time zone v_zona, 'HH24:MI');
  end if;

  update compras
  set candy_retirado = true, candy_retirado_en = now(), candy_entregado_por = auth.uid()
  where id = v_compra.id;

  insert into logs_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'entrego_candy', 'compra', v_compra.id::text, v_pelicula || ' · ' || v_sala);

  return json_build_object(
    'compra_id', v_compra.id,
    'pelicula', v_pelicula,
    'sala', v_sala,
    'inicio', v_funcion.fecha_hora_inicio,
    'items', public.items_candy(v_compra.id)
  );
end;
$$;

revoke execute on function public.validar_candy(text) from anon, public;
grant execute on function public.validar_candy(text) to authenticated;
