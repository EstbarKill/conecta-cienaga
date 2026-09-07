import { describe, it, expect } from 'vitest';
import { getModerationFlags } from '../../src/utils/moderationFlags';

describe('getModerationFlags', () => {
  it('no marca una publicación normal', () => {
    const flags = getModerationFlags(
      'Se busca auxiliar de cocina',
      'Buscamos una persona responsable para apoyar en cocina, turno de mañana, experiencia mínima 6 meses.'
    );
    expect(flags).toEqual([]);
  });

  it('detecta frases de estafa conocidas', () => {
    const flags = getModerationFlags(
      'Oportunidad única',
      'Solo necesitas hacer un pago inicial de $50.000 y empiezas a ganar de inmediato.'
    );
    expect(flags.some((f) => f.includes('pago inicial'))).toBe(true);
  });

  it('detecta enlaces externos en la descripción', () => {
    const flags = getModerationFlags(
      'Servicio de diseño',
      'Mira mi portafolio completo en https://ejemplo-sospechoso.com/portafolio para más información.'
    );
    expect(flags.some((f) => f.includes('enlace externo'))).toBe(true);
  });

  it('detecta texto mayormente en mayúsculas', () => {
    const flags = getModerationFlags(
      'GANA DINERO YA MISMO SIN ESFUERZO',
      'ESTA ES UNA OPORTUNIDAD INCREIBLE QUE NO PUEDES DEJAR PASAR NUNCA'
    );
    expect(flags.some((f) => f.includes('mayúsculas'))).toBe(true);
  });

  it('detecta puntuación excesiva', () => {
    const flags = getModerationFlags(
      'Se busca vendedor',
      'Necesito vendedor urgente!!! Buen sueldo!!! Llamar ya!!!'
    );
    expect(flags.some((f) => f.includes('Puntuación excesiva'))).toBe(true);
  });

  it('puede detectar varias señales a la vez', () => {
    const flags = getModerationFlags(
      'GANA DINERO FACIL YA',
      'Solo pago inicial y empiezas a ganar!!! visita https://link-raro.com'
    );
    expect(flags.length).toBeGreaterThanOrEqual(2);
  });
});
