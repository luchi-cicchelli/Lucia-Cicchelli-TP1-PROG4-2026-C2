-- ============================================================
-- BIJOU CINEMA — Cupones, canje de puntos, crédito, cancelación y reseñas
-- Correr DESPUÉS de candy.sql. Se puede volver a correr.
-- Reemplaza confirmar_compra (es la versión final).
-- ============================================================

-- ---------- 1. Ajustes de tablas ----------
alter table public.compras add column if not exists descuento_canjes numeric(10,2) not null default 0;
alter table public.compras add column if not exists cancelada_en timestamptz;

alter table public.recompensas add column if not exists producto_id uuid references public.productos_candy(id);
alter table public.recompensas add column if not exists activo boolean not null default true;
alter table public.recompensas drop constraint if exists recompensas_tipo_valido;
alter table public.recompensas add constraint recompensas_tipo_valido
  check (tipo in ('entrada_gratis', 'producto_candy'));
alter table public.recompensas drop constraint if exists recompensas_puntos_positivos;
alter table public.recompensas add constraint recompensas_puntos_positivos check (puntos_requeridos > 0);

alter table public.cupones drop constraint if exists cupones_porcentaje_valido;
alter table public.cupones add constraint cupones_porcentaje_valido
  check (porcentaje_descuento > 0 and porcentaje_descuento <= 100);

alter type tipo_movimiento_puntos add value if not exists 'devuelto';
alter type tipo_movimiento_puntos add value if not exists 'descontado';

alter table public.resenas drop constraint if exists resenas_comentario_corto;
alter table public.resenas add constraint resenas_comentario_corto
  check (comentario is null or char_length(comentario) <= 280);


-- ---------- 2. RLS ----------
alter table public.recompensas enable row level security;
alter table public.resenas enable row level security;

drop policy if exists "recompensas: lectura publica" on public.recompensas;
create policy "recompensas: lectura publica" on public.recompensas for select
  using (activo or public.rol_actual() = 'admin');

drop policy if exists "recompensas: admin escribe" on public.recompensas;
create policy "recompensas: admin escribe" on public.recompensas for all to authenticated
  using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');

-- Reseñas: cualquiera las lee; solo reseña quien vio la película (compró y la función ya empezó).
create or replace function public.vio_pelicula(p_pelicula_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from entradas e
    join compras c on c.id = e.compra_id
    join funciones f on f.id = e.funcion_id
    where c.usuario_id = auth.uid()
      and f.pelicula_id = p_pelicula_id
      and e.estado <> 'cancelada'
      and f.fecha_hora_inicio <= now()
  );
$$;
grant execute on function public.vio_pelicula(uuid) to authenticated;

drop policy if exists "resenas: lectura publica" on public.resenas;
create policy "resenas: lectura publica" on public.resenas for select using (true);

drop policy if exists "resenas: crear la propia" on public.resenas;
create policy "resenas: crear la propia" on public.resenas for insert to authenticated
  with check (usuario_id = auth.uid() and public.vio_pelicula(pelicula_id));

drop policy if exists "resenas: editar la propia" on public.resenas;
create policy "resenas: editar la propia" on public.resenas for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists "resenas: borrar la propia" on public.resenas;
create policy "resenas: borrar la propia" on public.resenas for delete to authenticated
  using (usuario_id = auth.uid());


-- ---------- 3. Validar un cupón antes de pagar ----------
-- Devuelve el porcentaje si el cupón existe, está vigente y la persona puede usarlo.
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
    if auth.uid() is null then
      raise exception 'Este cupón es para mayores de % años: ingresá con tu cuenta para usarlo',
        coalesce(v_cupon.edad_minima, 50);
    end if;
    select extract(year from age(current_date, fecha_nacimiento)) into v_edad
    from perfiles where id = auth.uid();
    if v_edad < coalesce(v_cupon.edad_minima, 50) then
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


-- ---------- 4. Confirmar la compra (versión final, todo o nada) ----------
-- p_items:  [{"tipo":"producto"|"combo","id":"<uuid>","cantidad":n}]
-- p_canjes: [{"recompensa_id":"<uuid>","cantidad":n}]  (solo usuarios registrados)
-- Orden del cálculo:
--   entradas + candy (los combos incluyen una entrada general)
--   - canjes de puntos (entrada gratis o producto gratis)
--   - un solo cupón: el de mayor porcentaje entre el ingresado y el de bienvenida
--   - crédito a favor (si la persona elige usarlo)
--   = total pagado → 1 punto por cada peso
drop function if exists public.confirmar_compra(uuid, text, text);
drop function if exists public.confirmar_compra(uuid, text, text, jsonb);
drop function if exists public.confirmar_compra(uuid, text, text, jsonb, text, boolean, jsonb);

create function public.confirmar_compra(
  p_funcion_id uuid,
  p_sesion text,
  p_metodo_pago text,
  p_items jsonb default '[]'::jsonb,
  p_cupon text default null,
  p_usar_credito boolean default false,
  p_canjes jsonb default '[]'::jsonb
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
  v_codigo text;
  v_reserva record;
  v_item record;
  v_canje record;
  v_recompensa recompensas%rowtype;
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
    select * into v_perfil from perfiles where id = v_usuario for update;
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
                       puntos_ganados, puntos_usados, credito_usado, tiene_candy)
  values (v_usuario, v_total, v_subtotal + v_descuento_canjes, v_descuento, v_descuento_canjes, p_metodo_pago,
          case when v_porcentaje > 0 then v_cupon.id end,
          v_puntos, v_puntos_usados, v_credito,
          jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0
            or exists (select 1 from jsonb_to_recordset(coalesce(p_canjes, '[]'::jsonb)) as x(recompensa_id uuid, cantidad int)
                       join recompensas r on r.id = x.recompensa_id where r.tipo = 'producto_candy'))
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

    loop
      v_codigo := upper(substr(md5(random()::text), 1, 8));
      exit when not exists (select 1 from entradas where codigo_manual = v_codigo);
    end loop;

    insert into entradas (compra_id, funcion_id, butaca_id, precio_pagado, qr_codigo, codigo_manual)
    values (v_compra_id, p_funcion_id, v_reserva.butaca_id, v_precio, gen_random_uuid()::text, v_codigo);
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

grant execute on function public.confirmar_compra(uuid, text, text, jsonb, text, boolean, jsonb) to anon, authenticated;


-- ---------- 5. Cancelar una compra hasta 2 horas antes (devuelve crédito) ----------
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


-- ---------- 6. Detalle de compra: suma canjes, crédito y cancelación ----------
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


-- ---------- 7. Datos de ejemplo: recompensas ----------
insert into public.recompensas (nombre, puntos_requeridos, tipo)
select 'Entrada gratis', 25000, 'entrada_gratis'
where not exists (select 1 from public.recompensas where tipo = 'entrada_gratis');

insert into public.recompensas (nombre, puntos_requeridos, tipo, producto_id)
select 'Pochoclo grande gratis', 8000, 'producto_candy', p.id
from public.productos_candy p
where p.nombre = 'Pochoclo grande'
  and not exists (select 1 from public.recompensas where producto_id = p.id);
