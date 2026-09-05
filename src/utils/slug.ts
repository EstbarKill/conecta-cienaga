import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Normaliza un texto a slug: minúsculas, sin acentos, solo
 * alfanumérico y guiones, sin guiones al inicio/final.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Genera un slug único para una tabla/columna dadas, a partir de un
 * texto base. Si el slug base ya existe, agrega un sufijo numérico
 * (-2, -3, ...). Reutilizable para `posts.slug` y
 * `business_profiles.slug` — misma lógica, distinta tabla.
 *
 * No se usa un UUID como sufijo por defecto para mantener las URLs
 * legibles (sección 25: "no utilizar URLs innecesariamente
 * complejas"); el sufijo numérico solo aparece en el caso poco común
 * de colisión de títulos.
 */
export async function generateUniqueSlug(
  supabase: SupabaseClient,
  title: string,
  table: string = 'posts'
): Promise<string> {
  const base = slugify(title) || 'item';
  let candidate = base;
  let attempt = 1;

  while (attempt < 50) {
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('slug', candidate);

    if (!count) return candidate;

    attempt += 1;
    candidate = `${base}-${attempt}`;
  }

  // Fallback extremo (no debería alcanzarse en la práctica).
  return `${base}-${Date.now()}`;
}
