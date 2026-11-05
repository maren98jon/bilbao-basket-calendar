import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseICS, type VEvent } from 'node-ical';
import { buildIcs } from '../src/lib/ics';
import { clone, makeDataset, makeMatch } from './helpers';

function eventsOf(ics: string): VEvent[] {
  const parsed = parseICS(ics);
  return Object.values(parsed).filter(
    (component): component is VEvent =>
      !!component &&
      typeof component === 'object' &&
      component.type === 'VEVENT',
  );
}

function uidsOf(ics: string): string[] {
  return eventsOf(ics)
    .map((e) => e.uid)
    .sort();
}

function findEvent(ics: string, uid: string): VEvent {
  const found = eventsOf(ics).find((e) => e.uid === uid);
  if (!found) throw new Error(`No se encontró el evento ${uid}`);
  return found;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** Muestra variada para las pruebas de estructura (no depende de los datos reales). */
const sample = makeDataset([
  makeMatch({ id: 's-1', start: '2026-12-05T18:30:00+01:00' }),
  makeMatch({ id: 's-2', homeTeam: 'Rival FC', awayTeam: 'Bilbao Basket', start: '2026-12-06T17:00:00+01:00' }),
  makeMatch({ id: 's-3', date: '2026-12-07', start: undefined, scheduleStatus: 'time-tbc' }),
  makeMatch({ id: 's-4', matchStatus: 'finished', start: '2026-11-01T12:00:00+01:00' }),
  makeMatch({ id: 's-5', matchStatus: 'cancelled', start: '2026-12-09T20:00:00+01:00' }),
  makeMatch({ id: 's-6', start: '2027-03-28T17:00:00+02:00' }),
]);

describe('buildIcs: estructura del calendario', () => {
  it('genera un ICS que una librería independiente analiza sin errores', () => {
    const ics = buildIcs(sample);
    const events = eventsOf(ics);
    expect(events.length).toBeGreaterThanOrEqual(5);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//Bilbao Basket Calendario//ES');
    expect(ics).toContain('CALSCALE:GREGORIAN');
    expect(ics).toContain('METHOD:PUBLISH');
    expect(ics).toContain('X-WR-CALNAME:');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });

  it('usa solo CRLF como fin de línea y termina con CRLF', () => {
    const ics = buildIcs(sample);
    expect(/(?<!\r)\n/.test(ics)).toBe(false);
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('no genera alarmas, asistentes ni invitaciones', () => {
    const ics = buildIcs(sample);
    expect(ics).not.toContain('VALARM');
    expect(ics).not.toContain('ATTENDEE');
    expect(ics).not.toContain('ORGANIZER');
    expect(ics).not.toContain('METHOD:REQUEST');
    expect(ics).not.toContain('RSVP');
  });

  it('solo usa valores de STATUS válidos para VEVENT', () => {
    const ics = buildIcs(sample);
    const statuses = [...ics.matchAll(/^STATUS:(\w+)$/gm)].map((m) => m[1]);
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) {
      expect(['CONFIRMED', 'CANCELLED', 'TENTATIVE']).toContain(status);
    }
  });

  it('no contiene URLs localhost (independiente de la URL pública)', () => {
    const ics = buildIcs(sample);
    expect(ics).not.toContain('localhost');
    expect(ics).not.toContain('127.0.0.1');
  });

  it('plega las líneas respetando 75 octets UTF-8', () => {
    const longText =
      'Descripción muy larga con acentos: áéíóú ü ñ — '.repeat(12);
    const ics = buildIcs(
      makeDataset([makeMatch({ notes: longText, id: 'fold-1' })]),
    );
    for (const line of ics.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
    // Tras desplegar, el texto original aparece íntegro.
    const unfolded = ics.replace(/\r\n[ ]/g, '');
    expect(unfolded).toContain(longText);
    expect(eventsOf(ics)).toHaveLength(1);
  });
});

describe('buildIcs: UID estables', () => {
  const base = makeDataset([
    makeMatch({ id: 'uid-1', start: '2026-12-05T18:30:00+01:00' }),
  ]);

  it('deriva el UID del id y el namespace', () => {
    const ics = buildIcs(base);
    expect(uidsOf(ics)).toEqual(['uid-1@bilbao-basket-calendario']);
  });

  it('no cambia el UID al cambiar la fecha u hora', () => {
    const before = buildIcs(base);
    const revised = clone(base);
    revised.matches[0]!.start = '2026-12-06T20:00:00+01:00';
    revised.matches[0]!.updatedAt = '2026-11-05';
    revised.matches[0]!.sequence = 1;
    const after = buildIcs(revised);
    expect(uidsOf(after)).toEqual(uidsOf(before));
    expect(after).toContain('DTSTART:20261206T190000Z');
    expect(after).toContain('SEQUENCE:1');
  });

  it('mantiene los UID aunque cambie la URL pública del sitio', async () => {
    vi.stubEnv('PUBLIC_SITE_URL', 'https://uno.example');
    vi.resetModules();
    const first = await import('../src/lib/ics');
    const firstConfig = await import('../src/config');
    const icsA = first.buildIcs(base);

    vi.stubEnv('PUBLIC_SITE_URL', 'https://dos.example');
    vi.resetModules();
    const second = await import('../src/lib/ics');
    const secondConfig = await import('../src/config');
    const icsB = second.buildIcs(base);

    expect(firstConfig.siteUrl).toBe('https://uno.example');
    expect(secondConfig.siteUrl).toBe('https://dos.example');
    expect(firstConfig.siteUrl).not.toBe(secondConfig.siteUrl);
    expect(uidsOf(icsB)).toEqual(uidsOf(icsA));
  });
});

describe('buildIcs: fechas, revisiones y determinismo', () => {
  it('convierte a UTC teniendo en cuenta el horario de verano e invierno', () => {
    const ics = buildIcs(
      makeDataset([
        makeMatch({ id: 'winter', start: '2026-12-05T18:30:00+01:00' }),
        makeMatch({
          id: 'summer',
          homeTeam: 'Rival Ficticio',
          awayTeam: 'Bilbao Basket',
          start: '2026-07-05T18:30:00+02:00',
        }),
      ]),
    );
    expect(ics).toContain('DTSTART:20261205T173000Z');
    expect(ics).toContain('DTSTART:20260705T163000Z');
  });

  it('usa duración orientativa de dos horas para DTEND', () => {
    const ics = buildIcs(
      makeDataset([makeMatch({ start: '2026-12-05T18:30:00+01:00' })]),
    );
    expect(ics).toContain('DTSTART:20261205T173000Z');
    expect(ics).toContain('DTEND:20261205T193000Z');
    expect(ics).toContain('duración orientativa: 2 horas');
  });

  it('serializa SEQUENCE, DTSTAMP y LAST-MODIFIED desde datos persistidos', () => {
    const ics = buildIcs(
      makeDataset([
        makeMatch({ sequence: 7, updatedAt: '2026-06-15' }),
      ]),
    );
    expect(ics).toContain('SEQUENCE:7');
    expect(ics).toContain('DTSTAMP:20260615T000000Z');
    expect(ics).toContain('LAST-MODIFIED:20260615T000000Z');
  });

  it('refleja los valores actualizados tras modificar una revisión', () => {
    const original = makeDataset([
      makeMatch({ sequence: 0, updatedAt: '2026-06-01', start: '2026-12-05T18:30:00+01:00' }),
    ]);
    const revised = clone(original);
    revised.matches[0]!.sequence = 1;
    revised.matches[0]!.updatedAt = '2026-06-20';
    revised.matches[0]!.start = '2026-12-05T20:00:00+01:00';

    const ics = buildIcs(revised);
    expect(ics).toContain('SEQUENCE:1');
    expect(ics).toContain('LAST-MODIFIED:20260620T000000Z');
    expect(ics).toContain('DTSTAMP:20260620T000000Z');
    expect(ics).toContain('DTSTART:20261205T190000Z');
  });

  it('es determinista: mismos datos y configuración → mismo ICS', () => {
    const data = makeDataset([
      makeMatch({ id: 'a', start: '2026-12-05T18:30:00+01:00' }),
      makeMatch({ id: 'b', start: '2026-12-06T18:30:00+01:00' }),
      makeMatch({ id: 'c', date: '2026-12-07', start: undefined, scheduleStatus: 'time-tbc' }),
    ]);
    const first = buildIcs(data);

    // Aunque la hora del sistema cambie, el ICS no cambia.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-06-01T12:00:00Z'));
    try {
      const second = buildIcs(data);
      expect(second).toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ordena de forma determinista por fecha efectiva y luego por id', () => {
    const data = makeDataset([
      makeMatch({ id: 'z-last', start: '2026-12-10T18:30:00+01:00' }),
      makeMatch({ id: 'a-first', start: '2026-12-05T18:30:00+01:00' }),
      makeMatch({ id: 'm-mid', start: '2026-12-05T18:30:00+01:00' }),
    ]);
    expect(uidsOf(buildIcs(data))).toEqual([
      'a-first@bilbao-basket-calendario',
      'm-mid@bilbao-basket-calendario',
      'z-last@bilbao-basket-calendario',
    ]);
    expect(buildIcs(data)).toBe(buildIcs(data));
  });
});

describe('buildIcs: eventos de día completo', () => {
  const data = makeDataset([
    makeMatch({
      id: 'allday',
      start: undefined,
      date: '2026-11-29',
      scheduleStatus: 'time-tbc',
    }),
  ]);

  it('usa DATE con DTEND exclusivo del día siguiente', () => {
    const ics = buildIcs(data);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261129');
    expect(ics).toContain('DTEND;VALUE=DATE:20261130');
  });

  it('indica «Hora por confirmar» en la descripción', () => {
    const ics = buildIcs(data);
    expect(ics).toContain('Hora por confirmar');
  });

  it('lo analiza la librería independiente como evento de día', () => {
    const event = findEvent(buildIcs(data), 'allday@bilbao-basket-calendario');
    expect(event.datetype).toBe('date');
  });

  it('al confirmar la hora reutiliza el mismo UID', () => {
    const confirmed = clone(data);
    confirmed.matches[0]!.start = '2026-11-29T17:00:00+01:00';
    confirmed.matches[0]!.scheduleStatus = 'confirmed';
    confirmed.matches[0]!.sequence = 1;
    const ics = buildIcs(confirmed);
    expect(uidsOf(ics)).toEqual(['allday@bilbao-basket-calendario']);
    expect(ics).toContain('DTSTART:20261129T160000Z');
    expect(ics).toContain('SEQUENCE:1');
  });
});

describe('buildIcs: cancelaciones y aplazamientos', () => {
  it('conserva los partidos cancelados con STATUS:CANCELLED', () => {
    const ics = buildIcs(
      makeDataset([
        makeMatch({ id: 'c1', matchStatus: 'cancelled', sequence: 3 }),
      ]),
    );
    const event = findEvent(ics, 'c1@bilbao-basket-calendario');
    expect(event.status).toBe('CANCELLED');
    expect(event.summary).toContain('CANCELADO');
    // Conserva el último horario publicado.
    expect(ics).toContain('DTSTART:20261205T173000Z');
  });

  it('trata los aplazados sin fecha conservando identidad e invalidando la fecha', () => {
    const ics = buildIcs(
      makeDataset([
        makeMatch({
          id: 'p1',
          start: undefined,
          scheduleStatus: 'date-tbc',
          matchStatus: 'postponed',
          sequence: 2,
          lastPublishedStart: '2026-11-21T16:00:00+01:00',
        }),
      ]),
    );
    const event = findEvent(ics, 'p1@bilbao-basket-calendario');
    expect(event.status).toBe('CANCELLED');
    expect(event.summary).toContain('APLAZADO');
    expect(event.description).toContain('ya no es válida');
    expect(event.description).toContain('nueva fecha por confirmar');
    // Mantiene el ancla para no perder el UID, pero marcada como no válida.
    expect(ics).toContain('DTSTART:20261121T150000Z');
    expect(event.sequence).toBe('2');
  });

  it('excluye los partidos sin ninguna fecha publicada', () => {
    const ics = buildIcs(
      makeDataset([
        makeMatch({
          id: 'never',
          start: undefined,
          date: undefined,
          scheduleStatus: 'date-tbc',
        }),
        makeMatch({ id: 'with-date', date: '2026-12-05', start: undefined, scheduleStatus: 'time-tbc' }),
      ]),
    );
    expect(uidsOf(ics)).toEqual(['with-date@bilbao-basket-calendario']);
  });

  it('conserva el histórico: no elimina eventos pasados', () => {
    const ics = buildIcs(
      makeDataset([
        makeMatch({
          id: 'old',
          start: '2020-01-10T18:30:00+01:00',
          matchStatus: 'finished',
        }),
      ]),
    );
    expect(uidsOf(ics)).toEqual(['old@bilbao-basket-calendario']);
  });
});

describe('buildIcs: escapado de texto', () => {
  it('escapa comas, punto y coma, barras inversas y saltos de línea', () => {
    const notes = 'Coma, punto; y barra\\ inversa\nsegunda línea';
    const ics = buildIcs(makeDataset([makeMatch({ id: 'esc', notes })]));

    // Se despliega antes de comprobar: el plegado puede partir el texto.
    const unfolded = ics.replace(/\r\n[ ]/g, '');
    expect(unfolded).toContain('Coma\\, punto\\; y barra\\\\ inversa');
    expect(unfolded).toContain('\\nsegunda línea');

    const event = findEvent(ics, 'esc@bilbao-basket-calendario');
    expect(event.description).toContain('Coma, punto; y barra\\ inversa');
    expect(event.description).toContain('segunda línea');
  });

  it('escapa el SUMMARY cuando un equipo lleva comas', () => {
    const ics = buildIcs(
      makeDataset([
        makeMatch({ homeTeam: 'Bilbao Basket', awayTeam: 'Club, El' }),
      ]),
    );
    expect(ics).toContain('SUMMARY:Bilbao Basket – Club\\, El');
  });

  it('preserva texto Unicode en líneas largas plegadas', () => {
    const notes = 'Ñandú y Añoranza — ¡señal! '.repeat(10);
    const ics = buildIcs(makeDataset([makeMatch({ id: 'uni', notes })]));
    const unfolded = ics.replace(/\r\n[ ]/g, '');
    expect(unfolded).toContain(notes);
    for (const line of ics.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });
});

describe('buildIcs: aviso de datos de demostración', () => {
  const demoLike = makeDataset(
    [
      makeMatch({ id: 'demo-ok', start: '2026-12-05T18:30:00+01:00' }),
      makeMatch({
        id: 'demo-sin-fecha',
        start: undefined,
        date: undefined,
        scheduleStatus: 'date-tbc',
      }),
      makeMatch({
        id: 'demo-aplazado',
        start: undefined,
        date: undefined,
        scheduleStatus: 'date-tbc',
        matchStatus: 'postponed',
        lastPublishedStart: '2026-11-21T16:00:00+01:00',
        sequence: 2,
      }),
      makeMatch({
        id: 'demo-cancelado',
        matchStatus: 'cancelled',
        sequence: 3,
      }),
    ],
    { demo: true },
  );

  it('incluye el aviso de demostración en las descripciones', () => {
    expect(demoLike.meta.demo).toBe(true);
    const ics = buildIcs(demoLike);
    expect(ics).toContain('Datos de demostración');
  });

  it('excluye el partido sin fecha y conserva el resto', () => {
    const uids = uidsOf(buildIcs(demoLike));
    expect(uids).not.toContain('demo-sin-fecha@bilbao-basket-calendario');
    expect(uids).toContain('demo-ok@bilbao-basket-calendario');
    expect(uids).toContain('demo-aplazado@bilbao-basket-calendario');
    expect(uids).toContain('demo-cancelado@bilbao-basket-calendario');
  });

  it('marca aplazado y cancelado en el feed', () => {
    const ics = buildIcs(demoLike);
    const postponed = findEvent(ics, 'demo-aplazado@bilbao-basket-calendario');
    const cancelled = findEvent(ics, 'demo-cancelado@bilbao-basket-calendario');
    expect(postponed.status).toBe('CANCELLED');
    expect(postponed.summary).toContain('APLAZADO');
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.summary).toContain('CANCELADO');
  });
});

describe('buildIcs: conjunto de datos real', () => {
  it('se analiza sin errores y contiene los próximos partidos', async () => {
    const { dataset } = await import('../src/data/dataset');
    expect(dataset.meta.demo).toBe(false);
    const uids = uidsOf(buildIcs(dataset));
    expect(uids.length).toBeGreaterThanOrEqual(30);
    expect(uids).toContain('2026-27-acb-j07@bilbao-basket-calendario');
    expect(uids).toContain('2026-27-bcl-r4@bilbao-basket-calendario');
    // La jornada 34 no tiene fecha: no entra en el feed.
    expect(uids).not.toContain('2026-27-acb-j34@bilbao-basket-calendario');
    // Ningún aviso de demostración en el feed real.
    expect(buildIcs(dataset)).not.toContain('Datos de demostración');
  });
});
