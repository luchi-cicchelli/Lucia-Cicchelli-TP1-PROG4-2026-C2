create extension if not exists btree_gist with schema extensions;

-- ---------- 1. Butacas automáticas al crear una sala ----------
create or replace function public.generar_butacas(p_sala_id int)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_fila text;
  v_tipo tipo_butaca;
  v_cantidad int;
begin
  foreach v_fila in array array['A','B','C','D','E','F','G','H','I','ACC','L','M','N','O','P','Q','R','S','T']
  loop
    v_tipo := case
      when v_fila = 'ACC' then 'accesible'
      when v_fila in ('R','S','T') then 'vip'
      else 'normal'
    end;
    v_cantidad := case when v_fila = 'ACC' then 14 else 28 end;

    insert into butacas (sala_id, fila, numero, tipo)
    select p_sala_id, v_fila, n, v_tipo
    from generate_series(1, v_cantidad) as n
    on conflict (sala_id, fila, numero) do nothing;
  end loop;
end;
$$;

create or replace function public.al_crear_sala()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.generar_butacas(new.id);
  return new;
end;
$$;

drop trigger if exists al_crear_sala on public.salas;
create trigger al_crear_sala
  after insert on public.salas
  for each row execute function public.al_crear_sala();

do $$ begin perform public.generar_butacas(id) from public.salas; end $$;


-- ---------- 2. Nunca dos funciones en la misma sala (con 30 min de margen) ----------
create or replace function public.rango_ocupado(p_inicio timestamptz, p_fin timestamptz)
returns tsrange
language sql
immutable
as $$
  select tsrange(p_inicio at time zone 'UTC', (p_fin at time zone 'UTC') + interval '30 minutes');
$$;

alter table public.funciones drop constraint if exists funciones_sin_superposicion;
alter table public.funciones
  add constraint funciones_sin_superposicion
  exclude using gist (
    sala_id with =,
    public.rango_ocupado(fecha_hora_inicio, fecha_hora_fin) with &&
  );

alter table public.funciones drop constraint if exists funciones_fin_despues_inicio;
alter table public.funciones
  add constraint funciones_fin_despues_inicio check (fecha_hora_fin > fecha_hora_inicio);


-- ---------- 3. Crear funciones con asignación automática de sala ----------
create or replace function public.crear_funciones(
  p_pelicula_id uuid,
  p_inicios timestamptz[],
  p_formato formato_funcion,
  p_idioma idioma_funcion,
  p_precio_base numeric,
  p_precio_vip numeric,
  p_es_preventa boolean default false,
  p_fecha_fin_preventa timestamptz default null,
  p_precio_preventa numeric default null
)
returns table (funcion_id uuid, inicio timestamptz, sala_id int, sala_nombre text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_duracion int;
  v_nombre_pelicula text;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_sala record;
  v_id uuid;
begin
  if public.rol_actual() is distinct from 'admin' then
    raise exception 'Solo un administrador puede crear funciones';
  end if;

  if p_inicios is null or array_length(p_inicios, 1) is null then
    raise exception 'No hay horarios para crear';
  end if;

  if p_precio_base <= 0 or p_precio_vip <= 0 then
    raise exception 'Los precios tienen que ser mayores a cero';
  end if;

  if p_es_preventa and (p_fecha_fin_preventa is null or p_precio_preventa is null or p_precio_preventa <= 0) then
    raise exception 'La preventa necesita fecha de fin y precio';
  end if;

  select duracion_minutos, nombre into v_duracion, v_nombre_pelicula
  from peliculas where id = p_pelicula_id;

  if v_duracion is null then
    raise exception 'La película no existe';
  end if;

  if not exists (select 1 from salas) then
    raise exception 'Primero tenés que crear al menos una sala';
  end if;

  perform pg_advisory_xact_lock(hashtext('asignacion_salas'));

  foreach v_inicio in array (select array_agg(x order by x) from unnest(p_inicios) as x)
  loop
    if v_inicio < now() then
      raise exception 'El horario % ya pasó', to_char(v_inicio at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI');
    end if;

    v_fin := v_inicio + make_interval(mins => v_duracion);

    select s.id, s.nombre into v_sala
    from salas s
    where not exists (
      select 1 from funciones f
      where f.sala_id = s.id
        and public.rango_ocupado(f.fecha_hora_inicio, f.fecha_hora_fin)
            && public.rango_ocupado(v_inicio, v_fin)
    )
    order by s.id
    limit 1;

    if v_sala.id is null then
      raise exception 'No hay salas libres el % (ninguna función se creó)',
        to_char(v_inicio at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY "a las" HH24:MI');
    end if;

    insert into funciones (
      pelicula_id, sala_id, fecha_hora_inicio, fecha_hora_fin, formato, idioma,
      precio_base, precio_vip, es_preventa, fecha_fin_preventa, precio_preventa
    )
    values (
      p_pelicula_id, v_sala.id, v_inicio, v_fin, p_formato, p_idioma,
      p_precio_base, p_precio_vip, p_es_preventa,
      case when p_es_preventa then p_fecha_fin_preventa end,
      case when p_es_preventa then p_precio_preventa end
    )
    returning id into v_id;

    funcion_id := v_id;
    inicio := v_inicio;
    sala_id := v_sala.id;
    sala_nombre := v_sala.nombre;
    return next;

    v_sala := null;
  end loop;

  insert into logs_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (
    auth.uid(), 'creo_funciones', 'funcion', p_pelicula_id::text,
    array_length(p_inicios, 1) || ' función(es) de ' || v_nombre_pelicula
  );
end;
$$;

revoke execute on function public.crear_funciones from anon, public;
grant execute on function public.crear_funciones to authenticated;


-- ---------- 4. Log al borrar una función ----------
create or replace function public.log_borrar_funcion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into logs_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (
    auth.uid(), 'borro_funcion', 'funcion', old.id::text,
    'Función del ' || to_char(old.fecha_hora_inicio at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI')
  );
  return old;
end;
$$;

drop trigger if exists log_borrar_funcion on public.funciones;
create trigger log_borrar_funcion
  after delete on public.funciones
  for each row execute function public.log_borrar_funcion();


-- ---------- 5. RLS ----------
alter table public.salas enable row level security;
alter table public.butacas enable row level security;
alter table public.funciones enable row level security;

drop policy if exists "salas: lectura publica" on public.salas;
create policy "salas: lectura publica" on public.salas for select using (true);

drop policy if exists "salas: admin escribe" on public.salas;
create policy "salas: admin escribe" on public.salas for all to authenticated
  using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');

drop policy if exists "butacas: lectura publica" on public.butacas;
create policy "butacas: lectura publica" on public.butacas for select using (true);

drop policy if exists "butacas: admin escribe" on public.butacas;
create policy "butacas: admin escribe" on public.butacas for all to authenticated
  using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');

drop policy if exists "funciones: lectura publica" on public.funciones;
create policy "funciones: lectura publica" on public.funciones for select using (true);

drop policy if exists "funciones: admin borra" on public.funciones;
create policy "funciones: admin borra" on public.funciones for delete to authenticated
  using (public.rol_actual() = 'admin');
