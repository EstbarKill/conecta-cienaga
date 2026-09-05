import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase con la Service Role Key.
 *
 * ⚠️ SOLO puede importarse desde código que se ejecuta exclusivamente en
 * el servidor (endpoints API de Astro, middleware). Esta clave se salta
 * Row Level Security por completo.
 *
 * NUNCA:
 * - Importar este archivo desde un componente que se hidrate en el cliente.
 * - Exponer SUPABASE_SERVICE_ROLE_KEY con el prefijo PUBLIC_.
 * - Usar este cliente para operaciones que el cliente público con RLS
 *   ya puede resolver correctamente.
 *
 * Casos de uso legítimos en este proyecto (a implementar en su bloque
 * correspondiente): funciones administrativas que gestionan el `role`
 * de un perfil, tareas de mantenimiento (marcar posts como EXPIRED).
 */
const supabaseUrl = import.meta.env.SUPABASE_URL;
const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'Faltan variables de entorno de Supabase Admin (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). ' +
      'Este cliente solo debe inicializarse en contexto de servidor.'
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
