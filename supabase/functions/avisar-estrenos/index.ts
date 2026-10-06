// Edge Function "avisar-estrenos"
// Manda una notificación push a quienes activaron la alerta de una película
// cuando ya se pueden comprar entradas (preventa o estreno). La llama el admin desde el panel.
//
// Secretos que hay que cargar en Supabase (Edge Functions → Secrets):
//   VAPID_PUBLIC, VAPID_PRIVATE, VAPID_MAIL
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen cargados por Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Las claves VAPID se leen acá (y no al cargar el archivo) para poder avisar si faltan.
  const vapidPublica = Deno.env.get('VAPID_PUBLIC');
  const vapidPrivada = Deno.env.get('VAPID_PRIVATE');
  if (!vapidPublica || !vapidPrivada) {
    return responder({ error: 'Faltan los secretos VAPID_PUBLIC y VAPID_PRIVATE en Supabase' }, 500);
  }
  webpush.setVapidDetails('mailto:' + (Deno.env.get('VAPID_MAIL') ?? 'bijou@example.com'), vapidPublica, vapidPrivada);

  // Cliente con service role: puede leer las suscripciones de todos.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Solo un admin puede disparar el envío.
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: usuario } = await supabase.auth.getUser(token);
  if (!usuario.user) return responder({ error: 'Tenés que iniciar sesión' }, 401);

  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', usuario.user.id).single();
  if (perfil?.rol !== 'admin') return responder({ error: 'Solo el admin puede enviar alertas' }, 403);

  const { data: pendientes, error } = await supabase.rpc('alertas_pendientes');
  if (error) return responder({ error: error.message }, 500);

  let enviadas = 0;

  for (const alerta of pendientes ?? []) {
    const { data: suscripciones } = await supabase
      .from('suscripciones_push')
      .select('*')
      .eq('usuario_id', alerta.usuario_id);

    const mensaje = JSON.stringify({
      notification: {
        title: alerta.preventa ? '¡Abrió la preventa!' : '¡Ya están las entradas!',
        body: `Ya podés comprar tus entradas para ${alerta.pelicula}.`,
        icon: '/icons/icon-192x192.png',
        vibrate: [100, 50, 100],
        data: {
          onActionClick: {
            default: { operation: 'navigateLastFocusedOrOpen', url: `/pelicula/${alerta.pelicula_id}` }
          }
        }
      }
    });

    for (const s of suscripciones ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          mensaje
        );
        enviadas++;
      } catch (e: any) {
        // 404/410: el navegador dio de baja la suscripción, la borramos.
        if (e.statusCode === 404 || e.statusCode === 410) {
          await supabase.from('suscripciones_push').delete().eq('id', s.id);
        }
      }
    }

    await supabase.from('alertas_estreno').update({ notificado: true }).eq('id', alerta.alerta_id);
  }

  return responder({ alertas: pendientes?.length ?? 0, notificaciones: enviadas });
});
