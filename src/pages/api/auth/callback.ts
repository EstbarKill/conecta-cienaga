import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';

  if (!code) {
    return redirect('/login?error=enlace_invalido');
  }

  const { error } = await locals.supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback]', error.code ?? error.name, error.message);
    return redirect('/login?error=enlace_invalido');
  }

  return redirect(next);
};
