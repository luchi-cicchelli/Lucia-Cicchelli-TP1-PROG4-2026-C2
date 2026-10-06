# Bijou — Sistema de cine

TP1 · Programación IV · 2026 C2 · Lucía Cicchelli

App web para un cine con varias salas: los clientes compran entradas y candy eligiendo butacas en tiempo real; los empleados validan los QR, y el admin gestiona la cartelera, los beneficios y los reportes.

**Deploy:** https://lucia-cicchelli-tp-1-prog-4-2026-c2.vercel.app/
**Requerimientos:** [docs/requerimientos.md](docs/requerimientos.md)

**Stack:** Angular 19 (standalone, signals) · Supabase (Postgres, Auth, Realtime, Storage, Edge Functions) · PWA · `qrcode`, `jsqr`, `jspdf`, `exceljs` · Vercel

## Cómo correrlo

```bash
npm install
ng serve
```

1. Completar `src/environments/` con la URL y la *publishable key* de Supabase.
2. En el SQL Editor de Supabase, correr en este orden los scripts de `supabase/`:
   `schema.sql`, `seed_generos.sql`, `auth.sql`, `salas_funciones.sql`, `cartelera.sql`, `compra.sql`, `escaner.sql`, `candy.sql`, `beneficios.sql`, `storage.sql`, `proximamente.sql`, `reportes.sql`, `qr_unico.sql`, `invitados.sql`.
   En Authentication → Sign In / Providers, activar **Allow anonymous sign-ins** (lo usa el ingreso como invitado).
   Datos de prueba (una sola vez): `peliculas_prueba.sql` y `candy_prueba.sql`.
3. Cuentas de prueba (accesos rápidos del login): registrar desde la app `admin@bijou.com`, `empleado@bijou.com` y `cliente@bijou.com` con la contraseña `Bijou2026`, y darles el rol:
   ```sql
   update public.perfiles set rol = 'admin' where email = 'admin@bijou.com';
   update public.perfiles set rol = 'empleado' where email = 'empleado@bijou.com';
   ```
4. Alertas de estreno: crear la Edge Function `avisar-estrenos` con el código de `supabase/functions/avisar-estrenos/index.ts` y cargar los secretos:
   - Mail (aviso principal): crear una cuenta gratis en [Brevo](https://www.brevo.com), verificar el mail remitente (Senders) y crear una API key (SMTP & API). Secretos `BREVO_API_KEY` y `MAIL_REMITENTE`.
   - Push (extra): `VAPID_PUBLIC`, `VAPID_PRIVATE` y `VAPID_MAIL`. La clave pública también va en `environment.vapidPublicKey`.

## Funcionalidades

- **Ingreso:** para usar la app hay que entrar con cuenta (con accesos rápidos de prueba) o como invitado poniendo el nombre.
- **Clientes:** registro con los datos pedidos, cartelera con las 3 más vendidas, buscador y filtro por género, reseñas con promedio, Próximamente con alerta de estreno (llega un mail a la dirección de la cuenta).
- **Compra:** butacas en tiempo real (accesibles más grandes y VIP resaltadas), candy y combos, cupones (bienvenida y mayores de 50), canje de puntos, crédito a favor, restricción de edad y PDF con **un solo QR** para toda la compra.
- **Perfil:** datos, mis entradas (cancelación hasta 2 h antes → crédito), mis películas con mi calificación, puntos e historial de canjes.
- **Empleados:** escáner con cámara o código manual. El mismo QR hace entrar a todas las butacas de la compra y retira el candy; cada cosa una sola vez.
- **Admin:** películas con póster (Storage) y preventa, salas, funciones con sala automática y cambio de precio, candy, cupones, recompensas, roles, reportes exportables a PDF y Excel con gráficos, y log de actividad.

## Arquitectura

```
src/app/
├── core/       models · services (uno por dominio) · guards · validators · interceptors
├── shared/     componentes reutilizables · pipes · directivas
└── features/   una carpeta por pantalla, cargadas con lazy loading
supabase/       esquema, funciones RPC, políticas RLS y la Edge Function
```

Los componentes no hablan con Supabase: lo hacen los servicios. El estado se maneja con **signals** (`signal`, `computed`, `input`, `output`), la sesión vive en `AuthService` y las rutas se protegen con guards funcionales por rol.

### Temas de la cursada y dónde están

| Tema | Dónde |
|---|---|
| Ruteo, lazy loading, parámetros como `input` | `app.routes.ts`, `pelicula-detalle` (`withComponentInputBinding`) |
| Componentes, `input`/`output` | `tarjeta-pelicula`, `estrellas`, `mapa-butacas`, `subir-imagen` (emite la URL subida), `selector-fecha` y `selector-hora` (reemplazan los input date/time) |
| Servicios e `inject` | `core/services/*` |
| Formularios reactivos y validadores propios | registro (`soloLetras`, `fechaNacimientoValida`, contraseñas iguales), funciones (`FormArray` de horarios, rango de fechas), cupones, preventa |
| Auth, guards y roles | `auth.service.ts`, `auth.guards.ts`, `auth.sql` |
| Base de datos y RLS | `supabase/*.sql` (cada tabla con sus políticas) |
| Realtime | `checkout` (butacas en vivo con Broadcast) |
| Storage | `storage.service.ts` + bucket `imagenes` (pósters y candy) |
| Pipes propios | `duracion` (148 → "2 h 28 min"), `textoCorto`, `hace` ("hace 5 min") |
| Directiva propia | `appImagenRespaldo`: si un póster no carga, pone uno por defecto (usa `host`) |
| Interceptor | `supabase.interceptor.ts`: agrega apikey y token a las llamadas a la Edge Function y maneja la barra de carga |
| PWA | `ngsw-config.json`, `manifest.webmanifest`, íconos |
| Alertas por mail y push | Edge Function `avisar-estrenos`: mail con la API de Brevo (`fetch`) y push con `web-push`; `alertas.service.ts` (`SwPush`) |

## Decisiones técnicas

- **La seguridad está en la base:** cada permiso se controla con Row Level Security; los guards solo mejoran la experiencia. Ejemplos: un cliente solo ve sus compras, solo reseña quien vio la película, solo el admin sube imágenes.
- **Lógica de negocio en funciones de Postgres:** comprar, cancelar, validar QR, crear funciones y cambiar precios son RPC transaccionales: si algo falla, no se guarda nada, y el precio siempre lo calcula el servidor.
- **Sin superposición de funciones:** una *exclusion constraint* impide dos funciones en la misma sala con menos de 30 minutos de margen, aunque se inserten a mano.
- **Un solo cupón por compra:** se aplica el de mayor descuento (bienvenida o código), para que no se acumulen.
- **Preventa por película:** se configura en la película (precio y días antes del estreno); las funciones copian ese precio y un trigger las actualiza si cambia. La venta no abre antes de tiempo (lo valida `reservar_butaca`).
- **Cancelación con crédito:** devuelve el total como crédito, descuenta los puntos ganados y devuelve los canjeados.
- **Log de actividad:** las RPC y algunos triggers registran quién hizo qué (funciones, precios, validaciones, cancelaciones, roles).
- **Reportes:** se calculan en SQL; los gráficos son barras con CSS (sin librerías) y la exportación carga `jspdf`/`exceljs` solo al usarla.
- **Un solo QR por compra:** el QR y el código manual son de la compra (los genera un trigger). En la sala valida todas las entradas juntas y en el candy bar entrega todo; cada uno una sola vez.
- **Invitados:** se entra con un usuario anónimo de Supabase Auth (`signInAnonymously`) que guarda el nombre. Tiene sesión (el guard `ingresoGuard` lo deja pasar) pero no perfil: no suma puntos, no usa cupones de edad y no puede cancelar, porque el crédito necesita una cuenta donde quedar. En la base, `es_invitado()` lee el token y `confirmar_compra` lo trata como compra sin cuenta.
- **Alerta de estreno por mail:** la Edge Function busca las alertas cuyas películas ya abrieron la venta y le manda un mail a la dirección de cada cuenta (Brevo). Si además activó las notificaciones, le llega un push. La alerta solo se marca como avisada si algo llegó; si no, queda para el próximo envío.
- **Fechas sin input date:** se eligen con desplegables de día, mes y año (y hora y minutos), como pidió el cliente para evitar el calendario del navegador.
