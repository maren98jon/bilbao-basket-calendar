import { describe, expect, it } from 'vitest';
import { httpsCalendarUrl, webcalUrlFrom } from '../src/lib/urls';

describe('URLs de suscripción', () => {
  it('construye la URL HTTPS del ICS', () => {
    expect(
      httpsCalendarUrl('https://calendario.ejemplo.com', '/calendario/bilbao-basket.ics'),
    ).toBe('https://calendario.ejemplo.com/calendario/bilbao-basket.ics');
  });

  it('evita barras dobles cuando la URL pública termina en barra', () => {
    expect(
      httpsCalendarUrl('https://calendario.ejemplo.com/', '/calendario/bilbao-basket.ics'),
    ).toBe('https://calendario.ejemplo.com/calendario/bilbao-basket.ics');
  });

  it('acepta rutas sin barra inicial', () => {
    expect(
      httpsCalendarUrl('https://calendario.ejemplo.com', 'calendario/bilbao-basket.ics'),
    ).toBe('https://calendario.ejemplo.com/calendario/bilbao-basket.ics');
  });

  it('deriva la URL webcal:// para Apple Calendar', () => {
    const https = httpsCalendarUrl(
      'https://calendario.ejemplo.com',
      '/calendario/bilbao-basket.ics',
    );
    expect(webcalUrlFrom(https)).toBe(
      'webcal://calendario.ejemplo.com/calendario/bilbao-basket.ics',
    );
  });

  it('la ruta pública del calendario no incluye la temporada', () => {
    const https = httpsCalendarUrl('https://x.example', '/calendario/bilbao-basket.ics');
    expect(https).not.toMatch(/2026|2027|temporada/i);
    expect(webcalUrlFrom(https)).not.toMatch(/2026|2027|temporada/i);
  });
});
