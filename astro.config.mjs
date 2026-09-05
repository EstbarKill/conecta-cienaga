// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// https://astro.build/config
//
// output: 'server' — necesario porque el proyecto requiere sesiones de
// autenticación (Supabase Auth) y rutas protegidas (/mis-publicaciones,
// /admin, /publicar) que dependen de estado por request. Las páginas
// públicas (home, /explorar, /oportunidad/[slug]) seguirán sirviéndose
// de forma eficiente gracias al prerender selectivo de Astro.
export default defineConfig({
  output: 'server',
  adapter: vercel(),
});
