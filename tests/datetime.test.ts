import { describe, expect, it } from 'vitest';
import {
  addMinutes,
  dateOnlyToUtcMidnight,
  formatUtcBasic,
  isValidDateOnly,
  madridDateOnly,
  madridOffsetMs,
  nextDateOnly,
  offsetMismatchesMadrid,
  parseIsoWithOffset,
} from '../src/lib/datetime';

describe('parseIsoWithOffset', () => {
  it('convierte correctamente en invierno (CET, +01:00)', () => {
    const parsed = parseIsoWithOffset('2026-12-05T18:30:00+01:00');
    expect(parsed).not.toBeNull();
    expect(parsed?.date.toISOString()).toBe('2026-12-05T17:30:00.000Z');
    expect(parsed?.offsetMs).toBe(3_600_000);
  });

  it('convierte correctamente en verano (CEST, +02:00)', () => {
    const parsed = parseIsoWithOffset('2026-07-05T18:30:00+02:00');
    expect(parsed).not.toBeNull();
    expect(parsed?.date.toISOString()).toBe('2026-07-05T16:30:00.000Z');
    expect(parsed?.offsetMs).toBe(7_200_000);
  });

  it('acepta el sufijo Z', () => {
    const parsed = parseIsoWithOffset('2026-12-05T17:30:00Z');
    expect(parsed?.date.toISOString()).toBe('2026-12-05T17:30:00.000Z');
    expect(parsed?.offsetMs).toBe(0);
  });

  it('acepta horas sin segundos', () => {
    const parsed = parseIsoWithOffset('2026-12-05T18:30+01:00');
    expect(parsed?.date.toISOString()).toBe('2026-12-05T17:30:00.000Z');
  });

  it('rechaza fechas de calendario inválidas', () => {
    expect(parseIsoWithOffset('2026-02-30T10:00:00+01:00')).toBeNull();
    expect(parseIsoWithOffset('2026-13-01T10:00:00+01:00')).toBeNull();
    expect(parseIsoWithOffset('2026-12-05T25:00:00+01:00')).toBeNull();
  });

  it('rechaza cadenas sin offset explícito', () => {
    expect(parseIsoWithOffset('2026-12-05T18:30:00')).toBeNull();
    expect(parseIsoWithOffset('2026-12-05')).toBeNull();
  });
});

describe('madridOffsetMs y offsetMismatchesMadrid', () => {
  it('devuelve +1 h en invierno y +2 h en verano', () => {
    expect(madridOffsetMs(new Date('2026-01-15T12:00:00Z'))).toBe(3_600_000);
    expect(madridOffsetMs(new Date('2026-07-15T12:00:00Z'))).toBe(7_200_000);
  });

  it('detecta offsets incorrectos según la estación', () => {
    const winter = parseIsoWithOffset('2026-12-05T18:30:00+01:00');
    const summer = parseIsoWithOffset('2026-07-05T18:30:00+02:00');
    const winterWrong = parseIsoWithOffset('2026-12-05T18:30:00+02:00');
    const summerWrong = parseIsoWithOffset('2026-07-05T18:30:00+01:00');

    expect(winter && offsetMismatchesMadrid(winter)).toBe(false);
    expect(summer && offsetMismatchesMadrid(summer)).toBe(false);
    expect(winterWrong && offsetMismatchesMadrid(winterWrong)).toBe(true);
    expect(summerWrong && offsetMismatchesMadrid(summerWrong)).toBe(true);
  });
});

describe('isValidDateOnly / nextDateOnly', () => {
  it('valida fechas reales y rechaza inválidas', () => {
    expect(isValidDateOnly('2026-11-29')).toBe(true);
    expect(isValidDateOnly('2026-02-30')).toBe(false);
    expect(isValidDateOnly('2026-11-31')).toBe(false);
    expect(isValidDateOnly('26-11-29')).toBe(false);
    expect(isValidDateOnly('no-fecha')).toBe(false);
  });

  it('calcula el día siguiente (DTEND exclusivo)', () => {
    expect(nextDateOnly('2026-12-05')).toBe('2026-12-06');
    expect(nextDateOnly('2026-11-30')).toBe('2026-12-01');
    expect(nextDateOnly('2026-12-31')).toBe('2027-01-01');
    expect(nextDateOnly('2028-02-28')).toBe('2028-02-29'); // bisiesto
  });

  it('convierte date-only a medianoche UTC', () => {
    expect(dateOnlyToUtcMidnight('2026-12-05').toISOString()).toBe(
      '2026-12-05T00:00:00.000Z',
    );
  });
});

describe('formatUtcBasic / addMinutes / madridDateOnly', () => {
  it('formatea en el formato básico iCalendar', () => {
    expect(formatUtcBasic(new Date('2026-12-05T17:30:00.000Z'))).toBe(
      '20261205T173000Z',
    );
  });

  it('suma duración orientativa', () => {
    expect(addMinutes(new Date('2026-12-05T17:30:00Z'), 120).toISOString()).toBe(
      '2026-12-05T19:30:00.000Z',
    );
  });

  it('devuelve la fecha en Europe/Madrid', () => {
    // 31 de diciembre 2026 23:30 UTC = 1 de enero 2027 en Madrid
    expect(madridDateOnly(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(madridDateOnly(new Date('2026-12-31T22:00:00Z'))).toBe('2026-12-31');
  });
});
