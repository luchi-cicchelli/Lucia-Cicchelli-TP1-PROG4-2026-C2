-- ============================================================
-- BIJOU CINEMA — Validación de entradas (escáner de empleados)
-- Correr DESPUÉS de compra.sql. Se puede volver a correr.
-- ============================================================

-- Recibe el contenido del QR o el código manual de 8 caracteres.
-- Solo empleados y admins. Una entrada se valida UNA sola vez:
-- después de eso el QR deja de funcionar.
create or replace function public.validar_entrada(p_codigo text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := trim(p_codigo);
  v_entrada entradas%rowtype;
  v_funcion funciones%rowtype;
  v_pelicula peliculas%rowtype;
  v_sala text;
  v_butaca butacas%rowtype;
  v_zona text := 'America/Argentina/Buenos_Aires';
begin
  if public.rol_actual() is null or public.rol_actual() not in ('empleado', 'admin') then
    raise exception 'Solo el personal del cine puede validar entradas';
  end if;

  if v_codigo = '' then
    raise exception 'Ingresá un código';
  end if;

  -- FOR UPDATE: si dos empleados escanean la misma entrada a la vez, el segundo espera
  -- y después la encuentra ya validada.
  select * into v_entrada
  from entradas
  where qr_codigo = v_codigo or codigo_manual = upper(v_codigo)
  for update;

  if not found then
    raise exception 'El código no corresponde a ninguna entrada';
  end if;

  if v_entrada.estado = 'cancelada' then
    raise exception 'Esta entrada fue cancelada';
  end if;

  if v_entrada.estado = 'validada' then
    raise exception 'Esta entrada ya se usó el % a las % hs',
      to_char(v_entrada.validada_en at time zone v_zona, 'DD/MM'),
      to_char(v_entrada.validada_en at time zone v_zona, 'HH24:MI');
  end if;

  select * into v_funcion from funciones where id = v_entrada.funcion_id;
  select * into v_pelicula from peliculas where id = v_funcion.pelicula_id;
  select * into v_butaca from butacas where id = v_entrada.butaca_id;
  select nombre into v_sala from salas where id = v_funcion.sala_id;

  if v_funcion.fecha_hora_fin < now() then
    raise exception 'La función de % ya terminó (era el % a las % hs)',
      v_pelicula.nombre,
      to_char(v_funcion.fecha_hora_inicio at time zone v_zona, 'DD/MM'),
      to_char(v_funcion.fecha_hora_inicio at time zone v_zona, 'HH24:MI');
  end if;

  -- Se puede ingresar desde 3 horas antes del comienzo.
  if v_funcion.fecha_hora_inicio > now() + interval '3 hours' then
    raise exception 'Todavía no se puede ingresar: la función es el % a las % hs',
      to_char(v_funcion.fecha_hora_inicio at time zone v_zona, 'DD/MM'),
      to_char(v_funcion.fecha_hora_inicio at time zone v_zona, 'HH24:MI');
  end if;

  update entradas
  set estado = 'validada', validada_en = now(), validada_por = auth.uid()
  where id = v_entrada.id;

  insert into logs_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (
    auth.uid(), 'valido_qr', 'entrada', v_entrada.id::text,
    v_pelicula.nombre || ' · ' || v_sala || ' · ' ||
      case when v_butaca.fila = 'ACC' then 'Accesible ' else 'Fila ' || v_butaca.fila || ' ' end ||
      v_butaca.numero
  );

  return json_build_object(
    'entrada_id', v_entrada.id,
    'codigo_manual', v_entrada.codigo_manual,
    'pelicula', v_pelicula.nombre,
    'restriccion_edad', v_pelicula.restriccion_edad,
    'inicio', v_funcion.fecha_hora_inicio,
    'formato', v_funcion.formato,
    'idioma', v_funcion.idioma,
    'sala', v_sala,
    'fila', v_butaca.fila,
    'numero', v_butaca.numero,
    'tipo', v_butaca.tipo
  );
end;
$$;

revoke execute on function public.validar_entrada(text) from anon, public;
grant execute on function public.validar_entrada(text) to authenticated;
