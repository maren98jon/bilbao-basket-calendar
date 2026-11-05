import type { APIRoute } from 'astro';
import { absoluteUrl } from '../config';
import { dataset } from '../data/dataset';

/**
 * robots.txt dinámico:
 * - demostración → no se indexa nada (los datos son ficticios);
 * - producción → se permite y se publica el sitemap.
 */
export const GET: APIRoute = () => {
  const body = dataset.meta.demo
    ? 'User-agent: *\nDisallow: /\n'
    : [
        'User-agent: *',
        'Allow: /',
        '',
        `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
        '',
      ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
