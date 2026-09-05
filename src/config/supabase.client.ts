import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase con la clave pública (anon key).
 *
 * Este cliente respeta Row Level Security en todo momento — es el que se
 * debe usar en el 99% del código: páginas Astro, componentes, y la capa
 * de `services/`. Nunca usar aquí la Service Role Key (ver
 * supabase.admin.ts para los pocos casos server-only que la requieren).
 *
 * SUPABASE_URL y SUPABASE_ANON_KEY son seguras de exponer
 * al navegador: la seguridad real la da RLS en la base de datos, no el
 * secreto de estas variables.
 */
const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan variables de entorno de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY). ' +
      'Revisa tu archivo .env contra .env.example.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
