/**
 * Limpia el texto de búsqueda antes de usarlo en un filtro `ilike` de
 * PostgREST. La sintaxis de `.or()` de PostgREST usa comas y
 * paréntesis como separadores de condiciones — si el texto del
 * usuario los contiene tal cual, rompe la consulta. Se eliminan esos
 * caracteres (y los comodines de SQL) en vez de intentar escaparlos,
 * que es más simple y suficiente para una búsqueda de texto libre
 * como esta (no es full-text search, es KISS a propósito).
 */
export function sanitizeSearchText(text: string): string {
  return text
    .replace(/[,()%_]/g, '')
    .trim()
    .slice(0, 100);
}
