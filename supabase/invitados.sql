-- Ingreso como invitado: para usar la app hay que entrar con cuenta o como invitado con tu nombre.
-- El invitado es un usuario anónimo de Supabase Auth (signInAnonymously): tiene sesión,
-- pero no tiene perfil, no suma puntos, no usa cupones de cuenta y no puede cancelar.
-- Correr después de qr_unico.sql. Requiere activar "Allow anonymous sign-ins" en Authentication.

-- ---------- 1. ¿El usuario de la sesión es un invitado? ----------
create or replace function public.es_invitado()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

grant execute on function public.es_invitado() to anon, authenticated;


-- ---------- 2. Los invitados no tienen perfil ----------
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  insert into public.perfiles (
    id, email, nombre, apellido, fecha_nacimiento,
    tipo_sangre, color_ojos, dias_vacaciones_anuales
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    coalesce(new.raw_user_meta_data->>'apellido', ''),
    coalesce(nullif(new.raw_user_meta_data->>'fecha_nacimiento', '')::date, current_date),
    nullif(new.raw_user_meta_data->>'tipo_sangre', ''),
    nullif(new.raw_user_meta_data->>'color_ojos', ''),
    nullif(new.raw_user_meta_data->>'dias_vacaciones_anuales', '')::int
  );
  return new;
end;
$$;


-- ---------- 3. Cupones de edad: solo con cuenta ----------
create or replace function public.validar_cupon(p_codigo text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cupon cupones%rowtype;
  v_edad int;
begin
  select * into v_cupon from cupones
  where upper(codigo) = upper(trim(p_codigo)) and codigo <> 'BIENVENIDA';

  if not found or not v_cupon.activo
     or v_cupon.fecha_inicio > now()
     or (v_cupon.fecha_fin is not null and v_cupon.fecha_fin < now()) then
    raise exception 'El cupón no existe o no está vigente';
  end if;

  if v_cupon.tipo = 'mayores_50' then
    if auth.uid() is null or public.es_invitado() then
      raise exception 'Este cupón es para mayores de % años: ingresá con tu cuenta para usarlo',
        coalesce(v_cupon.edad_minima, 50);
    end if;
    select extract(year from age(current_date, fecha_nacimiento)) into v_edad
    from perfiles where id = auth.uid();
    if v_edad is null or v_edad < coalesce(v_cupon.edad_minima, 50) then
      raise exception 'Este cupón es solo para mayores de % años', coalesce(v_cupon.edad_minima, 50);
    end if;
  end if;

  return json_build_object(
    'codigo', v_cupon.codigo,
    'porcentaje', v_cupon.porcentaje_descuento,
    'tipo', v_cupon.tipo
  );
end;
$$;

grant execute on function public.validar_cupon(text) to anon, authenticated;


-- ---------- 4. Confirmar compra (con nombre del invitado y un solo QR por compra) ----------
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
  -- Un invitado (usuario anónimo de Supabase) compra como si no tuviera cuenta.
  v_usuario uuid := case when public.es_invitado() then null else auth.uid() end;
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


-- ---------- 5. Limpieza: invitados creados antes de correr este script ----------
-- Con el trigger viejo los invitados recibían un perfil y compraban como clientes
-- (cupón de bienvenida y puntos). Sus compras pasan a ser de invitado y se borra ese perfil.
update public.compras c
set usuario_id = null,
    puntos_ganados = 0,
    nombre_comprador = coalesce(nullif(trim(c.nombre_comprador), ''), u.raw_user_meta_data->>'nombre')
from auth.users u
where u.id = c.usuario_id and coalesce(u.is_anonymous, false);

update public.logs_actividad l
set usuario_id = null
from auth.users u
where u.id = l.usuario_id and coalesce(u.is_anonymous, false);

delete from public.perfiles p
using auth.users u
where u.id = p.id and coalesce(u.is_anonymous, false);
