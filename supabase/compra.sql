-- ============================================================
-- BIJOU CINEMA — Compra de entradas
-- Correr DESPUÉS de cartelera.sql. Se puede volver a correr.
-- ============================================================

-- ---------- 1. Ajustes de tablas ----------
alter table public.compras add column if not exists subtotal numeric(10,2);
alter table public.compras add column if not exists descuento numeric(10,2) not null default 0;

-- Una butaca no se puede vender dos veces para la misma función.
create unique index if not exists entradas_butaca_unica
  on public.entradas (funcion_id, butaca_id)
  where estado <> 'cancelada';

-- Cupón de bienvenida: el admin puede cambiar el porcentaje en la tabla cupones.
insert into public.cupones (codigo, tipo, porcentaje_descuento)
values ('BIENVENIDA', 'general', 20)
on conflict (codigo) do nothing;


-- ---------- 2. Estado de las butacas de una función ----------
-- 'vendida', 'reservada' (por otra persona) o 'mia' (reservada por esta sesión).
drop function if exists public.estado_butacas(uuid, text);
create or replace function public.estado_butacas(p_funcion_id uuid, p_sesion text)
returns table (butaca_id uuid, estado text, expira_en timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from reservas_temporales rt where rt.expira_en < now();

  return query
    select e.butaca_id, 'vendida'::text, null::timestamptz
    from entradas e
    where e.funcion_id = p_funcion_id and e.estado <> 'cancelada'
    union all
    select r.butaca_id,
           case when r.session_id = p_sesion then 'mia' else 'reservada' end,
           case when r.session_id = p_sesion then r.expira_en end
    from reservas_temporales r
    where r.funcion_id = p_funcion_id;
end;
$$;


-- ---------- 3. Reservar y liberar butacas (10 minutos) ----------
create or replace function public.reservar_butaca(p_funcion_id uuid, p_butaca_id uuid, p_sesion text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_funcion funciones%rowtype;
  v_expira timestamptz;
begin
  select * into v_funcion from funciones where id = p_funcion_id;
  if not found then
    raise exception 'La función no existe';
  end if;
  if v_funcion.fecha_hora_inicio <= now() then
    raise exception 'La función ya empezó';
  end if;
  if not exists (select 1 from butacas where id = p_butaca_id and sala_id = v_funcion.sala_id) then
    raise exception 'La butaca no pertenece a esta sala';
  end if;

  delete from reservas_temporales where expira_en < now();

  if exists (select 1 from entradas where funcion_id = p_funcion_id and butaca_id = p_butaca_id and estado <> 'cancelada') then
    raise exception 'Esa butaca ya fue vendida';
  end if;

  if (select count(*) from reservas_temporales where funcion_id = p_funcion_id and session_id = p_sesion) >= 10 then
    raise exception 'Podés elegir hasta 10 butacas por compra';
  end if;

  -- Todas las butacas de la sesión vencen juntas, a los 10 minutos de la primera.
  select coalesce(min(expira_en), now() + interval '10 minutes') into v_expira
  from reservas_temporales
  where funcion_id = p_funcion_id and session_id = p_sesion;

  insert into reservas_temporales (funcion_id, butaca_id, session_id, expira_en)
  values (p_funcion_id, p_butaca_id, p_sesion, v_expira)
  on conflict (funcion_id, butaca_id) do nothing;

  if not found then
    if not exists (select 1 from reservas_temporales
                   where funcion_id = p_funcion_id and butaca_id = p_butaca_id and session_id = p_sesion) then
      raise exception 'Alguien más está eligiendo esa butaca';
    end if;
  end if;

  return v_expira;
end;
$$;

create or replace function public.liberar_butaca(p_funcion_id uuid, p_butaca_id uuid, p_sesion text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from reservas_temporales
  where funcion_id = p_funcion_id
    and session_id = p_sesion
    and (p_butaca_id is null or butaca_id = p_butaca_id);
$$;


-- ---------- 4. Porcentaje del cupón de bienvenida (para mostrarlo antes de pagar) ----------
create or replace function public.porcentaje_bienvenida()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select porcentaje_descuento from cupones
  where codigo = 'BIENVENIDA' and activo
    and fecha_inicio <= now() and (fecha_fin is null or fecha_fin > now());
$$;


-- ---------- 5. Confirmar la compra (todo o nada) ----------
create or replace function public.confirmar_compra(p_funcion_id uuid, p_sesion text, p_metodo_pago text)
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
  v_subtotal numeric(10,2) := 0;
  v_descuento numeric(10,2) := 0;
  v_total numeric(10,2);
  v_puntos int := 0;
  v_compra_id uuid;
  v_codigo text;
  v_reserva record;
  v_precio numeric(10,2);
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

  if not exists (select 1 from reservas_temporales where funcion_id = p_funcion_id and session_id = p_sesion) then
    raise exception 'Tu reserva venció. Volvé a elegir las butacas.';
  end if;

  -- Restricción de edad (solo se puede validar si está logueado).
  select restriccion_edad into v_restriccion from peliculas where id = v_funcion.pelicula_id;
  if v_usuario is not null then
    select * into v_perfil from perfiles where id = v_usuario;
    if v_restriccion is not null
       and extract(year from age(current_date, v_perfil.fecha_nacimiento)) < v_restriccion then
      raise exception 'Esta película es para mayores de % años', v_restriccion;
    end if;
  end if;

  -- Subtotal: VIP paga precio VIP; el resto, preventa (si sigue vigente) o precio normal.
  select coalesce(sum(
    case
      when b.tipo = 'vip' then v_funcion.precio_vip
      when v_funcion.es_preventa and v_funcion.fecha_fin_preventa > now() then v_funcion.precio_preventa
      else v_funcion.precio_base
    end), 0)
  into v_subtotal
  from reservas_temporales r
  join butacas b on b.id = r.butaca_id
  where r.funcion_id = p_funcion_id and r.session_id = p_sesion;

  -- Cupón de bienvenida en la primera compra de un usuario registrado.
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

  insert into compras (usuario_id, total, subtotal, descuento, metodo_pago, cupon_id, puntos_ganados)
  values (v_usuario, v_total, v_subtotal, v_descuento, p_metodo_pago, v_cupon.id, v_puntos)
  returning id into v_compra_id;

  for v_reserva in
    select r.butaca_id, b.tipo
    from reservas_temporales r join butacas b on b.id = r.butaca_id
    where r.funcion_id = p_funcion_id and r.session_id = p_sesion
  loop
    v_precio := case
      when v_reserva.tipo = 'vip' then v_funcion.precio_vip
      when v_funcion.es_preventa and v_funcion.fecha_fin_preventa > now() then v_funcion.precio_preventa
      else v_funcion.precio_base
    end;

    loop
      v_codigo := upper(substr(md5(random()::text), 1, 8));
      exit when not exists (select 1 from entradas where codigo_manual = v_codigo);
    end loop;

    insert into entradas (compra_id, funcion_id, butaca_id, precio_pagado, qr_codigo, codigo_manual)
    values (v_compra_id, p_funcion_id, v_reserva.butaca_id, v_precio, gen_random_uuid()::text, v_codigo);
  end loop;

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


-- ---------- 6. Detalle de una compra (para la pantalla final y el PDF) ----------
-- El id de la compra es un UUID imposible de adivinar: funciona como link privado,
-- así también lo puede ver quien compró sin registrarse.
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


-- ---------- 7. Permisos ----------
grant execute on function public.estado_butacas(uuid, text) to anon, authenticated;
grant execute on function public.reservar_butaca(uuid, uuid, text) to anon, authenticated;
grant execute on function public.liberar_butaca(uuid, uuid, text) to anon, authenticated;
grant execute on function public.porcentaje_bienvenida() to anon, authenticated;
grant execute on function public.confirmar_compra(uuid, text, text) to anon, authenticated;
grant execute on function public.detalle_compra(uuid) to anon, authenticated;


-- ---------- 8. RLS: nadie toca estas tablas directo, todo pasa por las funciones ----------
alter table public.reservas_temporales enable row level security;
alter table public.compras enable row level security;
alter table public.compra_items enable row level security;
alter table public.entradas enable row level security;
alter table public.puntos_historial enable row level security;
alter table public.cupones enable row level security;

drop policy if exists "compras: ver las propias o admin" on public.compras;
create policy "compras: ver las propias o admin" on public.compras for select to authenticated
  using (usuario_id = auth.uid() or public.rol_actual() = 'admin');

drop policy if exists "entradas: ver las propias o staff" on public.entradas;
create policy "entradas: ver las propias o staff" on public.entradas for select to authenticated
  using (
    public.rol_actual() in ('admin', 'empleado')
    or exists (select 1 from public.compras c where c.id = compra_id and c.usuario_id = auth.uid())
  );

drop policy if exists "compra_items: ver los propios o admin" on public.compra_items;
create policy "compra_items: ver los propios o admin" on public.compra_items for select to authenticated
  using (
    public.rol_actual() = 'admin'
    or exists (select 1 from public.compras c where c.id = compra_id and c.usuario_id = auth.uid())
  );

drop policy if exists "puntos: ver los propios" on public.puntos_historial;
create policy "puntos: ver los propios" on public.puntos_historial for select to authenticated
  using (usuario_id = auth.uid() or public.rol_actual() = 'admin');

drop policy if exists "cupones: admin" on public.cupones;
create policy "cupones: admin" on public.cupones for all to authenticated
  using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');
