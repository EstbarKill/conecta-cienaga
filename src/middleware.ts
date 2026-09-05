import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient } from './config/supabase.server';
import type { Profile } from './types/database';

/**
 * Rutas que requieren sesión iniciada. Si no hay sesión, se redirige a
 * /login con un parámetro `redirect` para volver tras autenticarse.
 */
const PROTECTED_ROUTES = ['/publicar', '/mis-publicaciones', '/perfil'];

/**
 * Rutas que además requieren role = ADMIN. Se verifica el perfil real
 * en la base de datos en cada request — nunca se confía en un valor
 * cacheado en el cliente.
 */
const ADMIN_ROUTES = ['/admin'];

export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, request, url, redirect, locals } = context;

  const supabase = createSupabaseServerClient(request, cookies);

  // getUser() (no getSession()) valida el token contra el servidor de
  // Supabase en cada llamada — getSession() solo lee la cookie local,
  // que podría estar manipulada. Es más lento pero es la única forma
  // correcta de verificar identidad en código server-side.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  locals.supabase = supabase;
  locals.user = user ?? null;
  locals.profile = null;

  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, full_name, email, phone, whatsapp, avatar_url, is_active, created_at, updated_at')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('[middleware] No se pudo cargar el perfil:', profileError.message);
    }

    if (profile) {
      locals.profile = {
        id: profile.id,
        role: profile.role,
        fullName: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        whatsapp: profile.whatsapp,
        avatarUrl: profile.avatar_url,
        isActive: profile.is_active,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      } satisfies Profile;
    }
  }

  const pathname = url.pathname;
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  const isAdminRoute = ADMIN_ROUTES.some((route) => pathname.startsWith(route));

  if ((isProtected || isAdminRoute) && !locals.user) {
    return redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  }

  // Cuenta deshabilitada: se le trata como no autenticada para rutas
  // protegidas, aunque su token siga siendo técnicamente válido.
  if ((isProtected || isAdminRoute) && locals.profile && !locals.profile.isActive) {
    await supabase.auth.signOut();
    return redirect('/login?error=cuenta_deshabilitada');
  }

  if (isAdminRoute && locals.profile?.role !== 'ADMIN') {
    return redirect('/403');
  }

  return next();
});
