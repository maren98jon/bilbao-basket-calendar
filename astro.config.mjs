// @ts-check
import { defineConfig } from 'astro/config';

/**
 * Generación estática. La URL pública se configura mediante PUBLIC_SITE_URL
 * (ver .env.example). En producción, la ausencia de la variable detiene el
 * build (ver src/config.ts).
 */
export default defineConfig({
  output: 'static',
  site: process.env.PUBLIC_SITE_URL || undefined,
  build: {
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
});
