export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * `timeZone` fijo (no el del server ni el del navegador) a propósito: sin
 * esto, un componente de servidor que arma esta fecha en Node y el mismo
 * componente hidratando en el navegador del cliente pueden caer en zonas
 * horarias distintas (el servidor corre en UTC, el navegador en la zona de
 * quien mira la pantalla) y el día/hora renderizado difiere → error de
 * hidratación de React ("didn't match"). `hour12: false` por la misma razón
 * pero para el separador de am/pm: el ICU embebido en Node y el del
 * navegador no siempre coinciden byte a byte en ese espacio (uno usa espacio
 * normal, otro un espacio angosto), lo que también dispara el mismo error
 * aunque el texto se vea idéntico a simple vista. Con estas dos opciones el
 * string sale igual sin importar dónde se calcule.
 */
const DATE_TIME_ZONE = 'America/Montevideo';

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-UY', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: DATE_TIME_ZONE,
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-UY', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: DATE_TIME_ZONE,
  });
}
