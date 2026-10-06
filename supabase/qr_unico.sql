-- Un solo QR por compra (entradas + candy) y compras de invitados con nombre.
-- Correr después de reportes.sql.

-- ---------- 1. El QR y el código manual pasan a ser de la compra ----------
alter table public.compras add column if not exists qr_codigo text unique;
alter table public.compras add column if not exists codigo_manual text unique;
alter table public.compras add column if not exists nombre_comprador text;
alter table public.compras add column if not exists email_comprador text;

-- Las entradas ya no tienen QR propio.
alter table public.entradas alter column qr_codigo drop not null;
alter table public.entradas alter column codigo_manual drop not null;

-- Genera el QR (uuid) y un código manual de 8 caracteres único para cada compra nueva.
create or replace function public.generar_codigos_compra()
returns trigger
language plpgsql
as $$
begin
  new.qr_codigo := coalesce(new.qr_codigo, gen_random_uuid()::text);
  if new.codigo_manual is null then
    loop
      new.codigo_manual := upper(substr(md5(random()::text), 1, 8));
      exit when not exists (select 1 from compras where codigo_manual = new.codigo_manual);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists generar_codigos_compra on public.compras;
create trigger generar_codigos_compra
  before insert on public.compras
  for each row execute function public.generar_codigos_compra();

-- Compras que ya existían: se les genera su código.
do $$
declare
  v_id uuid;
  v_codigo text;
begin
  for v_id in select id from compras where qr_codigo is null or codigo_manual is null loop
    loop
      v_codigo := upper(substr(md5(random()::text), 1, 8));
      exit when not exists (select 1 from compras where codigo_manual = v_codigo);
    end loop;
    update compras
    set qr_codigo = coalesce(qr_codigo, gen_random_uuid()::text),
        codigo_manual = coalesce(codigo_manual, v_codigo)
    where id = v_id;
  end loop;
end;
$$;

alter table public.compras alter column qr_codigo set not null;
alter table public.compras alter column codigo_manual set not null;


-- ---------- 2. Confirmar compra: nombre del invitado y sin QR por entrada ----------
drop function if exists public.confirmar_compra(uuid, text, text, jsonb, text, boolean, jsonb);

create or replace function public.confirmar_compra(
  p_funcion_id uuid,
  p_sesion text,
  p_metodo_pago text,
  p_items jsonb default '[]'::jsonb,
  p_cupon text default null,
  p_usar_credito boolean default false,
  p_canjes jsonb default '[]'::jsonb,
  p_nombre text default null,
  p_email text default null
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
  v_cupon_ingresado json;
  v_porcentaje numeric := 0;
  v_es_bienvenida boolean := false;
  v_precio_general numeric(10,2);
  v_cant_butacas int;
  v_cant_combos int := 0;
  v_entradas_gratis int := 0;
  v_subtotal numeric(10,2) := 0;
  v_descuento_canjes numeric(10,2) := 0;
  v_descuento numeric(10,2) := 0;
  v_credito numeric(10,2) := 0;
  v_total numeric(10,2);
  v_puntos_usados int := 0;
  v_puntos int := 0;
  v_compra_id uuid;
  v_reserva record;
  v_item record;
  v_canje record;
  v_recompensa recompensas%rowtype;
  v_precio numeric(10,2);
  v_i int := 0;
  v_nombre text := nullif(trim(p_nombre), '');
  v_email text := nullif(lower(trim(p_email)), '');
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

  -- Sin cuenta se compra como invitado: hay que dejar al menos un nombre.
  if v_usuario is null then
    if v_nombre is null or char_length(v_nombre) < 2 then
      raise exception 'Para comprar sin cuenta ingresá tu nombre';
    end if;
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'El mail no es válido';
    end if;
  end if;

  select restriccion_edad into v_restriccion from peliculas where id = v_funcion.pelicula_id;
  if v_usuario is not null then
    select * into v_perfil from perfiles where id = v_usuario for update;
    v_nombre := v_perfil.nombre || ' ' || v_perfil.apellido;
    v_email := v_perfil.email;
    if v_restriccion is not null
       and extract(year from age(current_date, v_perfil.fecha_nacimiento)) < v_restriccion then
      raise exception 'Esta película es para mayores de % años', v_restriccion;
    end if;
  end if;

  v_precio_general := case
    when v_funcion.es_preventa and v_funcion.fecha_fin_preventa > now() then v_funcion.precio_preventa
    else v_funcion.precio_base
  end;

  -- Entradas
  select coalesce(sum(case when b.tipo = 'vip' then v_funcion.precio_vip else v_precio_general end), 0)
  into v_subtotal
  from reservas_temporales r join butacas b on b.id = r.butaca_id
  where r.funcion_id = p_funcion_id and r.session_id = p_sesion;

  -- Candy y combos (precios de la base)
  for v_item in
    select x.tipo, x.id, x.cantidad
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(tipo text, id uuid, cantidad int)
  loop
    if v_item.cantidad is null or v_item.cantidad < 1 or v_item.cantidad > 20 then
      raise exception 'Cantidad inválida';
    end if;
    if v_item.tipo = 'producto' then
      select precio into v_precio from productos_candy where id = v_item.id and activo;
      if not found then raise exception 'Un producto del candy ya no está disponible'; end if;
      v_subtotal := v_subtotal + v_precio * v_item.cantidad;
    elsif v_item.tipo = 'combo' then
      select precio_fijo into v_precio from combos where id = v_item.id and activo;
      if not found then raise exception 'Un combo ya no está disponible'; end if;
      v_cant_combos := v_cant_combos + v_item.cantidad;
      v_subtotal := v_subtotal + (v_precio - v_precio_general) * v_item.cantidad;
    else
      raise exception 'Tipo de producto inválido';
    end if;
  end loop;

  if v_cant_combos > v_cant_butacas then
    raise exception 'Cada combo incluye una entrada: elegiste % combos y % butacas', v_cant_combos, v_cant_butacas;
  end if;

  -- Canjes de puntos
  if jsonb_array_length(coalesce(p_canjes, '[]'::jsonb)) > 0 then
    if v_usuario is null then
      raise exception 'Para canjear puntos tenés que ingresar con tu cuenta';
    end if;
    for v_canje in
      select x.recompensa_id, x.cantidad
      from jsonb_to_recordset(p_canjes) as x(recompensa_id uuid, cantidad int)
    loop
      if v_canje.cantidad is null or v_canje.cantidad < 1 or v_canje.cantidad > 10 then
        raise exception 'Cantidad de canje inválida';
      end if;
      select * into v_recompensa from recompensas where id = v_canje.recompensa_id and activo;
      if not found then raise exception 'Una recompensa ya no está disponible'; end if;

      v_puntos_usados := v_puntos_usados + v_recompensa.puntos_requeridos * v_canje.cantidad;
      if v_recompensa.tipo = 'entrada_gratis' then
        v_entradas_gratis := v_entradas_gratis + v_canje.cantidad;
        v_descuento_canjes := v_descuento_canjes + v_precio_general * v_canje.cantidad;
      end if;
    end loop;

    if v_entradas_gratis + v_cant_combos > v_cant_butacas then
      raise exception 'Elegiste más entradas gratis y combos que butacas';
    end if;
    if v_puntos_usados > v_perfil.puntos_acumulados then
      raise exception 'No te alcanzan los puntos: tenés % y necesitás %', v_perfil.puntos_acumulados, v_puntos_usados;
    end if;
  end if;

  v_subtotal := v_subtotal - v_descuento_canjes;

  -- Un solo cupón: el de mayor porcentaje entre el ingresado y el de bienvenida.
  if v_usuario is not null and not v_perfil.cupon_bienvenida_usado then
    select * into v_cupon from cupones
    where codigo = 'BIENVENIDA' and activo
      and fecha_inicio <= now() and (fecha_fin is null or fecha_fin > now());
    if found then
      v_porcentaje := v_cupon.porcentaje_descuento;
      v_es_bienvenida := true;
    end if;
  end if;

  if coalesce(trim(p_cupon), '') <> '' then
    v_cupon_ingresado := public.validar_cupon(p_cupon);
    if (v_cupon_ingresado->>'porcentaje')::numeric > v_porcentaje then
      select * into v_cupon from cupones where codigo = v_cupon_ingresado->>'codigo';
      v_porcentaje := v_cupon.porcentaje_descuento;
      v_es_bienvenida := false;
    end if;
  end if;

  v_descuento := round(v_subtotal * v_porcentaje / 100, 2);
  v_total := v_subtotal - v_descuento;

  -- Crédito a favor (por compras canceladas)
  if p_usar_credito and v_usuario is not null and v_perfil.credito_disponible > 0 then
    v_credito := least(v_perfil.credito_disponible, v_total);
    v_total := v_total - v_credito;
  end if;

  if v_usuario is not null then
    v_puntos := floor(v_total);
  end if;

  insert into compras (usuario_id, total, subtotal, descuento, descuento_canjes, metodo_pago, cupon_id,
                       puntos_ganados, puntos_usados, credito_usado, tiene_candy,
                       nombre_comprador, email_comprador)
  values (v_usuario, v_total, v_subtotal + v_descuento_canjes, v_descuento, v_descuento_canjes, p_metodo_pago,
          case when v_porcentaje > 0 then v_cupon.id end,
          v_puntos, v_puntos_usados, v_credito,
          jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0
            or exists (select 1 from jsonb_to_recordset(coalesce(p_canjes, '[]'::jsonb)) as x(recompensa_id uuid, cantidad int)
                       join recompensas r on r.id = x.recompensa_id where r.tipo = 'producto_candy'),
          v_nombre, v_email)
  returning id into v_compra_id;

  -- Entradas: primero las incluidas en combos, después las gratis por puntos (las no VIP primero).
  for v_reserva in
    select r.butaca_id, b.tipo
    from reservas_temporales r join butacas b on b.id = r.butaca_id
    where r.funcion_id = p_funcion_id and r.session_id = p_sesion
    order by (b.tipo = 'vip'), b.fila, b.numero
  loop
    v_i := v_i + 1;
    v_precio := case when v_reserva.tipo = 'vip' then v_funcion.precio_vip else v_precio_general end;
    if v_i <= v_cant_combos + v_entradas_gratis then
      v_precio := v_precio - v_precio_general;
    end if;

    -- Las entradas no tienen QR propio: se usa el de la compra.
    insert into entradas (compra_id, funcion_id, butaca_id, precio_pagado)
    values (v_compra_id, p_funcion_id, v_reserva.butaca_id, v_precio);
  end loop;

  -- Candy comprado
  insert into compra_items (compra_id, tipo, referencia_id, cantidad, precio_unitario)
  select v_compra_id, x.tipo::tipo_item_compra, x.id, x.cantidad,
         case when x.tipo = 'producto'
              then (select precio from productos_candy where id = x.id)
              else (select precio_fijo from combos where id = x.id) end
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(tipo text, id uuid, cantidad int);

  -- Productos canjeados con puntos: se suman al candy a retirar, con precio 0.
  insert into compra_items (compra_id, tipo, referencia_id, cantidad, precio_unitario)
  select v_compra_id, 'producto', r.producto_id, x.cantidad, 0
  from jsonb_to_recordset(coalesce(p_canjes, '[]'::jsonb)) as x(recompensa_id uuid, cantidad int)
  join recompensas r on r.id = x.recompensa_id
  where r.tipo = 'producto_candy' and r.producto_id is not null;

  -- Historial de canjes
  insert into puntos_historial (usuario_id, tipo, cantidad, compra_id, recompensa_id)
  select v_usuario, 'canjeado', r.puntos_requeridos * x.cantidad, v_compra_id, r.id
  from jsonb_to_recordset(coalesce(p_canjes, '[]'::jsonb)) as x(recompensa_id uuid, cantidad int)
  join recompensas r on r.id = x.recompensa_id;

  delete from reservas_temporales where funcion_id = p_funcion_id and session_id = p_sesion;

  if v_usuario is not null then
    update perfiles
    set puntos_acumulados = puntos_acumulados - v_puntos_usados + v_puntos,
        credito_disponible = credito_disponible - v_credito,
        cupon_bienvenida_usado = cupon_bienvenida_usado or (v_es_bienvenida and v_descuento > 0)
    where id = v_usuario;

    if v_puntos > 0 then
      insert into puntos_historial (usuario_id, tipo, cantidad, compra_id)
      values (v_usuario, 'ganado', v_puntos, v_compra_id);
    end if;
  end if;

  return v_compra_id;
end;
$$;

grant execute on function public.confirmar_compra(uuid, text, text, jsonb, text, boolean, jsonb, text, text) to anon, authenticated;


-- ---------- 3. Escáner: el QR de la compra valida todas sus entradas ----------
create or replace function public.validar_entrada(p_codigo text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := trim(p_codigo);
  v_compra compras%rowtype;
  v_funcion funciones%rowtype;
  v_pelicula peliculas%rowtype;
  v_sala text;
  v_activas int;
  v_ultima timestamptz;
  v_butacas json;
  v_zona text := 'America/Argentina/Buenos_Aires';
begin
  if public.rol_actual() is null or public.rol_actual() not in ('empleado', 'admin') then
    raise exception 'Solo el personal del cine puede validar entradas';
  end if;
  if v_codigo = '' then
    raise exception 'Ingresá un código';
  end if;

  -- FOR UPDATE: si dos empleados escanean el mismo QR a la vez, el segundo espera.
  select * into v_compra from compras
  where qr_codigo = v_codigo or codigo_manual = upper(v_codigo)
  for update;
  if not found then
    raise exception 'El código no corresponde a ninguna compra';
  end if;
  if v_compra.cancelada_en is not null then
    raise exception 'Esta compra fue cancelada';
  end if;

  select count(*) filter (where estado = 'activa'), max(validada_en)
  into v_activas, v_ultima
  from entradas where compra_id = v_compra.id;

  if v_activas = 0 then
    raise exception 'Estas entradas ya se usaron el % a las % hs',
      to_char(v_ultima at time zone v_zona, 'DD/MM'),
      to_char(v_ultima at time zone v_zona, 'HH24:MI');
  end if;

  select f.* into v_funcion from funciones f
  where f.id = (select funcion_id from entradas where compra_id = v_compra.id limit 1);
  select * into v_pelicula from peliculas where id = v_funcion.pelicula_id;
  select nombre into v_sala from salas where id = v_funcion.sala_id;

  if v_funcion.fecha_hora_fin < now() then
    raise exception 'La función de % ya terminó (era el % a las % hs)',
      v_pelicula.nombre,
      to_char(v_funcion.fecha_hora_inicio at time zone v_zona, 'DD/MM'),
      to_char(v_funcion.fecha_hora_inicio at time zone v_zona, 'HH24:MI');
  end if;
  if v_funcion.fecha_hora_inicio > now() + interval '3 hours' then
    raise exception 'Todavía no se puede ingresar: la función es el % a las % hs',
      to_char(v_funcion.fecha_hora_inicio at time zone v_zona, 'DD/MM'),
      to_char(v_funcion.fecha_hora_inicio at time zone v_zona, 'HH24:MI');
  end if;

  select json_agg(json_build_object('fila', b.fila, 'numero', b.numero, 'tipo', b.tipo) order by b.fila, b.numero)
  into v_butacas
  from entradas e join butacas b on b.id = e.butaca_id
  where e.compra_id = v_compra.id and e.estado = 'activa';

  update entradas
  set estado = 'validada', validada_en = now(), validada_por = auth.uid()
  where compra_id = v_compra.id and estado = 'activa';

  insert into logs_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (
    auth.uid(), 'valido_qr', 'compra', v_compra.id::text,
    v_pelicula.nombre || ' · ' || v_sala || ' · ' || v_activas || ' entrada(s) · ' || coalesce(v_compra.nombre_comprador, 'invitado')
  );

  return json_build_object(
    'compra_id', v_compra.id,
    'codigo_manual', v_compra.codigo_manual,
    'nombre', v_compra.nombre_comprador,
    'pelicula', v_pelicula.nombre,
    'restriccion_edad', v_pelicula.restriccion_edad,
    'inicio', v_funcion.fecha_hora_inicio,
    'formato', v_funcion.formato,
    'idioma', v_funcion.idioma,
    'sala', v_sala,
    'butacas', v_butacas,
    'tiene_candy', v_compra.tiene_candy and not v_compra.candy_retirado
  );
end;
$$;

revoke execute on function public.validar_entrada(text) from anon, public;
grant execute on function public.validar_entrada(text) to authenticated;


-- ---------- 4. Candy: se retira con el mismo QR de la compra ----------
create or replace function public.validar_candy(p_codigo text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := trim(p_codigo);
  v_compra compras%rowtype;
  v_funcion funciones%rowtype;
  v_pelicula text;
  v_sala text;
  v_zona text := 'America/Argentina/Buenos_Aires';
begin
  if public.rol_actual() is null or public.rol_actual() not in ('empleado', 'admin') then
    raise exception 'Solo el personal del cine puede entregar el candy';
  end if;

  select * into v_compra from compras
  where qr_codigo = v_codigo or codigo_manual = upper(v_codigo)
  for update;
  if not found then
    raise exception 'El código no corresponde a ninguna compra';
  end if;
  if v_compra.cancelada_en is not null then
    raise exception 'Esta compra fue cancelada';
  end if;
  if not v_compra.tiene_candy then
    raise exception 'Esta compra no incluye candy';
  end if;
  if v_compra.candy_retirado then
    raise exception 'El candy de esta compra ya se entregó el % a las % hs',
      to_char(v_compra.candy_retirado_en at time zone v_zona, 'DD/MM'),
      to_char(v_compra.candy_retirado_en at time zone v_zona, 'HH24:MI');
  end if;

  select f.* into v_funcion from funciones f
  where f.id = (select funcion_id from entradas where compra_id = v_compra.id limit 1);
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
  values (auth.uid(), 'entrego_candy', 'compra', v_compra.id::text,
          v_pelicula || ' · ' || v_sala || ' · ' || coalesce(v_compra.nombre_comprador, 'invitado'));

  return json_build_object(
    'compra_id', v_compra.id,
    'nombre', v_compra.nombre_comprador,
    'pelicula', v_pelicula,
    'sala', v_sala,
    'inicio', v_funcion.fecha_hora_inicio,
    'items', public.items_candy(v_compra.id)
  );
end;
$$;

revoke execute on function public.validar_candy(text) from anon, public;
grant execute on function public.validar_candy(text) to authenticated;


-- ---------- 5. Las compras de invitados no se cancelan ----------
create or replace function public.cancelar_compra(p_compra_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compra compras%rowtype;
  v_inicio timestamptz;
  v_pelicula text;
  v_credito numeric(10,2);
begin
  select * into v_compra from compras where id = p_compra_id for update;

  if found and v_compra.usuario_id is null then
    raise exception 'Las compras hechas sin cuenta no se pueden cancelar';
  end if;
  if not found or v_compra.usuario_id is distinct from auth.uid() then
    raise exception 'No encontramos esa compra en tu cuenta';
  end if;
  if v_compra.cancelada_en is not null then
    raise exception 'Esta compra ya fue cancelada';
  end if;

  select f.fecha_hora_inicio, p.nombre into v_inicio, v_pelicula
  from entradas e join funciones f on f.id = e.funcion_id join peliculas p on p.id = f.pelicula_id
  where e.compra_id = p_compra_id limit 1;

  if v_inicio - now() < interval '2 hours' then
    raise exception 'Solo se puede cancelar hasta 2 horas antes de la función';
  end if;
  if exists (select 1 from entradas where compra_id = p_compra_id and estado = 'validada') or v_compra.candy_retirado then
    raise exception 'No se puede cancelar: ya se usó una entrada o se retiró el candy';
  end if;

  -- Se devuelve como crédito todo lo pagado, incluido el crédito que se había usado.
  v_credito := v_compra.total + v_compra.credito_usado;

  update entradas set estado = 'cancelada' where compra_id = p_compra_id;
  update compras set cancelada_en = now() where id = p_compra_id;

  update perfiles
  set credito_disponible = credito_disponible + v_credito,
      puntos_acumulados = greatest(0, puntos_acumulados - v_compra.puntos_ganados) + v_compra.puntos_usados,
      cupon_bienvenida_usado = case
        when v_compra.cupon_id = (select id from cupones where codigo = 'BIENVENIDA') then false
        else cupon_bienvenida_usado end
  where id = auth.uid();

  if v_compra.puntos_ganados > 0 then
    insert into puntos_historial (usuario_id, tipo, cantidad, compra_id)
    values (auth.uid(), 'descontado', v_compra.puntos_ganados, p_compra_id);
  end if;
  if v_compra.puntos_usados > 0 then
    insert into puntos_historial (usuario_id, tipo, cantidad, compra_id)
    values (auth.uid(), 'devuelto', v_compra.puntos_usados, p_compra_id);
  end if;

  insert into logs_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'cancelo_compra', 'compra', p_compra_id::text,
          v_pelicula || ' · crédito $' || v_credito);

  return v_credito;
end;
$$;

revoke execute on function public.cancelar_compra(uuid) from anon, public;
grant execute on function public.cancelar_compra(uuid) to authenticated;


-- ---------- 6. Detalle de compra con el QR único y el nombre ----------
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
    'qr_codigo', c.qr_codigo,
    'codigo_manual', c.codigo_manual,
    'nombre_comprador', c.nombre_comprador,
    'invitado', c.usuario_id is null,
    'subtotal', coalesce(c.subtotal, c.total),
    'descuento', c.descuento,
    'descuento_canjes', c.descuento_canjes,
    'credito_usado', c.credito_usado,
    'puntos_usados', c.puntos_usados,
    'cupon', (select codigo from cupones where id = c.cupon_id),
    'total', c.total,
    'metodo_pago', c.metodo_pago,
    'puntos_ganados', c.puntos_ganados,
    'cancelada', c.cancelada_en is not null,
    'candy', public.items_candy(c.id),
    'candy_retirado', c.candy_retirado,
    'pelicula', json_build_object('nombre', p.nombre, 'restriccion_edad', p.restriccion_edad, 'imagen_url', p.imagen_url),
    'funcion', json_build_object('inicio', f.fecha_hora_inicio, 'fin', f.fecha_hora_fin,
                                 'formato', f.formato, 'idioma', f.idioma, 'sala', s.nombre),
    'entradas', (
      select json_agg(json_build_object(
        'id', e.id, 'fila', b.fila, 'numero', b.numero, 'tipo', b.tipo,
        'precio_pagado', e.precio_pagado, 'estado', e.estado
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
