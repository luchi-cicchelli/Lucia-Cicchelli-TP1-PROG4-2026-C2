# Bijou — Documento de requerimientos

Resumen de lo que pidió el cliente en los mails del enunciado, ordenado por tema, con cómo se resolvió cada punto.
Estado: ✅ hecho · ⏸️ pendiente por decisión del cliente.

## 1. Usuarios y roles

| # | Requerimiento | Estado | Cómo se resolvió |
|---|---|---|---|
| U1 | Registro con mail, nombre, apellido, fecha de nacimiento, tipo de sangre, color de ojos y días de vacaciones por año | ✅ | Formulario reactivo con validaciones (nombre solo letras, fecha no futura, días entre 0 y 365) |
| U2 | Se puede comprar sin registrarse | ✅ | Para entrar hay que tener cuenta o ingresar como invitado con el nombre (usuario anónimo de Supabase). El invitado compra, pero no suma puntos ni cancela |
| U3 | Rol admin: controla salas, funciones, butacas, productos, etc. | ✅ | Panel `/admin` protegido por guard y por RLS |
| U4 | Rol empleado: escanea QR de entradas y del candy | ✅ | `/empleado/escaner` |
| U5 | Interfaces fáciles de usar para clientes y empleados | ✅ | Diseño propio, responsive, modo oscuro |
| U6 | Fechas y horas fáciles de cargar, sin tanto scroll | ✅ | Sin input date: desplegables de día/mes/año y hora/minutos; funciones por días de la semana; atajos en reportes |
| U7 | Ingreso rápido para probar cada rol | ✅ | Accesos rápidos en el login: Admin, Empleado y Cliente, más el ingreso como invitado |

## 2. Películas y cartelera

| # | Requerimiento | Estado | Cómo se resolvió |
|---|---|---|---|
| P1 | Elegir qué películas aparecen en la página | ✅ | Campo "visible" en cada película |
| P2 | Cada película tiene duración, imagen, nombre y sinopsis | ✅ | El póster se sube a Supabase Storage |
| P3 | Una película puede tener varios géneros | ✅ | Tabla intermedia `pelicula_generos` |
| P4 | En la página principal, primero las 3 más vendidas | ✅ | Ranking por entradas vendidas |
| P5 | Buscador que filtre también por género | ✅ | Búsqueda por texto + chips de género |
| P6 | Restricción de edad (+13 / +18): no se vende a menores y la entrada aclara que debe ir un adulto | ✅ | Validado en el front y en `confirmar_compra`; aviso en el detalle y en el PDF |
| P7 | Reseñas con estrellas y comentario corto, visibles antes de comprar, con promedio | ✅ | Solo reseña quien vio la película; comentario de hasta 280 caracteres |
| P8 | Sección Próximamente con estrenos de las próximas semanas | ✅ | En la home |
| P9 | Alerta para avisar cuando salen las entradas | ✅ | Mail a la dirección de la cuenta (Edge Function + Brevo), y notificación push si se activó |
| P10 | Preventa: abrir la venta 7 días antes del estreno con precio especial, configurable por película | ✅ | Se configura en la película; después del estreno vuelve al precio normal |

## 3. Salas y funciones

| # | Requerimiento | Estado | Cómo se resolvió |
|---|---|---|---|
| S1 | Varias salas, todas con la misma forma: 20 filas (A–T) y bloques de 4, 20 y 4 butacas | ✅ | Las butacas se generan solas al crear la sala |
| S2 | Filas J y K reemplazadas por una fila accesible (2, 10 y 2 butacas), resaltada distinto | ✅ | Butacas accesibles más grandes (el lugar de dos) y con ícono |
| S3 | Butacas VIP en las filas R, S y T: más caras, marcadas distinto y avisadas antes de pagar | ✅ | |
| S4 | Formato 2D/3D/4D/5D e idioma castellano o subtitulada | ✅ | |
| S5 | Asignación de sala automática (ej.: lunes, martes y viernes a las 18) | ✅ | `crear_funciones` busca una sala libre para cada horario |
| S6 | Nunca dos funciones a la vez en la misma sala, con 30 minutos entre funciones | ✅ | *Exclusion constraint* en la base |
| S7 | Butacas en tiempo real mientras alguien elige | ✅ | Reserva de 10 minutos + Realtime |

## 4. Compra, entradas y candy

| # | Requerimiento | Estado | Cómo se resolvió |
|---|---|---|---|
| C1 | PDF con los datos de la entrada y el QR | ✅ | Un solo QR por compra (y código manual) en el PDF |
| C2 | Candy bar: productos en categorías, comprables junto con la entrada | ✅ | |
| C3 | Retirar el candy con el mismo QR | ✅ | El mismo QR de la compra, en modo candy del escáner |
| C4 | Combos (entrada + pochoclo + bebida) a precio fijo configurable, destacados | ✅ | |
| C5 | Validar QR o código manual; una vez usado, deja de funcionar | ✅ | `validar_entrada` hace pasar todas las butacas de la compra; `validar_candy` entrega el candy |
| C6 | Cancelar hasta 2 horas antes, sin devolver dinero: queda crédito en la cuenta | ✅ | `cancelar_compra`; el crédito se ve en el perfil. Las compras de invitados no se cancelan (no hay cuenta donde dejar el crédito) |
| C7 | Usar el crédito junto con otros medios de pago | ✅ | Opción "Usar mi crédito" en el checkout |

## 5. Beneficios

| # | Requerimiento | Estado | Cómo se resolvió |
|---|---|---|---|
| B1 | Cupón de 20% en la primera compra al registrarse | ✅ | |
| B2 | Porcentaje de bienvenida configurable | ✅ | Pantalla Cupones |
| B3 | Cupones solo para mayores de 50 | ✅ | Se valida la edad en la base |
| B4 | 1 punto por cada peso gastado (usuarios registrados) | ✅ | |
| B5 | Canjear puntos por entradas gratis o productos del candy; el admin define cuántos puntos cuesta cada recompensa | ✅ | Pantalla Recompensas; se canjea al comprar |
| B6 | Ver puntos e historial de canjes en el perfil; no se transfieren | ✅ | |
| B7 | Mis películas: historial con pósters, fechas y la calificación propia | ✅ | |

## 6. Administración y reportes

| # | Requerimiento | Estado | Cómo se resolvió |
|---|---|---|---|
| A1 | Reporte de facturación por día y entradas vendidas | ✅ | Pantalla Reportes |
| A2 | Exportar el reporte a PDF y a Excel | ✅ | `jspdf` y `exceljs` |
| A3 | Gráfico de películas más vistas por semana y por mes | ✅ | |
| A4 | Producto del candy más vendido | ✅ | Incluye lo que viene dentro de los combos |
| A5 | Log de actividad: quién creó una función, cambió un precio o validó un QR, con fecha y hora | ✅ | Pantalla Actividad |
| A6 | Mapa del cine que indique la sala | ⏸️ | El cliente aclaró que todavía no tenía luz verde |

## 7. Requisitos técnicos de la consigna

| Requisito | Estado |
|---|---|
| Usar los temas vistos en clase | ✅ (ver tabla en el README) |
| Integración con Supabase | ✅ Auth, Postgres + RLS, Realtime, Storage, Edge Functions |
| PWA | ✅ Instalable, con Service Worker y notificaciones push |
| Estilo visual propio | ✅ Minimalista, rosa, Playfair Display + Inter, modo oscuro |
| App desplegada, código en GitHub, README con arquitectura y decisiones | ✅ |
