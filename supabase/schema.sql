-- ============================================================
-- BIJOU CINEMA — Esquema de base de datos (Supabase / Postgres)
-- TP1 Programación IV — 2026 C2
-- ============================================================

-- ---------- ENUMS ----------
create type rol_usuario as enum ('cliente', 'admin', 'empleado');
create type formato_funcion as enum ('2d', '3d', '4d', '5d');
create type idioma_funcion as enum ('castellano', 'subtitulada');
create type tipo_butaca as enum ('normal', 'accesible', 'vip');
create type estado_entrada as enum ('activa', 'validada', 'cancelada');
create type tipo_cupon as enum ('general', 'mayores_50');
create type tipo_item_compra as enum ('entrada', 'producto', 'combo');
create type tipo_movimiento_puntos as enum ('ganado', 'canjeado');

-- ---------- PERFILES (extiende auth.users de Supabase) ----------
create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  apellido text not null,
  fecha_nacimiento date not null,
  tipo_sangre text,
  color_ojos text,
  dias_vacaciones_anuales int,
  rol rol_usuario not null default 'cliente',
  puntos_acumulados int not null default 0,
  credito_disponible numeric(10,2) not null default 0,
  cupon_bienvenida_usado boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- GÉNEROS Y PELÍCULAS ----------
create table generos (
  id serial primary key,
  nombre text not null unique
);

create table peliculas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sinopsis text not null,
  duracion_minutos int not null,
  imagen_url text,
  restriccion_edad int, -- null = sin restricción, 13 o 18
  fecha_estreno date not null,
  activa boolean not null default true, -- controla si aparece en la página
  created_at timestamptz not null default now()
);

create table pelicula_generos ( -- pivote muchos a muchos
  pelicula_id uuid references peliculas(id) on delete cascade,
  genero_id int references generos(id) on delete cascade,
  primary key (pelicula_id, genero_id)
);

-- ---------- SALAS Y BUTACAS ----------
create table salas (
  id serial primary key,
  nombre text not null -- "Sala 1", "Sala 2", etc.
);

-- Layout fijo: filas A-I, fila accesible, filas L-T (R,S,T = VIP)
-- 3 grupos de columnas por fila: 4 + 20 + 4 (2+10+2 en la fila accesible)
create table butacas (
  id uuid primary key default gen_random_uuid(),
  sala_id int references salas(id) on delete cascade,
  fila text not null,       -- 'A'..'I', 'ACC', 'L'..'T'
  numero int not null,      -- posición dentro de la fila
  tipo tipo_butaca not null default 'normal',
  unique (sala_id, fila, numero)
);

-- ---------- FUNCIONES ----------
create table funciones (
  id uuid primary key default gen_random_uuid(),
  pelicula_id uuid references peliculas(id) on delete cascade,
  sala_id int references salas(id), -- se completa por asignación automática
  fecha_hora_inicio timestamptz not null,
  fecha_hora_fin timestamptz not null, -- = inicio + duración (calculado en backend)
  formato formato_funcion not null,
  idioma idioma_funcion not null,
  precio_base numeric(10,2) not null,
  precio_vip numeric(10,2) not null,
  es_preventa boolean not null default false,
  fecha_fin_preventa timestamptz,
  precio_preventa numeric(10,2),
  created_at timestamptz not null default now()
);

-- Restricción de negocio real (buffer de 30 min y no solapar sala)
-- se valida en backend/RPC antes de insertar, no solo acá.
create index idx_funciones_sala_horario on funciones (sala_id, fecha_hora_inicio);

-- Reservas temporales: evita que dos personas compren la misma butaca
-- mientras una está en checkout. Expira sola si no se confirma la compra.
create table reservas_temporales (
  id uuid primary key default gen_random_uuid(),
  funcion_id uuid references funciones(id) on delete cascade,
  butaca_id uuid references butacas(id) on delete cascade,
  session_id text not null, -- id de sesión del navegador (usuario anónimo o logueado)
  expira_en timestamptz not null default (now() + interval '10 minutes'),
  unique (funcion_id, butaca_id)
);

-- ---------- CANDY BAR ----------
create table productos_candy (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text not null, -- 'pochoclos', 'bebidas', etc.
  precio numeric(10,2) not null,
  imagen_url text,
  activo boolean not null default true
);

create table combos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  precio_fijo numeric(10,2) not null,
  activo boolean not null default true
);

create table combo_items ( -- qué productos incluye cada combo
  combo_id uuid references combos(id) on delete cascade,
  producto_id uuid references productos_candy(id) on delete cascade,
  cantidad int not null default 1,
  primary key (combo_id, producto_id)
);

-- ---------- CUPONES ----------
create table cupones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  tipo tipo_cupon not null default 'general',
  porcentaje_descuento numeric(5,2) not null,
  edad_minima int, -- solo para cupones tipo 'mayores_50'
  activo boolean not null default true,
  fecha_inicio timestamptz not null default now(),
  fecha_fin timestamptz
);

-- ---------- COMPRAS ----------
create table compras (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references perfiles(id), -- null = compra anónima
  fecha timestamptz not null default now(),
  total numeric(10,2) not null,
  metodo_pago text not null,
  cupon_id uuid references cupones(id),
  puntos_ganados int not null default 0,
  puntos_usados int not null default 0,
  credito_usado numeric(10,2) not null default 0,
  tiene_candy boolean not null default false,
  qr_candy text unique, -- solo si tiene_candy = true
  candy_retirado boolean not null default false
);

create table compra_items (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid references compras(id) on delete cascade,
  tipo tipo_item_compra not null,
  referencia_id uuid not null, -- id de producto_candy o combo (entradas se linkean aparte)
  cantidad int not null default 1,
  precio_unitario numeric(10,2) not null
);

-- ---------- ENTRADAS ----------
create table entradas (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid references compras(id) on delete cascade,
  funcion_id uuid references funciones(id),
  butaca_id uuid references butacas(id),
  precio_pagado numeric(10,2) not null,
  estado estado_entrada not null default 'activa',
  qr_codigo text not null unique,
  codigo_manual text not null unique, -- backup si el lector no funciona
  validada_en timestamptz,
  validada_por uuid references perfiles(id) -- empleado que escaneó
);

-- ---------- FIDELIZACIÓN ----------
create table recompensas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  puntos_requeridos int not null,
  tipo text not null -- 'entrada_gratis' | 'producto_candy'
);

create table puntos_historial (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references perfiles(id) on delete cascade,
  tipo tipo_movimiento_puntos not null,
  cantidad int not null,
  compra_id uuid references compras(id),
  recompensa_id uuid references recompensas(id),
  fecha timestamptz not null default now()
);

-- ---------- RESEÑAS ----------
create table resenas (
  id uuid primary key default gen_random_uuid(),
  pelicula_id uuid references peliculas(id) on delete cascade,
  usuario_id uuid references perfiles(id) on delete cascade,
  estrellas int not null check (estrellas between 1 and 5),
  comentario text,
  fecha timestamptz not null default now(),
  unique (pelicula_id, usuario_id) -- una reseña por usuario por película
);

-- ---------- ALERTAS DE ESTRENO ----------
create table alertas_estreno (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references perfiles(id) on delete cascade,
  pelicula_id uuid references peliculas(id) on delete cascade,
  fecha_creacion timestamptz not null default now(),
  notificado boolean not null default false,
  unique (usuario_id, pelicula_id)
);

-- ---------- LOG DE ACTIVIDAD (admin/empleados) ----------
create table logs_actividad (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references perfiles(id),
  accion text not null,       -- 'creo_funcion', 'modifico_precio', 'valido_qr', etc.
  entidad text not null,      -- 'funcion', 'entrada', 'precio', etc.
  entidad_id text,
  detalle text,
  fecha_hora timestamptz not null default now()
);

-- ============================================================
-- Notas para el README / defensa oral:
-- 1. RLS (Row Level Security) se configura en la etapa de auth,
--    no acá — por ahora las tablas quedan sin políticas.
-- 2. La validación de "no dos funciones en la misma sala al mismo
--    horario + buffer de 30 min" se hace en una función/RPC de
--    Postgres o en el backend antes del insert, no como constraint
--    simple de SQL (requiere lógica de superposición de rangos).
-- 3. reservas_temporales necesita un cron/job (pg_cron o Edge
--    Function) que borre las reservas vencidas periódicamente.
-- ============================================================
