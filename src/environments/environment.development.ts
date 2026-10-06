export const environment = {
  production: false,
  supabaseUrl: 'https://ozlakkistyikyopgkkgt.supabase.co',
  supabaseAnonKey: 'sb_publishable_fVGSDRhyyLdzjw7NP8Qrkw_3QmXrDXG',
  // Clave pública VAPID para las notificaciones push (la privada va como secreto en Supabase).
  vapidPublicKey: 'BD94pi8GCn9E77unqtTmut0jdj9DU-GNq_nENhlVpfeL-Or4PWPzfKIclo0N7t9apbt1aKccf_hrMRR1nZPXIIM',
  // Cuentas de prueba para los accesos rápidos del login (para la corrección del TP).
  accesosRapidos: [
    { etiqueta: 'Admin', email: 'admin@bijou.com', password: 'Bijou2026' },
    { etiqueta: 'Empleado', email: 'empleado@bijou.com', password: 'Bijou2026' },
    { etiqueta: 'Cliente', email: 'cliente@bijou.com', password: 'Bijou2026' }
  ]
};
