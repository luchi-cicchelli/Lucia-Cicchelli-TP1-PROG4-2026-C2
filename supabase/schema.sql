create type rol_usuario as enum ('cliente', 'admin', 'empleado');
create type formato_funcion as enum ('2d', '3d', '4d', '5d');
create type idioma_funcion as enum ('castellano', 'subtitulada');
create type tipo_butaca as enum ('normal', 'accesible', 'vip');
create type estado_entrada as enum ('activa', 'validada', 'cancelada');
create type tipo_cupon as enum ('general', 'mayores_50');
create type tipo_item_compra as enum ('entrada', 'producto', 'combo');
create type tipo_movimiento_puntos as enum ('ganado', 'canjeado');

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
  restriccion_edad int, 
  fecha_estreno date not null,
  activa boolean not null default true, 
  created_at timestamptz not null default now()
);

create table pelicula_generos ( 
  pelicula_id uuid references peliculas(id) on delete cascade,
  genero_id int references generos(id) on delete cascade,
  primary key (pelicula_id, genero_id)
);

create table salas (
  id serial primary key,
  nombre text not null
);

create table butacas (
  id uuid primary key default gen_random_uuid(),
  sala_id int references salas(id) on delete cascade,
  fila text not null,   
  numero int not null,      
  tipo tipo_butaca not null default 'normal',
  unique (sala_id, fila, numero)
);

create table funciones (
  id uuid primary key default gen_random_uuid(),
  pelicula_id uuid references peliculas(id) on delete cascade,
  sala_id int references salas(id), 
  fecha_hora_inicio timestamptz not null,
  fecha_hora_fin timestamptz not null, 
  formato formato_funcion not null,
  idioma idioma_funcion not null,
  precio_base numeric(10,2) not null,
  precio_vip numeric(10,2) not null,
  es_preventa boolean not null default false,
  fecha_fin_preventa timestamptz,
  precio_preventa numeric(10,2),
  created_at timestamptz not null default now()
);

create index idx_funciones_sala_horario on funciones (sala_id, fecha_hora_inicio);

create table reservas_temporales (
  id uuid primary key default gen_random_uuid(),
  funcion_id uuid references funciones(id) on delete cascade,
  butaca_id uuid references butacas(id) on delete cascade,
  session_id text not null, 
  expira_en timestamptz not null default (now() + interval '10 minutes'),
  unique (funcion_id, butaca_id)
);

create table productos_candy (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text not null,
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

create table combo_items ( 
  combo_id uuid references combos(id) on delete cascade,
  producto_id uuid references productos_candy(id) on delete cascade,
  cantidad int not null default 1,
  primary key (combo_id, producto_id)
);

create table cupones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  tipo tipo_cupon not null default 'general',
  porcentaje_descuento numeric(5,2) not null,
  edad_minima int, 
  activo boolean not null default true,
  fecha_inicio timestamptz not null default now(),
  fecha_fin timestamptz
);

create table compras (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references perfiles(id), 
  fecha timestamptz not null default now(),
  total numeric(10,2) not null,
  metodo_pago text not null,
  cupon_id uuid references cupones(id),
  puntos_ganados int not null default 0,
  puntos_usados int not null default 0,
  credito_usado numeric(10,2) not null default 0,
  tiene_candy boolean not null default false,
  qr_candy text unique, 
  candy_retirado boolean not null default false
);

create table compra_items (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid references compras(id) on delete cascade,
  tipo tipo_item_compra not null,
  referencia_id uuid not null, 
  cantidad int not null default 1,
  precio_unitario numeric(10,2) not null
);

create table entradas (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid references compras(id) on delete cascade,
  funcion_id uuid references funciones(id),
  butaca_id uuid references butacas(id),
  precio_pagado numeric(10,2) not null,
  estado estado_entrada not null default 'activa',
  qr_codigo text not null unique,
  codigo_manual text not null unique, 
  validada_en timestamptz,
  validada_por uuid references perfiles(id) 
);

create table recompensas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  puntos_requeridos int not null,
  tipo text not null 
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

create table resenas (
  id uuid primary key default gen_random_uuid(),
  pelicula_id uuid references peliculas(id) on delete cascade,
  usuario_id uuid references perfiles(id) on delete cascade,
  estrellas int not null check (estrellas between 1 and 5),
  comentario text,
  fecha timestamptz not null default now(),
  unique (pelicula_id, usuario_id) 
);

create table alertas_estreno (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references perfiles(id) on delete cascade,
  pelicula_id uuid references peliculas(id) on delete cascade,
  fecha_creacion timestamptz not null default now(),
  notificado boolean not null default false,
  unique (usuario_id, pelicula_id)
);

create table logs_actividad (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references perfiles(id),
  accion text not null,    
  entidad text not null,      
  entidad_id text,
  detalle text,
  fecha_hora timestamptz not null default now()
);
