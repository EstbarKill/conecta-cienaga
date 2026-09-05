import { describe, it, expect } from 'vitest';
import { slugify } from '../../src/utils/slug';

describe('slugify', () => {
  it('convierte a minúsculas y reemplaza espacios por guiones', () => {
    expect(slugify('Se busca Auxiliar de Cocina')).toBe('se-busca-auxiliar-de-cocina');
  });

  it('elimina acentos y caracteres especiales del español', () => {
    expect(slugify('Electricista disponible: reparación básica')).toBe(
      'electricista-disponible-reparacion-basica'
    );
  });

  it('elimina guiones al inicio y al final', () => {
    expect(slugify('  ¡Hola Ciénaga!  ')).toBe('hola-cienaga');
  });

  it('colapsa múltiples separadores en un solo guion', () => {
    expect(slugify('Ventas   &&&   Mercadeo')).toBe('ventas-mercadeo');
  });

  it('trunca a 80 caracteres', () => {
    const largo = 'a'.repeat(200);
    expect(slugify(largo).length).toBeLessThanOrEqual(80);
  });

  it('retorna string vacío si el input no tiene caracteres alfanuméricos', () => {
    expect(slugify('!!!///???')).toBe('');
  });
});
