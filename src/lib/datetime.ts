/**
 * Utilidades de fecha y hora.
 *
 * Los `start` del JSON llevan offset explícito (p. ej. +01:00 / +02:00).
 * Aquí se valida que ese offset coincida con Europe/Madrid en ese instante
 * (control de horario de verano) y se convierten a formatos iCalendar.
 */

const MADRID = 'Europe/Madrid';

const madridFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MADRID,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Offset de Europe/Madrid en milisegundos respecto a UTC en un instante dado. */
export function madridOffsetMs(instant: Date): number {
  const parts = madridFormatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((p) => p.type === type)?.value;
    return value === undefined ? Number.NaN : Number(value);
  };
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000) * 60_000;
}

const ISO_WITH_OFFSET_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})$/;

export interface ParsedIsoWithOffset {
  date: Date;
  /** Offset explícito de la cadena, en milisegundos. */
  offsetMs: number;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Parsea una fecha ISO-8601 con offset explícito (Z o ±HH:MM).
 * Devuelve `null` si el formato o los componentes no son válidos
 * (p. ej. 2026-02-30).
 */
export function parseIsoWithOffset(value: string): ParsedIsoWithOffset | null {
  const m = ISO_WITH_OFFSET_RE.exec(value);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  const offsetToken = m[7];
  if (offsetToken === undefined) return null;

  if (year < 1970 || year > 2200) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 60) return null;

  let offsetMs: number;
  if (offsetToken === 'Z') {
    offsetMs = 0;
  } else {
    const sign = offsetToken.startsWith('-') ? -1 : 1;
    const oh = Number(offsetToken.slice(1, 3));
    const om = Number(offsetToken.slice(4, 6));
    if (oh > 14 || om > 59) return null;
    offsetMs = sign * (oh * 60 + om) * 60_000;
  }

  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs;
  return { date: new Date(utcMs), offsetMs };
}

/** `true` si el offset explícito no coincide con Europe/Madrid en ese instante. */
export function offsetMismatchesMadrid(parsed: ParsedIsoWithOffset): boolean {
  return parsed.offsetMs !== madridOffsetMs(parsed.date);
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `true` si la cadena es una fecha local válida (YYYY-MM-DD). */
export function isValidDateOnly(value: string): boolean {
  const m = DATE_ONLY_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1970 || year > 2200) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** Fecha YYYY-MM-DD → medianoche UTC (para eventos de día completo). */
export function dateOnlyToUtcMidnight(value: string): Date {
  const m = DATE_ONLY_RE.exec(value);
  if (!m) throw new Error(`Fecha no válida: ${value}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Siguiente día local (DTEND exclusivo de iCalendar). */
export function nextDateOnly(value: string): string {
  const d = dateOnlyToUtcMidnight(value);
  const next = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

/** Suma minutos a un instante. */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** Formato básico de fecha-hora iCalendar en UTC: 20261205T173000Z. */
export function formatUtcBasic(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Fecha YYYY-MM-DD en Europe/Madrid para un instante dado. */
export function madridDateOnly(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
