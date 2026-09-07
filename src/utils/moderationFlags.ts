/**
 * Señales de alerta para priorizar la cola de moderación. Esto NO
 * rechaza ni aprueba nada automáticamente — solo marca publicaciones
 * para que el admin las revise con más cuidado. La decisión sigue
 * siendo 100% humana (admin_review_post sigue siendo el único camino
 * para publicar/rechazar).
 */

const SUSPICIOUS_PHRASES = [
  'pago por adelantado',
  'pago inicial',
  'deposito inicial',
  'depósito inicial',
  'inversion inicial',
  'inversión inicial',
  'cuota de inscripcion',
  'cuota de inscripción',
  'dinero facil',
  'dinero fácil',
  'gana dinero rapido',
  'gana dinero rápido',
  'ganancias garantizadas',
  'ganancia garantizada',
  'multinivel',
  'piramide',
  'pirámide',
  'haz clic aqui',
  'haz clic aquí',
  'oferta limitada',
  'solo hoy',
  'transferencia urgente',
  'gana desde casa',
];

/** Cuenta cuántas letras mayúsculas hay entre las letras alfabéticas del texto. */
function uppercaseRatio(text: string): number {
  const letters = text.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '');
  if (letters.length < 12) return 0; // texto muy corto, no evaluamos
  const uppercase = letters.replace(/[^A-ZÁÉÍÓÚÑ]/g, '');
  return uppercase.length / letters.length;
}

export interface ModerationFlag {
  label: string;
}

/**
 * Analiza título + descripción y devuelve una lista de señales de
 * alerta detectadas (vacía si no hay ninguna). Es intencionalmente
 * simple (coincidencia de frases + un par de heurísticas de formato),
 * no un modelo de spam — priorizamos algo explicable y fácil de
 * ajustar sobre algo "inteligente" pero opaco.
 */
export function getModerationFlags(title: string, description: string): string[] {
  const flags: string[] = [];
  const combined = `${title} ${description}`.toLowerCase();

  const matchedPhrase = SUSPICIOUS_PHRASES.find((phrase) => combined.includes(phrase));
  if (matchedPhrase) {
    flags.push(`Contiene la frase "${matchedPhrase}"`);
  }

  if (/https?:\/\//i.test(description)) {
    flags.push('La descripción incluye un enlace externo');
  }

  if (uppercaseRatio(title) > 0.6 || uppercaseRatio(description) > 0.6) {
    flags.push('Texto mayormente en mayúsculas');
  }

  if (/[!?]{3,}/.test(combined)) {
    flags.push('Puntuación excesiva (!!! o ???)');
  }

  return flags;
}
