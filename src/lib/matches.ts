/**
 * Clasificación de los partidos para la web (próximos, sin fecha, histórico).
 * El «próximo» se calcula en el momento del build; la web es estática.
 */

import type { Dataset, Match } from '../data/schema';
import { dateOnlyToUtcMidnight, madridDateOnly, parseIsoWithOffset } from './datetime';

export interface MatchesView {
  /** Siguiente partido disputable con fecha publicada (excluye cancelados). */
  next: Match | null;
  /** Partidos con fecha a partir de ahora (incluye cancelados futuros, con aviso). */
  upcoming: Match[];
  /** Sin día publicado: «date-tbc» o aplazados. */
  undated: Match[];
  /** Histórico: finalizados y fechas pasadas. */
  past: Match[];
  /** Competiciones presentes en upcoming (para los filtros). */
  competitions: string[];
}

/** Instante UTC asociado a un partido, o null si no tiene fechas publicadas. */
export function effectiveInstant(match: Match): number | null {
  if (match.start) {
    return parseIsoWithOffset(match.start)?.date.getTime() ?? null;
  }
  if (match.date) {
    return dateOnlyToUtcMidnight(match.date).getTime();
  }
  if (match.lastPublishedStart) {
    return parseIsoWithOffset(match.lastPublishedStart)?.date.getTime() ?? null;
  }
  return null;
}

function byInstantAsc(a: Match, b: Match): number {
  const ia = effectiveInstant(a) ?? Number.POSITIVE_INFINITY;
  const ib = effectiveInstant(b) ?? Number.POSITIVE_INFINITY;
  if (ia !== ib) return ia - ib;
  return compareIds(a.id, b.id);
}

function byInstantDesc(a: Match, b: Match): number {
  const ia = effectiveInstant(a) ?? Number.NEGATIVE_INFINITY;
  const ib = effectiveInstant(b) ?? Number.NEGATIVE_INFINITY;
  if (ia !== ib) return ib - ia;
  return compareIds(a.id, b.id);
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function buildMatchesView(dataset: Dataset, now: Date): MatchesView {
  const today = madridDateOnly(now);
  const nowMs = now.getTime();

  const upcoming: Match[] = [];
  const undated: Match[] = [];
  const past: Match[] = [];

  for (const m of dataset.matches) {
    if (m.matchStatus === 'finished') {
      past.push(m);
      continue;
    }
    // Sin día publicado o aplazado → sección «sin fecha».
    if (m.scheduleStatus === 'date-tbc' || m.matchStatus === 'postponed') {
      undated.push(m);
      continue;
    }
    let isPast: boolean;
    if (m.date && !m.start) {
      isPast = m.date < today;
    } else {
      const instant = effectiveInstant(m);
      isPast = instant !== null && instant < nowMs;
    }
    (isPast ? past : upcoming).push(m);
  }

  upcoming.sort(byInstantAsc);
  past.sort(byInstantDesc);
  undated.sort((a, b) => compareIds(a.id, b.id));

  const next = upcoming.find((m) => m.matchStatus === 'scheduled') ?? null;

  const competitions: string[] = [];
  for (const m of upcoming) {
    if (!competitions.includes(m.competition)) competitions.push(m.competition);
  }
  competitions.sort(compareIds);

  return { next, upcoming, undated, past, competitions };
}

/** `true` si el partido genera entrada en el feed ICS. */
export function hasIcsEntry(match: Match): boolean {
  return Boolean(match.start ?? match.date ?? match.lastPublishedStart);
}

/** Lado del Bilbao Basket en un partido. */
export function bilbaoSide(match: Match, teamName: string): 'local' | 'visitante' {
  return match.homeTeam === teamName ? 'local' : 'visitante';
}
