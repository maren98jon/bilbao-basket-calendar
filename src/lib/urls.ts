/**
 * Construcción de las URLs de suscripción del calendario.
 * Funciones puras: la URL pública se pasa como parámetro para poder testearlas.
 */

/** URL HTTPS absoluta del feed ICS. */
export function httpsCalendarUrl(siteUrl: string, icsPath: string): string {
  const base = siteUrl.trim().replace(/\/+$/, '');
  const path = icsPath.startsWith('/') ? icsPath : `/${icsPath}`;
  return new URL(path, `${base}/`).toString();
}

/** Deriva la variante webcal:// de una URL del feed (suscripción Apple). */
export function webcalUrlFrom(httpsUrl: string): string {
  return httpsUrl.replace(/^https?:/, 'webcal:');
}
