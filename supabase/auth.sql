-- ============================================================
-- BIJOU CINEMA — Auth, roles y seguridad (RLS)
-- Correr DESPUÉS de schema.sql y seed_generos.sql.
-- Se puede volver a correr sin romper nada (es idempotente).
-- ============================================================

-- ---------- 1. Email en perfiles (para listar usuarios en el admin) ----------
alter table public.perfiles add column if not exists email text;


-- ---------- 2. Crear el perfil automáticamente al registrarse ----------
-- El front manda nombre, apellido, etc. como metadata en signUp().
-- El rol NUNCA viene del front: siempre arranca como 'cliente'.
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();


-- ---------- 3. Helper: rol del usuario logueado ----------
-- security definer para poder leer perfiles sin caer en recursión de RLS.
create or replace function public.rol_actual()
returns rol_usuario
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.perfiles where id = auth.uid();
$$;


-- ---------- 4. RLS en perfiles ----------
alter table public.perfiles enable row level security;

drop policy if exists "perfiles: ver el propio o admin ve todos" on public.perfiles;
create policy "perfiles: ver el propio o admin ve todos"
  on public.perfiles for select
  to authenticated
  using (id = auth.uid() or public.rol_actual() = 'admin');

drop policy if exists "perfiles: editar el propio" on public.perfiles;
create policy "perfiles: editar el propio"
  on public.perfiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- El usuario solo puede editar sus datos personales.
-- rol, puntos, crédito y cupón NO se pueden tocar desde el front.
revoke update on public.perfiles from authenticated, anon;
grant update (nombre, apellido, fecha_nacimiento, tipo_sangre, color_ojos, dias_vacaciones_anuales)
  on public.perfiles to authenticated;


-- ---------- 5. Cambio de rol (solo admin) ----------
create or replace function public.asignar_rol(p_usuario_id uuid, p_rol rol_usuario)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.rol_actual() is distinct from 'admin' then
    raise exception 'Solo un administrador puede cambiar roles';
  end if;

  if p_usuario_id = auth.uid() then
    raise exception 'No podés cambiar tu propio rol';
  end if;

  update public.perfiles set rol = p_rol where id = p_usuario_id;

  insert into public.logs_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'cambio_rol', 'perfil', p_usuario_id::text, 'Nuevo rol: ' || p_rol);
end;
$$;

revoke execute on function public.asignar_rol(uuid, rol_usuario) from anon, public;
grant execute on function public.asignar_rol(uuid, rol_usuario) to authenticated;


-- ---------- 6. RLS en películas y géneros ----------
-- Cualquiera (incluso anónimo) ve las películas activas; solo admin ve las
-- ocultas y puede crear / editar.
alter table public.peliculas enable row level security;
alter table public.generos enable row level security;
alter table public.pelicula_generos enable row level security;

drop policy if exists "peliculas: lectura publica" on public.peliculas;
create policy "peliculas: lectura publica"
  on public.peliculas for select
  using (activa or public.rol_actual() = 'admin');

drop policy if exists "peliculas: admin escribe" on public.peliculas;
create policy "peliculas: admin escribe"
  on public.peliculas for all
  to authenticated
  using (public.rol_actual() = 'admin')
  with check (public.rol_actual() = 'admin');

drop policy if exists "generos: lectura publica" on public.generos;
create policy "generos: lectura publica"
  on public.generos for select
  using (true);

drop policy if exists "generos: admin escribe" on public.generos;
create policy "generos: admin escribe"
  on public.generos for all
  to authenticated
  using (public.rol_actual() = 'admin')
  with check (public.rol_actual() = 'admin');

drop policy if exists "pelicula_generos: lectura publica" on public.pelicula_generos;
create policy "pelicula_generos: lectura publica"
  on public.pelicula_generos for select
  using (true);

drop policy if exists "pelicula_generos: admin escribe" on public.pelicula_generos;
create policy "pelicula_generos: admin escribe"
  on public.pelicula_generos for all
  to authenticated
  using (public.rol_actual() = 'admin')
  with check (public.rol_actual() = 'admin');


-- ---------- 7. Log de actividad: solo admin lee ----------
alter table public.logs_actividad enable row level security;

drop policy if exists "logs: admin lee" on public.logs_actividad;
create policy "logs: admin lee"
  on public.logs_actividad for select
  to authenticated
  using (public.rol_actual() = 'admin');


-- ============================================================
-- PRIMER ADMIN
-- Registrate desde la app y después corré esto UNA vez con tu mail:
--
--   update public.perfiles set rol = 'admin' where email = 'TU_MAIL_ACA';
--
-- A partir de ahí, los demás roles (empleado / admin) se asignan
-- desde /admin/usuarios.
-- ============================================================
