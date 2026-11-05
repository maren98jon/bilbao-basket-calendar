/**
 * Comprobación responsive con Chromium (Playwright).
 * Uso: npm run build && npm run check:responsive
 * (requiere el servidor de previsualización en http://localhost:4321)
 *
 * NO sustituye pruebas en Safari/iOS ni Chrome/Android reales.
 */
import { chromium } from 'playwright';

const BASE = process.env.CHECK_URL ?? 'http://localhost:4321';

const VIEWPORTS = [
  { name: '320 (mínimo)', width: 320, height: 568 },
  { name: '375 (iPhone clásico)', width: 375, height: 667 },
  { name: '390 (iPhone moderno)', width: 390, height: 844 },
  { name: '768 (tablet vertical)', width: 768, height: 1024 },
  { name: '1280 (escritorio)', width: 1280, height: 800 },
  { name: '844x390 (móvil horizontal)', width: 844, height: 390 },
  { name: '667x375 (móvil horizontal pequeño)', width: 667, height: 375 },
];

const results = [];

function record(ok, label, detail = '') {
  results.push({ ok, label, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}${detail ? ` (${detail})` : ''}`);
}

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: 'es-ES',
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: BASE,
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // 1. Sin scroll horizontal
  const scroll = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  record(
    scroll.doc <= scroll.client + 1,
    `${vp.name}: sin scroll horizontal`,
    `scrollWidth=${scroll.doc} clientWidth=${scroll.client}`,
  );

  // 2. Botones con área táctil ≥ 44 px
  const smallButtons = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.btn, summary, .chip span').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return; // ocultos
      if (r.height < 44 - 0.5) {
        out.push(`${el.tagName}.${el.className}: ${Math.round(r.height)}px`);
      }
    });
    return out;
  });
  record(
    smallButtons.length === 0,
    `${vp.name}: controles ≥ 44 px de alto`,
    smallButtons.join(', ') || 'ok',
  );

  // 3. Próximo partido y suscripción al principio
  const layout = await page.evaluate(() => {
    const next = document.querySelector('.next-match');
    const firstAction = document.querySelector('.actions .btn');
    const header = document.querySelector('.site-header');
    return {
      nextY: next ? Math.round(next.getBoundingClientRect().top + window.scrollY) : null,
      actionY: firstAction
        ? Math.round(firstAction.getBoundingClientRect().top + window.scrollY)
        : null,
      headerH: header ? Math.round(header.getBoundingClientRect().height) : 0,
    };
  });
  record(
    layout.nextY !== null && layout.nextY < 500,
    `${vp.name}: el próximo partido empieza antes de 500 px`,
    `y=${layout.nextY}`,
  );
  record(
    layout.actionY !== null && layout.actionY < 1200,
    `${vp.name}: los botones de suscripción están en la primera pantalla+`,
    `y=${layout.actionY}`,
  );

  // 4. Filtros: aplicar y limpiar
  if (vp.width < 900) {
    await page.locator('.chip', { hasText: 'Local' }).first().click();
    await page.waitForTimeout(50);
    const count = await page.locator('[data-filter-count]').textContent();
    record(
      !!count && !count.includes('de 0'),
      `${vp.name}: filtro «Local» actualiza el contador`,
      count ?? '',
    );
    await page.locator('[data-clear-filters]').click();
    await page.waitForTimeout(50);
    const reset = await page.locator('[data-filter-count]').textContent();
    record(
      !!reset && /Mostrando \d+ de \d+/.test(reset),
      `${vp.name}: «Limpiar filtros» restaura el contador`,
      reset ?? '',
    );
  }

  // 5. Copiar enlace (API de portapapeles con fallback)
  await page.locator('[data-copy-target]').click();
  await page.waitForTimeout(150);
  const status = (await page.locator('[data-copy-status]').textContent()) ?? '';
  record(
    status.length > 0,
    `${vp.name}: el botón de copiar informa del resultado`,
    status.slice(0, 60),
  );

  // 6. Desplegables accesibles con teclado
  const summary = page.locator('summary').first();
  await summary.focus();
  await page.keyboard.press('Enter');
  const open = await page.locator('details').first().evaluate((d) => d.open);
  record(open, `${vp.name}: «Enter» abre un desplegable`);

  await context.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas.`);
if (failed.length > 0) {
  console.log('Fallas:');
  for (const f of failed) console.log(` - ${f.label}: ${f.detail}`);
  process.exit(1);
}
