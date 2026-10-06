-- Un solo QR por compra (entradas + candy).
-- Correr después de reportes.sql (y después invitados.sql).

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
