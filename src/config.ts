/**
 * Configuración central del proyecto.
 *
 * Todo lo que debe cambiar entre entornos o instalaciones vive aquí:
 * URL pública, identidad del proyecto, zona horaria, nombre del calendario,
 * namespace de los UID y duración orientativa de los partidos.
 */

const viteSiteUrl = import.meta.env.PUBLIC_SITE_URL;
const viteIsProd = import.meta.env.PROD;
const processSiteUrl =
  typeof process !== 'undefined' ? process.env?.PUBLIC_SITE_URL : undefined;

const rawSiteUrl = String(viteSiteUrl ?? processSiteUrl ?? '')
  .trim()
  .replace(/\/+$/, '');

const isProd = Boolean(viteIsProd);

if (isProd && !rawSiteUrl) {
  throw new Error(
    '[config] Falta PUBLIC_SITE_URL en producción. ' +
      'Define la variable de entorno (ver .env.example) antes de ejecutar `npm run build`.',
  );
}

/** URL pública del sitio, sin barra final. En desarrollo: http://localhost:4321. */
export const siteUrl = rawSiteUrl || (isProd ? '' : 'http://localhost:4321');

export const config = {
  /** URL pública del sitio (sin barra final). */
  siteUrl,
  /** Nombre del proyecto. */
  projectName: 'Calendario Bilbao Basket',
  /** Descripción corta del servicio (cabecera). */
  tagline:
    'Consulta los próximos partidos y suscríbete al calendario iCalendar.',
  /** Descripción meta / Open Graph. */
  description:
    'Próximos partidos del Bilbao Basket y calendario iCalendar público ' +
    'para Apple Calendar y Google Calendar. Proyecto independiente, no oficial.',
  /** Zona horaria de presentación de los horarios. */
  timezone: 'Europe/Madrid',
  /** Nombre del equipo que debe aparecer en cada partido. */
  teamName: 'Bilbao Basket',
  /** Nombre visible del calendario en la aplicación del usuario. */
  calendarName: 'Bilbao Basket — partidos',
  /** Descripción visible del calendario en la aplicación del usuario. */
  calendarDescription:
    'Partidos del Bilbao Basket generados a partir de datos mantenidos ' +
    'manualmente. Hora peninsular española. Proyecto independiente, no oficial.',
  /**
   * Namespace estable de los UID. Nunca debe cambiar: los UID ya publicados
   * dependen de él, no de la URL pública del sitio.
   */
  uidNamespace: 'bilbao-basket-calendario',
  /** Duración orientativa de los partidos, en minutos (fin estimado). */
  matchDurationMinutes: 120,
  /** PRODID de iCalendar (se le antepone «-» en la salida). */
  prodId: '//Bilbao Basket Calendario//ES',
  /** Ruta pública estable del feed ICS (sin temporada). */
  icsPath: '/calendario/bilbao-basket.ics',
  /** Pista de refresco publicada en el feed (X-PUBLISHED-TTL), en segundos. */
  refreshHintSeconds: 43_200,
  /**
   * Página oficial de Google Calendar para añadir un calendario desde URL.
   * Verificado en la ayuda de Google: «Otros calendarios → Desde URL».
   * No crea un evento suelto: el flujo guiado está en la web.
   */
  googleCalendarAddUrl: 'https://calendar.google.com/calendar/u/0/r/settings/addbyurl',
} as const;

/**
 * Construye una URL absoluta a partir de la ruta de un recurso.
 * Solo se usa con la URL pública configurada (nunca localhost en producción).
 */
export function absoluteUrl(path: string): string {
  return new URL(path, `${siteUrl}/`).toString();
}

/** URL HTTPS absoluta del feed ICS. */
export const icsUrl = absoluteUrl(config.icsPath);

/** URL webcal:// del feed ICS (suscripción en Apple Calendar). */
export const webcalUrl = icsUrl.replace(/^https?:/, 'webcal:');
