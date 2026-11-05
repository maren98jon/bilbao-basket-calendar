/**
 * Esquema y validación del conjunto de datos.
 *
 * La validación se ejecuta al importar los datos (build de Astro y pruebas):
 * cualquier error detiene el build con un mensaje comprensible.
 */

import {
  isValidDateOnly,
  offsetMismatchesMadrid,
  parseIsoWithOffset,
} from '../lib/datetime';

export type ScheduleStatus = 'confirmed' | 'time-tbc' | 'date-tbc';
export type MatchStatus = 'scheduled' | 'postponed' | 'cancelled' | 'finished';

export interface SourceRef {
  label: string;
  url?: string;
}

export interface ContactChannel {
  label: string;
  url: string;
}

export interface Meta {
  /** Fecha real de última revisión de los datos (YYYY-MM-DD). */
  lastReviewedAt: string;
  /** Temporadas incluidas en el archivo. */
  seasons: string[];
  /** `true` mientras los datos sean ejemplos ficticios. */
  demo: boolean;
  /** Información general de las fuentes, si procede. */
  sources?: SourceRef[];
  /** Canal para comunicar errores. Si no existe, la web no lo muestra. */
  contact?: ContactChannel;
}

export interface Match {
  /** Identificador único, estable e independiente de fecha y horario. */
  id: string;
  season: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  venue?: string;
  /** Fecha y hora confirmadas con offset explícito (p. ej. …T18:30:00+01:00). */
  start?: string;
  /** Fecha local cuando se conoce el día pero no la hora (YYYY-MM-DD). */
  date?: string;
  scheduleStatus: ScheduleStatus;
  matchStatus: MatchStatus;
  sourceUrl?: string;
  /** Fecha real de modificación del partido (YYYY-MM-DD). */
  updatedAt: string;
  /** Número de revisión publicada. Se incrementa manualmente (ver README). */
  sequence: number;
  notes?: string;
  /**
   * Último horario publicado de un partido APLAZADO sin nueva fecha.
   * Solo se permite con matchStatus «postponed»: ancla el evento en el ICS
   * para conservar su UID y hace inequívoco que esa fecha ya no es válida.
   */
  lastPublishedStart?: string;
}

export interface Dataset {
  meta: Meta;
  matches: Match[];
}

export class DatasetValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Datos inválidos (${errors.length}):\n- ${errors.join('\n- ')}`);
    this.name = 'DatasetValidationError';
    this.errors = errors;
  }
}

const MATCH_KEYS = new Set([
  'id',
  'season',
  'competition',
  'homeTeam',
  'awayTeam',
  'venue',
  'start',
  'date',
  'scheduleStatus',
  'matchStatus',
  'sourceUrl',
  'updatedAt',
  'sequence',
  'notes',
  'lastPublishedStart',
]);

const META_KEYS = new Set([
  'lastReviewedAt',
  'seasons',
  'demo',
  'sources',
  'contact',
]);

const DATASET_KEYS = new Set(['meta', 'matches']);

const SCHEDULE_STATUSES: ReadonlySet<string> = new Set([
  'confirmed',
  'time-tbc',
  'date-tbc',
]);

const MATCH_STATUSES: ReadonlySet<string> = new Set([
  'scheduled',
  'postponed',
  'cancelled',
  'finished',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isContactUrl(value: string): boolean {
  if (value.startsWith('mailto:')) return value.length > 'mailto:'.length;
  return isHttpUrl(value);
}

function checkUnknownKeys(
  obj: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[],
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      errors.push(`${path}: clave desconocida «${key}».`);
    }
  }
}

export interface ParseOptions {
  /** Nombre del equipo que debe aparecer en cada partido. */
  teamName: string;
}

/**
 * Valida un conjunto de datos en crudo. Lanza `DatasetValidationError`
 * con todos los errores encontrados.
 */
export function parseDataset(raw: unknown, options: ParseOptions): Dataset {
  const errors: string[] = [];

  if (!isRecord(raw)) {
    throw new DatasetValidationError([
      'el archivo debe ser un objeto JSON con «meta» y «matches».',
    ]);
  }
  checkUnknownKeys(raw, DATASET_KEYS, 'raíz', errors);

  const seasons: string[] = [];
  validateMeta(raw['meta'], options, seasons, errors);
  validateMatches(raw['matches'], options, seasons, errors);

  if (errors.length > 0) {
    throw new DatasetValidationError(errors);
  }

  return raw as unknown as Dataset;
}

function validateMeta(
  metaRaw: unknown,
  _options: ParseOptions,
  seasons: string[],
  errors: string[],
): void {
  if (!isRecord(metaRaw)) {
    errors.push('meta: falta el objeto de metadatos.');
    return;
  }
  checkUnknownKeys(metaRaw, META_KEYS, 'meta', errors);

  const lastReviewedAt = metaRaw['lastReviewedAt'];
  if (!isNonEmptyString(lastReviewedAt) || !isValidDateOnly(lastReviewedAt)) {
    errors.push(
      'meta.lastReviewedAt: debe ser una fecha YYYY-MM-DD válida (fecha real de revisión).',
    );
  }

  const seasonsRaw = metaRaw['seasons'];
  if (!Array.isArray(seasonsRaw) || seasonsRaw.length === 0) {
    errors.push('meta.seasons: debe ser una lista no vacía de temporadas.');
  } else {
    for (const [i, s] of seasonsRaw.entries()) {
      if (!isNonEmptyString(s)) {
        errors.push(`meta.seasons[${i}]: debe ser una cadena no vacía.`);
      } else if (seasons.includes(s)) {
        errors.push(`meta.seasons: temporada duplicada «${s}».`);
      } else {
        seasons.push(s);
      }
    }
  }

  if (typeof metaRaw['demo'] !== 'boolean') {
    errors.push(
      'meta.demo: debe ser true o false (indicador explícito de datos de demostración).',
    );
  }

  const sourcesRaw = metaRaw['sources'];
  if (sourcesRaw !== undefined) {
    if (!Array.isArray(sourcesRaw)) {
      errors.push('meta.sources: debe ser una lista.');
    } else {
      for (const [i, s] of sourcesRaw.entries()) {
        const path = `meta.sources[${i}]`;
        if (!isRecord(s)) {
          errors.push(`${path}: debe ser un objeto { label, url? }.`);
          continue;
        }
        if (!isNonEmptyString(s['label'])) {
          errors.push(`${path}: «label» es obligatorio.`);
        }
        const url = s['url'];
        if (url !== undefined && (!isNonEmptyString(url) || !isHttpUrl(url))) {
          errors.push(`${path}: «url» debe ser http(s) válido.`);
        }
      }
    }
  }

  const contactRaw = metaRaw['contact'];
  if (contactRaw !== undefined) {
    if (!isRecord(contactRaw)) {
      errors.push('meta.contact: debe ser un objeto { label, url }.');
    } else {
      if (!isNonEmptyString(contactRaw['label'])) {
        errors.push('meta.contact: «label» es obligatorio.');
      }
      if (!isNonEmptyString(contactRaw['url']) || !isContactUrl(contactRaw['url'])) {
        errors.push('meta.contact: «url» debe ser http(s) o mailto: válido.');
      }
    }
  }
}

function validateMatches(
  matchesRaw: unknown,
  options: ParseOptions,
  seasons: string[],
  errors: string[],
): void {
  if (!Array.isArray(matchesRaw)) {
    errors.push('matches: debe ser una lista de partidos.');
    return;
  }

  const seenIds = new Set<string>();
  for (const [i, m] of matchesRaw.entries()) {
    const label =
      isRecord(m) && isNonEmptyString(m['id'])
        ? `matches[${i}] (id «${m['id']}»)`
        : `matches[${i}]`;
    if (!isRecord(m)) {
      errors.push(`${label}: debe ser un objeto.`);
      continue;
    }
    validateMatch(m, label, { options, seasons, seenIds, errors });
  }
}

interface MatchContext {
  options: ParseOptions;
  seasons: string[];
  seenIds: Set<string>;
  errors: string[];
}

function validateMatch(m: Record<string, unknown>, label: string, ctx: MatchContext): void {
  const { options, seasons, seenIds, errors } = ctx;
  checkUnknownKeys(m, MATCH_KEYS, label, errors);

  // --- obligatorios ---
  if (!isNonEmptyString(m['id'])) {
    errors.push(`${label}: «id» es obligatorio (cadena no vacía, estable e independiente de fechas).`);
  } else if (seenIds.has(m['id'])) {
    errors.push(`${label}: id duplicado «${m['id']}».`);
  } else {
    seenIds.add(m['id']);
  }

  if (!isNonEmptyString(m['season'])) {
    errors.push(`${label}: «season» es obligatorio.`);
  } else if (seasons.length > 0 && !seasons.includes(m['season'])) {
    errors.push(`${label}: «season» «${m['season']}» no está en meta.seasons.`);
  }

  if (!isNonEmptyString(m['competition'])) {
    errors.push(`${label}: «competition» es obligatorio.`);
  }

  const home = m['homeTeam'];
  const away = m['awayTeam'];
  if (!isNonEmptyString(home)) errors.push(`${label}: «homeTeam» es obligatorio.`);
  if (!isNonEmptyString(away)) errors.push(`${label}: «awayTeam» es obligatorio.`);
  if (isNonEmptyString(home) && isNonEmptyString(away)) {
    if (home === away) {
      errors.push(`${label}: homeTeam y awayTeam no pueden ser el mismo equipo.`);
    }
    if (home !== options.teamName && away !== options.teamName) {
      errors.push(
        `${label}: el Bilbao Basket (${options.teamName}) debe ser local o visitante en cada partido.`,
      );
    }
  }

  const scheduleStatus = m['scheduleStatus'];
  const scheduleOk =
    isNonEmptyString(scheduleStatus) && SCHEDULE_STATUSES.has(scheduleStatus);
  if (!scheduleOk) {
    errors.push(`${label}: «scheduleStatus» debe ser confirmed | time-tbc | date-tbc.`);
  }

  const matchStatus = m['matchStatus'];
  const matchOk =
    isNonEmptyString(matchStatus) && MATCH_STATUSES.has(matchStatus);
  if (!matchOk) {
    errors.push(`${label}: «matchStatus» debe ser scheduled | postponed | cancelled | finished.`);
  }

  const sequence = m['sequence'];
  if (typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 0) {
    errors.push(
      `${label}: «sequence» debe ser un entero ≥ 0 (se incrementa manualmente al revisar un partido ya publicado).`,
    );
  }

  const updatedAt = m['updatedAt'];
  if (!isNonEmptyString(updatedAt) || !isValidDateOnly(updatedAt)) {
    errors.push(
      `${label}: «updatedAt» debe ser una fecha YYYY-MM-DD válida (fecha real de modificación).`,
    );
  }

  // --- opcionales de texto ---
  for (const key of ['venue', 'notes'] as const) {
    const v = m[key];
    if (v === undefined) continue;
    if (typeof v !== 'string') {
      errors.push(`${label}: «${key}» debe ser una cadena.`);
    } else if (v.trim().length === 0) {
      errors.push(`${label}: «${key}» no puede estar vacío; omítelo en su lugar.`);
    }
  }

  const sourceUrl = m['sourceUrl'];
  if (sourceUrl !== undefined && (!isNonEmptyString(sourceUrl) || !isHttpUrl(sourceUrl))) {
    errors.push(`${label}: «sourceUrl» debe ser una URL http(s) válida.`);
  }

  // --- fechas ---
  const start = m['start'];
  const date = m['date'];
  const lastPublishedStart = m['lastPublishedStart'];

  if (start !== undefined) {
    if (!isNonEmptyString(start)) {
      errors.push(`${label}: «start» debe ser una cadena ISO-8601.`);
    } else {
      const parsed = parseIsoWithOffset(start);
      if (!parsed) {
        errors.push(
          `${label}: «start» debe ser ISO-8601 con offset explícito (p. ej. 2026-12-05T18:30:00+01:00).`,
        );
      } else if (offsetMismatchesMadrid(parsed)) {
        errors.push(
          `${label}: «start» «${start}» no usa el offset de Europe/Madrid correspondiente a ese instante (revisa horario de verano/invierno).`,
        );
      }
    }
  }

  if (date !== undefined && (!isNonEmptyString(date) || !isValidDateOnly(date))) {
    errors.push(`${label}: «date» debe ser una fecha YYYY-MM-DD válida.`);
  }

  if (start !== undefined && date !== undefined) {
    errors.push(
      `${label}: «start» y «date» son mutuamente excluyentes (hora confirmada frente a solo día).`,
    );
  }

  // --- coherencia scheduleStatus ↔ fechas ---
  if (scheduleOk) {
    if (start !== undefined && date === undefined && scheduleStatus !== 'confirmed') {
      errors.push(
        `${label}: con «start», «scheduleStatus» debe ser «confirmed» (es «${scheduleStatus}”).`,
      );
    } else if (date !== undefined && start === undefined && scheduleStatus !== 'time-tbc') {
      errors.push(
        `${label}: con «date» y sin «start», «scheduleStatus» debe ser «time-tbc» (es «${scheduleStatus}”).`,
      );
    } else if (start === undefined && date === undefined && scheduleStatus !== 'date-tbc') {
      errors.push(
        `${label}: sin «start» ni «date», «scheduleStatus» debe ser «date-tbc» (es «${scheduleStatus}”).`,
      );
    }
  }

  // --- coherencia matchStatus ---
  if (matchOk && matchStatus === 'postponed') {
    if (start !== undefined || date !== undefined) {
      errors.push(
        `${label}: «postponed» significa aplazado SIN nueva fecha: no debe llevar «start» ni «date». ` +
          'Cuando se publique la nueva fecha, vuelve a «scheduled» con sus fechas y incrementa «sequence».',
      );
    }
    if (scheduleOk && scheduleStatus !== 'date-tbc') {
      errors.push(`${label}: «postponed» exige «scheduleStatus» «date-tbc».`);
    }
  }
  if (matchOk && matchStatus === 'finished' && scheduleOk && scheduleStatus === 'date-tbc') {
    errors.push(`${label}: «finished» exige un día conocido («confirmed» o «time-tbc»).`);
  }

  // --- ancla del último horario publicado (aplazados) ---
  if (lastPublishedStart !== undefined) {
    if (!isNonEmptyString(lastPublishedStart)) {
      errors.push(`${label}: «lastPublishedStart» debe ser una cadena ISO-8601.`);
    } else {
      const parsed = parseIsoWithOffset(lastPublishedStart);
      if (!parsed) {
        errors.push(`${label}: «lastPublishedStart» debe ser ISO-8601 con offset explícito.`);
      } else if (offsetMismatchesMadrid(parsed)) {
        errors.push(
          `${label}: «lastPublishedStart» no usa el offset de Europe/Madrid correspondiente a ese instante.`,
        );
      }
    }
    if (matchOk && matchStatus !== 'postponed') {
      errors.push(
        `${label}: «lastPublishedStart» solo se permite en partidos «postponed» (ancla del último horario publicado).`,
      );
    }
    if (start !== undefined || date !== undefined) {
      errors.push(`${label}: «lastPublishedStart» no debe convivir con «start» o «date».`);
    }
  }
}
