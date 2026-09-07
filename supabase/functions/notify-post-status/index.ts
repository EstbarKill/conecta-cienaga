// supabase/functions/notify-post-status/index.ts
//
// ⚠️ NOTA DE VALIDACIÓN: este archivo no se pudo ejecutar ni probar en
// el entorno donde se generó (sin Deno instalado, sin acceso de red a
// deno.land/esm.sh). Está escrito siguiendo el patrón oficial y muy
// documentado de Supabase (Database Webhooks → Edge Function → email
// vía Resend), pero PRUÉBALO en tu proyecto real antes de confiar en
// él para producción — ver instrucciones de despliegue en
// supabase/DATABASE.md.
//
// Se dispara vía un Database Webhook (configurado desde el Dashboard
// de Supabase, no desde una migración — así el secreto compartido
// nunca queda en el repositorio de Git) cuando `posts` recibe un
// UPDATE. Solo actúa si el status cambió a PUBLISHED o REJECTED.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface PostRow {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  status: string;
  rejection_reason: string | null;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: PostRow;
  old_record: PostRow | null;
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Conecta Ciénaga <notificaciones@conectacienaga.co>';
const SITE_URL = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://conectacienaga.co').replace(/\/$/, '');

// Estas dos las inyecta Supabase automáticamente en TODA Edge
// Function desplegada — no hace falta configurarlas manualmente.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  try {
    // Verifica el secreto compartido configurado como header
    // personalizado al crear el Database Webhook en el Dashboard
    // (Database → Webhooks → Headers). Sin esto, cualquiera que
    // conozca la URL de la función podría invocarla.
    if (!WEBHOOK_SECRET || req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
      return new Response('No autorizado.', { status: 401 });
    }

    if (!RESEND_API_KEY) {
      console.error('Falta RESEND_API_KEY en los secretos de la función.');
      return new Response('Configuración incompleta.', { status: 500 });
    }

    const payload: WebhookPayload = await req.json();

    if (payload.table !== 'posts' || payload.type !== 'UPDATE') {
      return new Response('Ignorado (no aplica).', { status: 200 });
    }

    const { record, old_record } = payload;
    const statusChanged = old_record?.status !== record.status;
    const isNotifiable = record.status === 'PUBLISHED' || record.status === 'REJECTED';

    if (!statusChanged || !isNotifiable) {
      return new Response('Ignorado (sin cambio relevante de estado).', { status: 200 });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: author, error: authorError } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name')
      .eq('id', record.author_id)
      .single();

    if (authorError || !author?.email) {
      console.error('No se pudo obtener el email del autor:', authorError?.message);
      return new Response('Autor sin email registrado, se omite el correo.', { status: 200 });
    }

    const postUrl = `${SITE_URL}/oportunidad/${record.slug}`;
    const isApproved = record.status === 'PUBLISHED';

    const subject = isApproved
      ? `¡Tu publicación "${record.title}" fue aprobada!`
      : `Tu publicación "${record.title}" fue rechazada`;

    const html = isApproved
      ? `
        <p>Hola ${author.full_name},</p>
        <p>Buenas noticias: tu publicación <strong>"${record.title}"</strong> fue aprobada y ya está visible en Conecta Ciénaga.</p>
        <p><a href="${postUrl}">Ver mi publicación</a></p>
      `
      : `
        <p>Hola ${author.full_name},</p>
        <p>Tu publicación <strong>"${record.title}"</strong> no fue aprobada.</p>
        ${record.rejection_reason ? `<p><strong>Motivo:</strong> ${record.rejection_reason}</p>` : ''}
        <p>Puedes editarla y volver a enviarla desde <a href="${SITE_URL}/mis-publicaciones">Mis publicaciones</a>.</p>
      `;

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: author.email,
        subject,
        html,
      }),
    });

    if (!emailResponse.ok) {
      const errorBody = await emailResponse.text();
      console.error('Resend respondió con error:', emailResponse.status, errorBody);
      return new Response('Error al enviar el correo.', { status: 502 });
    }

    return new Response('Correo enviado.', { status: 200 });
  } catch (err) {
    console.error('Error inesperado en notify-post-status:', err);
    return new Response('Error interno.', { status: 500 });
  }
});
