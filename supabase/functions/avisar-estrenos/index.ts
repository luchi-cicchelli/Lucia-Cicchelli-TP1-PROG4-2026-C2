
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const URL_APP = 'https://lucia-cicchelli-tp-1-prog-4-2026-c2.vercel.app';

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

async function enviarMail(para: string, nombre: string, asunto: string, html: string): Promise<boolean> {
  const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': Deno.env.get('BREVO_API_KEY')!,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      sender: { name: 'Bijou Cine', email: Deno.env.get('MAIL_REMITENTE') },
      to: [{ email: para, name: nombre }],
      subject: asunto,
      htmlContent: html
    })
  });
  if (!respuesta.ok) console.error('Brevo rechazó el mail', respuesta.status, await respuesta.text());
  return respuesta.ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (!Deno.env.get('BREVO_API_KEY') || !Deno.env.get('MAIL_REMITENTE')) {
    return responder({ error: 'Faltan los secretos BREVO_API_KEY y MAIL_REMITENTE en Supabase' }, 500);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: usuario } = await supabase.auth.getUser(token);
  if (!usuario.user) return responder({ error: 'Tenés que iniciar sesión' }, 401);

  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', usuario.user.id).single();
  if (perfil?.rol !== 'admin') return responder({ error: 'Solo el admin puede enviar alertas' }, 403);

  const { data: pendientes, error } = await supabase.rpc('alertas_pendientes');
  if (error) return responder({ error: error.message }, 500);

  let mails = 0;
  let sinEnviar = 0;

  for (const alerta of pendientes ?? []) {
    const titulo = alerta.preventa ? '¡Abrió la preventa!' : '¡Ya están las entradas!';
    const texto = `Ya podés comprar tus entradas para ${alerta.pelicula}.`;
    const enlace = `${URL_APP}/pelicula/${alerta.pelicula_id}`;
    let avisado = false;

    const { data: cliente } = await supabase
      .from('perfiles')
      .select('nombre, email')
      .eq('id', alerta.usuario_id)
      .single();

    if (cliente?.email) {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; color: #222">
          <h2 style="color: #d6336c">${titulo}</h2>
          <p>Hola ${cliente.nombre}:</p>
          <p>${texto}</p>
          <p><a href="${enlace}" style="display: inline-block; background: #d6336c; color: #fff;
             padding: 10px 18px; border-radius: 6px; text-decoration: none">Comprar entradas</a></p>
          <p style="color: #888; font-size: 12px">Recibiste este mail porque activaste la alerta de estreno en Bijou Cine.</p>
        </div>`;
      if (await enviarMail(cliente.email, cliente.nombre, `${titulo} ${alerta.pelicula} en Bijou`, html)) {
        mails++;
        avisado = true;
      }
    }

    if (avisado) {
      await supabase.from('alertas_estreno').update({ notificado: true }).eq('id', alerta.alerta_id);
    } else {
      sinEnviar++;
    }
  }

  return responder({ alertas: pendientes?.length ?? 0, mails, sinEnviar });
});
