import { describe, it, expect, vi } from 'vitest';
import type { AuthError } from '@supabase/supabase-js';
import { mapAuthError } from '../../src/utils/authErrors';

function fakeAuthError(code: string): AuthError {
  return { code, name: 'AuthApiError', message: 'mensaje interno de Supabase' } as AuthError;
}

describe('mapAuthError', () => {
  it('nunca expone el mensaje crudo de Supabase al usuario', () => {
    const result = mapAuthError(fakeAuthError('invalid_credentials'));
    expect(result).not.toContain('mensaje interno de Supabase');
  });

  it('traduce invalid_credentials a un mensaje claro', () => {
    expect(mapAuthError(fakeAuthError('invalid_credentials'))).toBe('Correo o contraseña incorrectos.');
  });

  it('traduce email_not_confirmed', () => {
    expect(mapAuthError(fakeAuthError('email_not_confirmed'))).toContain('confirmar tu correo');
  });

  it('traduce user_already_exists y email_exists al mismo mensaje', () => {
    expect(mapAuthError(fakeAuthError('user_already_exists'))).toContain('Ya existe una cuenta');
    expect(mapAuthError(fakeAuthError('email_exists'))).toContain('Ya existe una cuenta');
  });

  it('retorna un mensaje genérico ante un código desconocido', () => {
    const result = mapAuthError(fakeAuthError('codigo_inventado_xyz'));
    expect(result).toBe('No pudimos completar la solicitud. Intenta de nuevo en unos minutos.');
  });

  it('maneja error null sin lanzar excepción', () => {
    expect(() => mapAuthError(null)).not.toThrow();
  });

  it('registra el error técnico en consola para diagnóstico (sección 31: log interno, mensaje seguro al usuario)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mapAuthError(fakeAuthError('invalid_credentials'));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
