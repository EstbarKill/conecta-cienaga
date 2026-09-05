import type { SupabaseClient } from '@supabase/supabase-js';
import { mapAuthError } from '../utils/authErrors';

export type AuthResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Inicia sesión con email/password usando el cliente ligado a la
 * request actual (server client) — así la sesión resultante se
 * escribe directamente en cookies httpOnly, nunca en localStorage.
 */
export async function signIn(
  supabase: SupabaseClient,
  email: string,
  password: string
): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { success: false, error: mapAuthError(error) };
  return { success: true };
}

/**
 * Registra un nuevo usuario. El perfil (`profiles`) se crea
 * automáticamente vía trigger de base de datos (ver migración
 * 20260831000006 y 20260831000008), que también fija `role` según
 * `accountType`. Por defecto, Supabase exige confirmación de email
 * antes de permitir iniciar sesión.
 */
export async function signUp(
  supabase: SupabaseClient,
  email: string,
  password: string,
  fullName: string,
  accountType: 'USER' | 'BUSINESS'
): Promise<AuthResult> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, account_type: accountType } },
  });
  if (error) return { success: false, error: mapAuthError(error) };
  return { success: true };
}

/**
 * Envía el correo de recuperación de contraseña. `redirectTo` debe
 * apuntar a /api/auth/callback, que intercambia el código por una
 * sesión y redirige a /actualizar-password.
 */
export async function requestPasswordReset(
  supabase: SupabaseClient,
  email: string,
  redirectTo: string
): Promise<AuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return { success: false, error: mapAuthError(error) };
  return { success: true };
}

/**
 * Actualiza la contraseña del usuario. Requiere que ya exista una
 * sesión activa (la que deja /api/auth/callback tras el link del
 * correo de recuperación).
 */
export async function updatePassword(
  supabase: SupabaseClient,
  newPassword: string
): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { success: false, error: mapAuthError(error) };
  return { success: true };
}

export async function signOut(supabase: SupabaseClient): Promise<void> {
  await supabase.auth.signOut();
}
