/**
 * Generación del feed iCalendar (RFC 5545) a partir del conjunto de datos.
 *
 * Decisiones (documentadas en docs/interoperabilidad.md):
 * - Librería: ical-generator (escapado TEXT, CRLF y plegado de líneas
 *   consciente de bytes UTF-8 ≤ 75 octets verificados en pruebas).
 * - DTSTAMP y LAST-MODIFIED derivan de match.updatedAt (datos persistidos),
 *   nunca de la hora del build → salida determinista.
 * - Horas confirmadas en UTC con «Z» (el offset de los datos ya es el de
 *   Europe/Madrid y la validación lo comprueba, incluido el horario de verano).
 * - Eventos de día completo con DTEND exclusivo del día siguiente.
 * - Sin alarmas, sin asistentes, sin invitaciones (METHOD:PUBLISH).
 * - Orden determinista: por instante efectivo y, en empate, por id.
 */

import ical, { ICalCalendarMethod, ICalEventStatus } from 'ical-generator';
import { config } from '../config';
import type { Dataset, Match } from '../data/schema';
import {
  addMinutes,
  dateOnlyToUtcMidnight,
  isValidDateOnly,
  nextDateOnly,
  parseIsoWithOffset,
} from './datetime';

interface EventPlan {
  match: Match;
  allDay: boolean;
  start: Date;
  end: Date;
  status: ICalEventStatus;
  summary: string;
  description: string;
  location?: string;
  url?: string;
}

function durationPhrase(): string {
  const minutes = config.matchDurationMinutes;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  return `${minutes} minutos`;
}

/** Hora local (wall time) de un ISO con offset, sin dependencias de locale. */
function wallTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function statusLines(match: Match, dataset: Dataset): string[] {
  const lines: string[] = [`Competición: ${match.competition}.`];
  lines.push(
    match.homeTeam === config.teamName
      ? `${config.teamName} juega como local.`
      : `${config.teamName} juega como visitante.`,
  );

  if (match.matchStatus === 'cancelled') {
    lines.push(
      'Estado: partido cancelado; el evento se conserva en el calendario para que los suscriptores lo vean actualizado.',
    );
  }

  if (match.matchStatus === 'postponed' && match.lastPublishedStart) {
    lines.push(
      `APLAZADO: la fecha anterior publicada (${wallTime(match.lastPublishedStart)}, ` +
        'hora peninsular española) ya no es válida; nueva fecha por confirmar.',
    );
  }

  if (match.start) {
    lines.push(
      `Inicio: ${wallTime(match.start)} (hora peninsular española). ` +
        `La hora de finalización es estimada (duración orientativa: ${durationPhrase()}).`,
    );
  } else if (match.date) {
    lines.push(
      `Día: ${match.date}. Hora por confirmar (evento de día completo).`,
    );
  }

  if (match.notes) {
    lines.push(`Notas: ${match.notes}`);
  }
  if (match.sourceUrl) {
    lines.push(`Fuente: ${match.sourceUrl}`);
  }
  if (dataset.meta.demo) {
    lines.push(
      'Datos de demostración: ejemplos ficticios; este calendario no corresponde a partidos reales.',
    );
  }
  return lines;
}

function planEvent(match: Match, dataset: Dataset): EventPlan | null {
  const summaryBase = `${match.homeTeam} – ${match.awayTeam}`;
  const location = match.venue;
  const url = match.sourceUrl;

  if (match.start) {
    const parsed = parseIsoWithOffset(match.start);
    if (!parsed) return null; // la validación lo impide; defensa ante futuros cambios
    const cancelled = match.matchStatus === 'cancelled';
    const summary = cancelled ? `CANCELADO: ${summaryBase}` : summaryBase;
    return {
      match,
      allDay: false,
      start: parsed.date,
      end: addMinutes(parsed.date, config.matchDurationMinutes),
      status: cancelled ? ICalEventStatus.CANCELLED : ICalEventStatus.CONFIRMED,
      summary,
      description: statusLines(match, dataset).join('\n'),
      location,
      url,
    };
  }

  if (match.date) {
    if (!isValidDateOnly(match.date)) return null;
    const cancelled = match.matchStatus === 'cancelled';
    const summary = cancelled ? `CANCELADO: ${summaryBase}` : summaryBase;
    return {
      match,
      allDay: true,
      start: dateOnlyToUtcMidnight(match.date),
      end: dateOnlyToUtcMidnight(nextDateOnly(match.date)),
      status: cancelled ? ICalEventStatus.CANCELLED : ICalEventStatus.CONFIRMED,
      summary,
      description: statusLines(match, dataset).join('\n'),
      location,
      url,
    };
  }

  if (match.lastPublishedStart && match.matchStatus === 'postponed') {
    const parsed = parseIsoWithOffset(match.lastPublishedStart);
    if (!parsed) return null;
    return {
      match,
      allDay: false,
      start: parsed.date,
      end: addMinutes(parsed.date, config.matchDurationMinutes),
      // El ancla conserva la identidad del evento, pero la fecha anterior
      // queda inequívocamente invalidada (STATUS:CANCELLED + texto).
      status: ICalEventStatus.CANCELLED,
      summary: `APLAZADO: ${summaryBase}`,
      description: statusLines(match, dataset).join('\n'),
      location,
      url,
    };
  }

  // Sin fecha publicada jamás → solo en la web, sin entrada en el ICS.
  return null;
}

/** Construye el contenido completo del archivo .ics. */
export function buildIcs(dataset: Dataset): string {
  const calendar = ical({
    prodId: config.prodId,
    name: config.calendarName,
    description: config.calendarDescription,
    method: ICalCalendarMethod.PUBLISH,
    scale: 'GREGORIAN',
    ttl: config.refreshHintSeconds,
  });

  // Planificación única + orden determinista (instante efectivo, luego id).
  const plans = dataset.matches
    .map((match) => ({ match, plan: planEvent(match, dataset) }))
    .filter(
      (entry): entry is { match: Match; plan: EventPlan } => entry.plan !== null,
    )
    .sort((a, b) => {
      const ta = a.plan.start.getTime();
      const tb = b.plan.start.getTime();
      if (ta !== tb) return ta - tb;
      if (a.match.id === b.match.id) return 0;
      return a.match.id < b.match.id ? -1 : 1;
    });

  for (const { match, plan } of plans) {
    // DTSTAMP y LAST-MODIFIED proceden de updatedAt (dato persistido).
    const persisted = new Date(`${match.updatedAt}T00:00:00Z`);

    calendar.createEvent({
      id: `${match.id}@${config.uidNamespace}`,
      start: plan.start,
      end: plan.end,
      allDay: plan.allDay,
      stamp: persisted,
      lastModified: persisted,
      sequence: match.sequence,
      status: plan.status,
      summary: plan.summary,
      description: plan.description,
      ...(plan.location !== undefined ? { location: plan.location } : {}),
      ...(plan.url !== undefined ? { url: plan.url } : {}),
    });
  }

  const out = calendar.toString();
  return out.endsWith('\r\n') ? out : `${out}\r\n`;
}
