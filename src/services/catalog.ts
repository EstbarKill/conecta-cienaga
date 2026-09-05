import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category, Location } from '../types/database';

export async function getActiveCategories(supabase: SupabaseClient): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, is_active')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('[catalog] getActiveCategories', error.message);
    return [];
  }

  return data.map((c) => ({ id: c.id, name: c.name, slug: c.slug, isActive: c.is_active }));
}

export async function getLocations(supabase: SupabaseClient): Promise<Location[]> {
  const { data, error } = await supabase
    .from('locations')
    .select('id, municipio, departamento, pais')
    .order('municipio');

  if (error) {
    console.error('[catalog] getLocations', error.message);
    return [];
  }

  return data;
}
