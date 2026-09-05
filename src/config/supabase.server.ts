import { createServerClient } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

/**
 * Crea un cliente de Supabase ligado a las cookies de la request actual.
 *
 * Este cliente SÍ respeta RLS (usa la anon key), pero además sabe leer
 * y escribir la sesión desde cookies httpOnly — es lo que permite que
 * el middleware y las páginas Astro (SSR) sepan quién es el usuario sin
 * exponer el token al JavaScript del navegador.
 *
 * Nota de implementación: `Astro.cookies` no expone un `getAll()` nativo
 * (a diferencia de otros frameworks), así que leemos el header `Cookie`
 * crudo de la request para dárselo a @supabase/ssr en el formato que
 * espera. Para escribir, sí usamos la API nativa `cookies.set()`.
 *
 * Se crea una instancia nueva por request (nunca se reutiliza entre
 * requests de distintos usuarios).
 */
export function createSupabaseServerClient(request: Request, cookies: AstroCookies) {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Faltan variables de entorno de Supabase (PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY).'
    );
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        const header = request.headers.get('cookie') ?? '';
        if (!header) return [];
        return header.split(';').map((pair) => {
          const [name, ...rest] = pair.trim().split('=');
          return { name, value: decodeURIComponent(rest.join('=')) };
        });
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookies.set(name, value, {
            ...options,
            // httpOnly + secure + sameSite=lax: estándar recomendado por
            // Supabase para cookies de sesión en SSR. httpOnly evita que
            // un XSS pueda robar el token desde JavaScript del navegador.
            httpOnly: true,
            secure: import.meta.env.PROD,
            sameSite: options?.sameSite === 'strict' ? 'strict' : 'lax',
            path: options?.path ?? '/',
          });
        }
      },
    },
  });
}
