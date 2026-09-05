import type { APIRoute } from 'astro';

const STATIC_PATHS = ['/', '/explorar', '/login', '/register', '/politica-privacidad', '/terminos'];

export const GET: APIRoute = async ({ locals }) => {
  const siteUrl = (import.meta.env.PUBLIC_SITE_URL || 'https://conectacienaga.co').replace(/\/$/, '');

  const { data: posts } = await locals.supabase
    .from('posts')
    .select('slug, updated_at')
    .eq('status', 'PUBLISHED')
    .gt('expires_at', new Date().toISOString());

  const staticEntries = STATIC_PATHS.map(
    (path) => `  <url><loc>${siteUrl}${path}</loc></url>`
  );

  const postEntries = (posts ?? []).map((post: { slug: string; updated_at: string }) => {
    const lastmod = new Date(post.updated_at).toISOString().slice(0, 10);
    return `  <url><loc>${siteUrl}/oportunidad/${post.slug}</loc><lastmod>${lastmod}</lastmod></url>`;
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...postEntries].join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
