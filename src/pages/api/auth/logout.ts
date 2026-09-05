import type { APIRoute } from 'astro';
import { signOut } from '../../../services/auth';

export const POST: APIRoute = async ({ locals, redirect }) => {
  await signOut(locals.supabase);
  return redirect('/');
};
