-- Próximamente, preventa por película y alertas de estreno (notificaciones push).
-- Correr después de beneficios.sql.

-- ---------- 1. Preventa configurable película por película ----------
alter table public.peliculas add column if not exists preventa boolean not null default false;
alter table public.peliculas add column if not exists precio_preventa numeric(10,2);
alter table public.peliculas add column if not exists dias_preventa int not null default 7;

alter table public.peliculas drop constraint if exists peliculas_preventa_valida;
alter table public.peliculas add constraint peliculas_preventa_valida check (
  not preventa or (coalesce(precio_preventa, 0) > 0 and dias_preventa between 1 and 30)
);

-- Inicio del día del estreno en hora argentina (ahí termina la preventa).
create or replace function public.inicio_estreno(p_fecha date)
returns timestamptz
language sql
immutable
as $$
  select (p_fecha::timestamp at time zone 'America/Argentina/Buenos_Aires');
$$;

-- Cuándo se pueden empezar a comprar entradas de una película:
-- con preventa, X días antes del estreno; sin preventa, el día del estreno.
create or replace function public.apertura_venta(p_pelicula_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select public.inicio_estreno(fecha_estreno)
         - case when preventa then make_interval(days => dias_preventa) else interval '0' end
  from peliculas
  where id = p_pelicula_id;
$$;

grant execute on function public.apertura_venta(uuid) to anon, authenticated;

-- Las funciones guardan el precio de preventa (así el cálculo del precio no cambia).
-- Cuando el admin cambia la preventa de la película, se actualizan sus funciones futuras.
create or replace function public.sincronizar_preventa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update funciones
  set es_preventa = new.preventa,
      precio_preventa = case when new.preventa then new.precio_preventa end,
      fecha_fin_preventa = case when new.preventa then public.inicio_estreno(new.fecha_estreno) end
  where pelicula_id = new.id
    and fecha_hora_inicio > now();
  return new;
end;
$$;

drop trigger if exists sincronizar_preventa on public.peliculas;
create trigger sincronizar_preventa
  after update of preventa, precio_preventa, fecha_estreno on public.peliculas
  for each row execute function public.sincronizar_preventa();


-- ---------- 2. Crear funciones toma la preventa de la película ----------
drop function if exists public.crear_funciones(uuid, timestamptz[], formato_funcion, idioma_funcion, numeric, numeric, boolean, timestamptz, numeric);

create or replace function public.crear_funciones(
  p_pelicula_id uuid,
  p_inicios timestamptz[],
  p_formato formato_funcion,
  p_idioma idioma_funcion,
  p_precio_base numeric,
  p_precio_vip numeric
)
returns table (funcion_id uuid, inicio timestamptz, sala_id int, sala_nombre text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_pelicula peliculas%rowtype;
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

  select * into v_pelicula from peliculas where id = p_pelicula_id;
  if not found then
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

    v_fin := v_inicio + make_interval(mins => v_pelicula.duracion_minutos);

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
      p_precio_base, p_precio_vip, v_pelicula.preventa,
      case when v_pelicula.preventa then public.inicio_estreno(v_pelicula.fecha_estreno) end,
      case when v_pelicula.preventa then v_pelicula.precio_preventa end
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
    array_length(p_inicios, 1) || ' función(es) de ' || v_pelicula.nombre
  );
end;
$$;

revoke execute on function public.crear_funciones(uuid, timestamptz[], formato_funcion, idioma_funcion, numeric, numeric) from anon, public;
grant execute on function public.crear_funciones(uuid, timestamptz[], formato_funcion, idioma_funcion, numeric, numeric) to authenticated;


-- ---------- 3. No se puede reservar antes de que abra la venta ----------
create or replace function public.reservar_butaca(p_funcion_id uuid, p_butaca_id uuid, p_sesion text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_funcion funciones%rowtype;
  v_apertura timestamptz;
  v_expira timestamptz;
begin
  select * into v_funcion from funciones where id = p_funcion_id;
  if not found then
    raise exception 'La función no existe';
  end if;
  if v_funcion.fecha_hora_inicio <= now() then
    raise exception 'La función ya empezó';
  end if;

  v_apertura := public.apertura_venta(v_funcion.pelicula_id);
  if v_apertura > now() then
    raise exception 'La venta abre el %', to_char(v_apertura at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY');
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


-- ---------- 4. Alertas de estreno y suscripciones push ----------
create table if not exists public.suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.alertas_estreno enable row level security;
alter table public.suscripciones_push enable row level security;

drop policy if exists "alertas: las propias" on public.alertas_estreno;
create policy "alertas: las propias" on public.alertas_estreno for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists "suscripciones: las propias" on public.suscripciones_push;
create policy "suscripciones: las propias" on public.suscripciones_push for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Alertas que ya hay que mandar: la venta abrió y hay funciones a la venta.
-- La usa la Edge Function "avisar-estrenos" (con la service role).
create or replace function public.alertas_pendientes()
returns table (alerta_id uuid, usuario_id uuid, pelicula_id uuid, pelicula text, preventa boolean)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.usuario_id, p.id, p.nombre, p.preventa and now() < public.inicio_estreno(p.fecha_estreno)
  from alertas_estreno a
  join peliculas p on p.id = a.pelicula_id
  where not a.notificado
    and p.activa
    and public.apertura_venta(p.id) <= now()
    and exists (select 1 from funciones f where f.pelicula_id = p.id and f.fecha_hora_inicio > now());
$$;

revoke execute on function public.alertas_pendientes() from anon, authenticated, public;
grant execute on function public.alertas_pendientes() to service_role;
