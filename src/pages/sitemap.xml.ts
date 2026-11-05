import type { APIRoute } from 'astro';
import { absoluteUrl } from '../config';
import { dataset } from '../data/dataset';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sitemap con las páginas indexables. En modo demostración se publica un
 * sitemap vacío (cero URLs): el sitio está marcado como noindex y
 * robots.txt prohíbe el rastreo, así que no se indexan datos ficticios.
 */
export const GET: APIRoute = () => {
  const urls: string[] = [];
  if (!dataset.meta.demo) {
    urls.push(`  <url><loc>${escapeXml(absoluteUrl('/'))}</loc></url>`);
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
