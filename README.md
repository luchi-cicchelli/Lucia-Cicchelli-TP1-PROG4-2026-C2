# Bijou — Sistema de cine

TP1 · Programación IV · 2026 C2 · Lucía Cicchelli

App web para un cine con varias salas: los clientes compran entradas eligiendo butacas en tiempo real, y el admin gestiona películas, salas, funciones y usuarios.

**Deploy:** https://lucia-cicchelli-tp-1-prog-4-2026-c2.vercel.app/

**Stack:** Angular 19 (standalone, signals) · Supabase (Postgres, Auth, Realtime) · `qrcode` y `jspdf` · Vercel

## Cómo correrlo

```bash
npm install
ng serve
```

1. Completar `src/environments/` con la URL y la *publishable key* de Supabase.
2. En el SQL Editor correr, en orden, los scripts de `supabase/`: `schema.sql`, `seed_generos.sql`, `auth.sql`, `salas_funciones.sql`, `cartelera.sql` y `compra.sql`.
3. Registrarse desde la app y hacerse admin:
   ```sql
   update public.perfiles set rol = 'admin' where email = 'tu@mail.com';
   ```

## Funcionalidades

- **Usuarios:** registro con los datos pedidos, login y roles (cliente, empleado, admin). Se puede comprar sin cuenta.
- **Cartelera:** las 3 más vendidas primero, buscador, filtro por género y sección Próximamente.
- **Detalle:** reseñas, puntaje promedio y funciones separadas por día.
- **Compra:** butacas en tiempo real con reserva de 10 minutos, accesibles y VIP resaltadas, aviso de VIP antes de pagar, cupón de bienvenida del 20%, 1 punto por peso, restricción de edad y PDF con QR y código manual.
- **Admin:** películas con varios géneros; salas con 518 butacas generadas solas; funciones por días, horarios y rango de fechas, con **sala asignada automáticamente**; gestión de roles.

## Arquitectura

```
src/app/
├── core/       models · services (uno por dominio) · guards · validators
├── shared/     navbar, mapa de butacas, tarjeta de película, estrellas
└── features/   una carpeta por pantalla, con lazy loading
supabase/       esquema, funciones RPC y políticas RLS
```

Los componentes usan servicios, y solo los servicios hablan con Supabase. El estado de sesión vive en `AuthService` como signals (`rol`, `esAdmin` y `edad` son `computed`).

## Decisiones técnicas

- **Seguridad en la base:** cada permiso se controla con Row Level Security; los guards de Angular solo mejoran la experiencia.
- **Perfil creado por trigger:** siempre con rol `cliente`, así el rol nunca viene del front. El usuario solo puede editar sus datos personales.
- **Lógica en funciones de Postgres:** crear funciones, cambiar roles y confirmar compras se hace en una transacción; si algo falla, no se guarda nada.
- **Sin superposición de funciones:** una *exclusion constraint* impide dos funciones en la misma sala con menos de 30 minutos de margen, aunque se inserten a mano.
- **Butacas en tiempo real:** con Realtime Broadcast; las reservas son privadas y una butaca no se puede vender dos veces.
- **Compras anónimas:** el id de la compra es un UUID que funciona como link privado a las entradas.

## Pendiente

Escáner de empleados, candy bar y combos, cupones configurables, escribir reseñas, canje de puntos, alertas de estreno, Mis películas, cancelación con crédito, reportes, log de actividad y PWA.