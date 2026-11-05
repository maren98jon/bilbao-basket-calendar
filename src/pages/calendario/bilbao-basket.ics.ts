import type { APIRoute } from 'astro';
import { buildIcs } from '../../lib/ics';
import { dataset } from '../../data/dataset';

/**
 * Feed público del calendario. Ruta estable sin temporada.
 * En la generación estática solo se conserva el cuerpo; el Content-Type
 * correcto lo garantiza public/_headers en Cloudflare Pages (y Astro en dev).
 */
export const GET: APIRoute = () =>
  new Response(buildIcs(dataset), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
