import { describe, it, expect } from 'vitest';
import { sanitizeSearchText } from '../../src/utils/search';

describe('sanitizeSearchText', () => {
  it('deja intacto un texto de búsqueda normal', () => {
    expect(sanitizeSearchText('auxiliar de cocina')).toBe('auxiliar de cocina');
  });

  it('elimina caracteres que rompen la sintaxis del filtro or() de PostgREST', () => {
    expect(sanitizeSearchText('cocina, (urgente) 50%_off')).toBe('cocina urgente 50off');
  });

  it('recorta espacios al inicio y al final', () => {
    expect(sanitizeSearchText('   electricista   ')).toBe('electricista');
  });

  it('trunca a 100 caracteres para evitar abuso', () => {
    const largo = 'a'.repeat(500);
    expect(sanitizeSearchText(largo).length).toBe(100);
  });

  it('maneja string vacío sin lanzar error', () => {
    expect(sanitizeSearchText('')).toBe('');
  });
});
