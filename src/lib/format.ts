/**
 * Formateo de fechas para la interfaz (es-ES, Europe/Madrid).
 * Solo se usa en la web; el ICS nunca depende de estas cadenas.
 */

import type { Match } from '../data/schema';
import { config } from '../config';

const TZ = config.timezone;

const dayFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const timeFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const longFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const dateOnlyDayFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const dateOnlyLongFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const reviewFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Fecha YYYY-MM-DD a Date a mediodía UTC (mismo día en cualquier zona). */
function dateOnlyNoon(dateOnly: string): Date {
  return new Date(`${dateOnly}T12:00:00Z`);
}

/** Valor para el atributo datetime de <time>. */
export function isoAttr(match: Match): string {
  return match.start ?? match.date ?? match.updatedAt;
}

/** Etiqueta de fecha para una tarjeta. */
export function formatDateLabel(match: Match): string {
  if (match.start) {
    const p = parseStart(match.start);
    return p ? dayFmt.format(p) : match.start;
  }
  if (match.date) return dateOnlyDayFmt.format(dateOnlyNoon(match.date));
  return 'Fecha por confirmar';
}

/** Hora (HH:MM) si hay horario confirmado; en caso contrario null. */
export function formatTimeLabel(match: Match): string | null {
  if (!match.start) return null;
  const p = parseStart(match.start);
  return p ? timeFmt.format(p) : null;
}

/** Fecha completa en texto largo (para títulos/aria). */
export function formatLongLabel(match: Match): string {
  if (match.start) {
    const p = parseStart(match.start);
    if (p) return `${longFmt.format(p)}, ${timeFmt.format(p)} (hora peninsular española)`;
  }
  if (match.date) {
    const base = dateOnlyLongFmt.format(dateOnlyNoon(match.date));
    return match.scheduleStatus === 'time-tbc' ? `${base}, hora por confirmar` : base;
  }
  return 'Fecha por confirmar';
}

/** Fecha de revisión legible: «5 de noviembre de 2026». */
export function formatReviewDate(dateOnly: string): string {
  return reviewFmt.format(dateOnlyNoon(dateOnly));
}

function parseStart(start: string): Date | null {
  const d = new Date(start);
  return Number.isNaN(d.getTime()) ? null : d;
}
