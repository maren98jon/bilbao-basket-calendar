/** Fixtures compartidos para las pruebas. */

import type { Dataset, Match, Meta } from '../src/data/schema';

export const TEAM = 'Bilbao Basket';

export function makeMeta(overrides?: Partial<Meta>): Meta {
  return {
    lastReviewedAt: '2026-11-05',
    seasons: ['2026-27'],
    demo: false,
    ...overrides,
  };
}

export function makeMatch(overrides?: Partial<Match>): Match {
  return {
    id: 'm-001',
    season: '2026-27',
    competition: 'Liga Test',
    homeTeam: TEAM,
    awayTeam: 'Rival Ficticio',
    start: '2026-12-05T18:30:00+01:00',
    scheduleStatus: 'confirmed',
    matchStatus: 'scheduled',
    updatedAt: '2026-11-01',
    sequence: 0,
    ...overrides,
  };
}

export function makeDataset(
  matches: Match[],
  metaOverrides?: Partial<Meta>,
): Dataset {
  return { meta: makeMeta(metaOverrides), matches };
}

/** Deep clone para simular revisiones de datos. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
