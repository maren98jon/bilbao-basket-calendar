# Pruebas manuales

Guía de verificación de la web y del feed ICS. Distingue tres bloques:

- **Ejecutado automáticamente** — resultado reproducible con un comando.
- **Verificado visualmente** — revisión humana de capturas reales del navegador.
- **Pendiente** — requiere dispositivos/clientes reales; **no se ha probado todavía**.

Comandos (desde la raíz del proyecto):

```bash
npm install
npm test                # 72 pruebas (datos, fechas, ICS, URLs)
npm run check           # TypeScript + Astro (0 errores)
PUBLIC_SITE_URL=https://calendario.ejemplo.com npm run build
npm run preview         # http://localhost:4321
npm run check:responsive  # Chromium/Playwright en 320/375/390/768/1280 + horizontal
```

---

## A. Ejecutado automáticamente (estado: ✅ verde)

| # | Comando | Estado |
| --- | --- | --- |
| A1 | `npm test` | ✅ 72/72 |
| A2 | `npm run check` | ✅ 0 errores, 0 warnings (1 hint: `document.execCommand`, fallback intencional) |
| A3 | `PUBLIC_SITE_URL=… npm run build` | ✅ correcto |
| A4 | `PUBLIC_SITE_URL=` (sin valor) en build de producción | ✅ falla con `[config] Falta PUBLIC_SITE_URL en producción…` |

Cobertura relevante de `npm test`:

- Validación estricta del JSON: claves desconocidas, duplicados, coherencia `scheduleStatus`/`matchStatus`, offsets DST de Europe/Madrid.
- UID estables: idénticos al cambiar `PUBLIC_SITE_URL`; dependen de `uidNamespace` + `id`.
- ICS: solo CRLF, plegado ≤75 octets UTF-8, escapado RFC 5545, `STATUS:CANCELLED` en cancelados/aplazados, prefijos `CANCELADO:`/`APLAZADO:`, `SEQUENCE`, `DTSTAMP`/`LAST-MODIFIED` de fechas persistidas, determinismo de bytes con hora simulada.
- Reanálisis con parser independiente (`node-ical`): eventos, all-day + `DTEND` exclusivo.
- URLs: `webcal://`, `https://`, enlace de Google, ausencia de `localhost` con `PUBLIC_SITE_URL` de producción.

## B. Responsive real con Chromium (estado: ✅ verde)

`npm run check:responsive` — 54/54 PASS en 320, 375, 390, 768, 1280 px y landscape 844×390 / 667×375:

- Sin scroll horizontal en ninguna de esas anchuras.
- Controles (filtros, botones de suscripción, copiar) con área ≥ 44×44 px.
- «Próximo partido» visible sin scroll (y=288 en móvil) — primero de la página.
- Botones «Suscribirse en Apple Calendar» y «Añadir en Google Calendar» visibles.
- Filtros de competición y local/visitante funcionan; «Limpiar filtros» restaura el contador.
- Botón «Copiar enlace» informa: `Enlace copiado al portapapeles.`
- `<details>` de suscripción responden a Enter.
- Zoom de texto (viewport sin bloquear zoom) permitido por el navegador.

## C. Verificación visual de capturas (estado: ✅ hecho)

Revisión de capturas reales (`/tmp/shots/`): `mobile-top.png`, `mobile-full.png`, `desktop-top.png`, `desktop-full.png`.

- Móvil: banner de demostración, próximo partido a tope de página, suscripción compacta, listado con estados (cancelado, hora por confirmar, aplazado), sin fecha, histórico plegado, FAQ, footer.
- Escritorio (1280 px): dos columnas (próximo partido + suscripción), URL larga del feed ajustada con botón de copiar, mismo contenido completo sin solapes.
- Los metadatos del próximo partido (`Competición`, `Bilbao Basket`, `Recinto`, `Horario`) se renderizan en una sola línea (medido: 22 px de alto) — sin problemas de salto de línea.

## D. Pruebas manuales en navegador (pendiente de repetir en producción)

Hechas en local con datos de demostración; **repetir tras el despliegue real**:

| # | Paso | Esperado | Estado local |
| --- | --- | --- | --- |
| 1 | Abrir `/` sin datos de sesión | Próximo partido el primero de la página | ✅ |
| 2 | Navegar con 320/375/390 px | Sin scroll horizontal; zoom activo | ✅ |
| 3 | Tocar filtros (competición, local/visitante) | Lista y contador cambian | ✅ |
| 4 | Pulsar «Copiar enlace» | Aviso `Enlace copiado al portapapeles.` | ✅ |
| 5 | Abrir desplegables de suscripción (Enter/tap) | Se despliegan con instrucciones | ✅ |
| 6 | Descargar `.ics` | Archivo descargado y parseable | ✅ |
| 7 | `curl -sI …/calendario/bilbao-basket.ics` | `Content-Type: text/calendar; charset=utf-8` | ✅ |
| 8 | Abrir el ICS | Sin `localhost`; UID/SEQUENCE/STATUS correctos | ✅ |
| 9 | `/robots.txt` en modo demo | `Disallow: /` | ✅ |
| 10 | `/robots.txt` con datos reales | Sin `Disallow` | ✅ |
| 11 | `/sitemap.xml` con datos reales | `urlset` con la URL canónica | ✅ |
| 12 | Ruta inexistente | 404 con navegación utilizable | ✅ |
| 13 | Verificación final tras despliegue | Todo lo anterior sobre el dominio real | pendiente |

## E. Suscripción real en clientes (PENDIENTE — no verificado)

> **No se ha probado en dispositivos ni aplicaciones reales.** Pendiente en el despliegue definitivo.

| # | Paso | Esperado |
| --- | --- | --- |
| 1 | **macOS**: «Suscribirse en Apple Calendar» | Se abre Calendar en modo suscripción (`webcal://`) y confirma. |
| 2 | macOS: actualizar calendario (⌘R) | Los eventos aparecen/actualizan. |
| 3 | **iOS**: Ajustes → Calendario → Suscripciones → pegar URL `https://…` | Se suscribe y lista los partidos. |
| 4 | **Google escritorio**: «Añadir en Google Calendar» → «Desde URL» → pegar | Crea el calendario `Bilbao Basket — partidos`. |
| 5 | Cambiar un partido (hora + `sequence`), desplegar | Google/Apple reemplazan el evento en ≤24–48 h. |
| 6 | Aplazar un partido (`postponed` + `lastPublishedStart`) | El suscriptor ve el evento cancelado/marcado como aplazado, **sin duplicados**. |
| 7 | Cancelar un partido | `STATUS:CANCELLED` visible en el cliente. |

## F. Pendiente: navegador/dispositivos reales (NO verificado)

Estas comprobaciones **no se han ejecutado**; deberían hacerse antes de dar el proyecto por publicado:

- [ ] **Safari en macOS**: render, `webcal://`, suscripción real.
- [ ] **Safari/iOS en iPhone** (320/375/390 px reales): maquetación, zoom, suscripción.
- [ ] **Chrome en Android**: maquetación, `webcal://`/descarga del ICS, suscripción desde URL.
- [ ] **Firefox/Edge** (escritorio): render y descarga del ICS.
- [ ] Lectores ICS alternativos (Outlook, Thunderbird) si se quiere ampliar el soporte.

## G. Resumen de estado

| Bloque | Estado |
| --- | --- |
| Pruebas unitarias | ✅ 73/73 |
| Tipos (`astro check`) | ✅ 0 errores |
| Build producción (+ sin `PUBLIC_SITE_URL`) | ✅ |
| Responsive Chromium 320–1280 + horizontal | ✅ 54/54 |
| Datos reales cargados (`meta.demo: false`) | ✅ (40 partidos: 34 ACB + 6 BCL) |
| Revisión visual de capturas móvil/escritorio | ✅ |
| Flujo local de descarga/URL del ICS | ✅ |
| Suscripción real Apple/Google | ⏳ pendiente |
| Safari/iOS, Chrome/Android reales | ⏳ pendiente |
| Verificación sobre el dominio de producción | ⏳ pendiente |
