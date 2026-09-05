import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const siteUrl = import.meta.env.SITE_URL || 'https://conectacienaga.co';

  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /publicar/editar
Disallow: /mis-publicaciones
Disallow: /perfil
Disallow: /actualizar-password

Sitemap: ${siteUrl}/sitemap.xml
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
