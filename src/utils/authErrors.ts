import type { AuthError } from '@supabase/supabase-js';

/**
 * Traduce errores de Supabase Auth a mensajes seguros para el usuario.
 *
 * Principio (sección 31 del estándar): Technical Error → Internal Log →
 * Safe User Message. Nunca se muestra el mensaje crudo de Supabase (que
 * puede variar de formato o revelar detalles internos) directamente
 * en la UI.
 */
export function mapAuthError(error: AuthError | null): string {
  if (!error) return 'Ocurrió un error inesperado. Intenta de nuevo.';

  console.error('[auth]', error.code ?? error.name, error.message);

  switch (error.code) {
    case 'invalid_credentials':
      return 'Correo o contraseña incorrectos.';
    case 'email_not_confirmed':
      return 'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.';
    case 'user_already_exists':
    case 'email_exists':
      return 'Ya existe una cuenta con este correo. Intenta iniciar sesión.';
    case 'weak_password':
      return 'La contraseña es muy débil. Usa al menos 8 caracteres, combinando letras y números.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
    case 'same_password':
      return 'La nueva contraseña debe ser diferente a la actual.';
    default:
      return 'No pudimos completar la solicitud. Intenta de nuevo en unos minutos.';
  }
}
