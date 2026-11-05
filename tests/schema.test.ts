import { describe, expect, it } from 'vitest';
import {
  DatasetValidationError,
  parseDataset,
  type Dataset,
  type Match,
} from '../src/data/schema';
import { makeDataset, makeMatch, TEAM } from './helpers';

const options = { teamName: TEAM };

function expectErrors(data: unknown): string[] {
  try {
    parseDataset(data, options);
  } catch (error) {
    if (error instanceof DatasetValidationError) return error.errors;
    throw error;
  }
  throw new Error('Se esperaba un error de validación, pero la validación pasó.');
}

describe('parseDataset: casos válidos', () => {
  it('acepta un conjunto de datos correcto', () => {
    const data = makeDataset([
      makeMatch(),
      makeMatch({
        id: 'm-002',
        date: '2026-11-29',
        start: undefined,
        scheduleStatus: 'time-tbc',
      }),
    ]);
    const parsed = parseDataset(data, options);
    expect(parsed.matches).toHaveLength(2);
    expect(parsed.meta.demo).toBe(false);
  });

  it('acepta aplazados sin fecha con ancla y sin ancla', () => {
    const data = makeDataset([
      makeMatch({
        id: 'm-post',
        start: undefined,
        scheduleStatus: 'date-tbc',
        matchStatus: 'postponed',
        sequence: 2,
        lastPublishedStart: '2026-11-21T16:00:00+01:00',
      }),
      makeMatch({
        id: 'm-post-sin-ancla',
        start: undefined,
        scheduleStatus: 'date-tbc',
        matchStatus: 'postponed',
      }),
    ]);
    expect(() => parseDataset(data, options)).not.toThrow();
  });

  it('acepta un partido cancelado conservando su horario', () => {
    const data = makeDataset([
      makeMatch({ matchStatus: 'cancelled', sequence: 3 }),
    ]);
    expect(() => parseDataset(data, options)).not.toThrow();
  });
});

describe('parseDataset: errores que deben detener el build', () => {
  it('detecta ids duplicados', () => {
    const errors = expectErrors(
      makeDataset([makeMatch(), makeMatch()]),
    );
    expect(errors.join('\n')).toContain('id duplicado');
  });

  it('detecta fechas de calendario inválidas', () => {
    const errors = expectErrors(
      makeDataset([
        makeMatch({
          date: '2026-02-30',
          start: undefined,
          scheduleStatus: 'time-tbc',
        }),
      ]),
    );
    expect(errors.join('\n')).toContain('«date»');
  });

  it('rechaza start sin offset explícito', () => {
    const errors = expectErrors(
      makeDataset([makeMatch({ start: '2026-12-05T18:30:00' })]),
    );
    expect(errors.join('\n')).toContain('offset explícito');
  });

  it('rechaza start con offset de invierno en verano (horario de verano)', () => {
    const errors = expectErrors(
      makeDataset([makeMatch({ start: '2026-07-05T18:30:00+01:00' })]),
    );
    expect(errors.join('\n')).toContain('Europe/Madrid');
  });

  it('rechaza start con offset de verano en invierno', () => {
    const errors = expectErrors(
      makeDataset([makeMatch({ start: '2026-12-05T18:30:00+02:00' })]),
    );
    expect(errors.join('\n')).toContain('Europe/Madrid');
  });

  it('rechaza confirmed sin start', () => {
    const errors = expectErrors(
      makeDataset([
        makeMatch({ start: undefined, scheduleStatus: 'confirmed' }),
      ]),
    );
    expect(errors.join('\n')).toContain('date-tbc');
  });

  it('rechaza time-tbc con start', () => {
    const errors = expectErrors(
      makeDataset([makeMatch({ scheduleStatus: 'time-tbc' })]),
    );
    expect(errors.join('\n')).toContain('«start»');
  });

  it('rechaza date-tbc con date', () => {
    const errors = expectErrors(
      makeMatchDateTbcWithDate(),
    );
    expect(errors.join('\n')).toContain('time-tbc');
  });

  it('rechaza postponed con nueva fecha (debe volver a scheduled)', () => {
    const errors = expectErrors(
      makeDataset([
        makeMatch({ matchStatus: 'postponed', sequence: 1 }),
      ]),
    );
    expect(errors.join('\n')).toContain('postponed');
  });

  it('rechaza start y date a la vez', () => {
    const errors = expectErrors(
      makeDataset([makeMatch({ date: '2026-12-05' })]),
    );
    expect(errors.join('\n')).toContain('mutuamente excluyentes');
  });

  it('rechaza finished sin día conocido', () => {
    const errors = expectErrors(
      makeDataset([
        makeMatch({
          start: undefined,
          scheduleStatus: 'date-tbc',
          matchStatus: 'finished',
        }),
      ]),
    );
    expect(errors.join('\n')).toContain('finished');
  });

  it('rechaza partidos sin el Bilbao Basket', () => {
    const errors = expectErrors(
      makeDataset([
        makeMatch({ homeTeam: 'Uno FC', awayTeam: 'Dos FC' }),
      ]),
    );
    expect(errors.join('\n')).toContain('Bilbao Basket');
  });

  it('rechaza sequence inválida', () => {
    for (const sequence of [-1, 1.5, Number.NaN, '2' as unknown as number]) {
      const errors = expectErrors(makeDataset([makeMatch({ sequence })]));
      expect(errors.join('\n')).toContain('sequence');
    }
  });

  it('rechaza campos obligatorios ausentes', () => {
    const broken = makeMatch() as Partial<Match>;
    delete broken.updatedAt;
    delete broken.competition;
    const errors = expectErrors(
      makeDataset([broken as unknown as Match]),
    );
    expect(errors.join('\n')).toContain('updatedAt');
    expect(errors.join('\n')).toContain('competition');
  });

  it('rechaza metadatos de revisión inválidos', () => {
    const errors = expectErrors(
      makeDataset([makeMatch()], { lastReviewedAt: 'ayer' }),
    );
    expect(errors.join('\n')).toContain('lastReviewedAt');
  });

  it('rechaza seasons vacías y demo no booleana', () => {
    const data = makeDataset([makeMatch()], { seasons: [] });
    (data.meta as { demo: unknown }).demo = 'sí';
    const errors = expectErrors(data);
    expect(errors.join('\n')).toContain('seasons');
    expect(errors.join('\n')).toContain('demo');
  });

  it('rechaza una season que no está en meta.seasons', () => {
    const errors = expectErrors(
      makeDataset([makeMatch({ season: '2025-26' })]),
    );
    expect(errors.join('\n')).toContain('meta.seasons');
  });

  it('rechaza lastPublishedStart fuera de postponed', () => {
    const errors = expectErrors(
      makeDataset([
        makeMatch({ lastPublishedStart: '2026-11-21T16:00:00+01:00' }),
      ]),
    );
    expect(errors.join('\n')).toContain('lastPublishedStart');
  });

  it('rechaza lastPublishedStart conviviendo con start', () => {
    const errors = expectErrors(
      makeDataset([
        makeMatch({ lastPublishedStart: '2026-11-21T16:00:00+01:00' }),
      ]),
    );
    expect(errors.join('\n')).toContain('lastPublishedStart');
    expect(errors.join('\n')).toContain('postponed');
  });

  it('rechaza claves desconocidas (errores de tipografía)', () => {
    const bad = { ...makeMatch(), scheduleStatu: 'confirmed' };
    const errors = expectErrors(makeDataset([bad as unknown as Match]));
    expect(errors.join('\n')).toContain('clave desconocida');
    expect(errors.join('\n')).toContain('scheduleStatu');
  });

  it('acumula varios errores en una sola excepción', () => {
    const errors = expectErrors(
      makeDataset([
        makeMatch(),
        makeMatch({ start: 'sin-fecha' }),
        makeMatch({ id: 'm-003', sequence: -3 }),
      ]),
    );
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

function makeMatchDateTbcWithDate(): Dataset {
  return makeDataset([
    makeMatch({
      date: '2026-11-29',
      start: undefined,
      scheduleStatus: 'date-tbc',
    }),
  ]);
}
