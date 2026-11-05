# Calendario Bilbao Basket

Web pública, estática y en español para consultar los próximos partidos del Bilbao Basket y suscribirse a un calendario iCalendar (`/calendario/bilbao-basket.ics`) desde Apple Calendar o Google Calendar.

Proyecto independiente, no oficial. No afiliado al club.

## Índice

1. [Qué es y qué no es](#1-qué-es-y-qué-no-es)
2. [Arquitectura](#2-arquitectura)
3. [Requisitos previos](#3-requisitos-previos)
4. [Ejecución local](#4-ejecución-local)
5. [Comandos disponibles](#5-comandos-disponibles)
6. [Estructura del proyecto](#6-estructura-del-proyecto)
7. [Los datos: `src/data/matches.json`](#7-los-datos-srcdatamatchesjson)
8. [Cómo añadir, modificar, aplazar o cancelar un partido](#8-cómo-añadir-modificar-aplazar-o-cancelar-un-partido)
9. [Cuándo incrementar `sequence`](#9-cuándo-incrementar-sequence)
10. [Desactivar el modo demostración](#10-desactivar-el-modo-demostración)
11. [Nueva temporada](#11-nueva-temporada)
12. [Despliegue en Cloudflare Pages](#12-despliegue-en-cloudflare-pages)
13. [Por qué no cambiar la URL del feed ni los UID](#13-por-qué-no-cambiar-la-url-del-feed-ni-los-uid)
14. [Probar la suscripción en Apple y Google](#14-probar-la-suscripción-en-apple-y-google)
15. [Limitaciones conocidas](#15-limitaciones-conocidas)
16. [Fuera del alcance (MVP)](#16-fuera-del-alcance-mvp)
17. [Documentación relacionada](#17-documentación-relacionada)
18. [Checklist antes de publicar](#18-checklist-antes-de-publicar)

---

## 1. Qué es y qué no es

**Sí es:**

- Una web estática (Astro, sin servidor ni base de datos) con el próximo partido, la lista de próximos partidos, filtros, FAQ y la suscripción al calendario.
- Un feed ICS público y estable en `/calendario/bilbao-basket.ics`, generado en tiempo de build a partir de un único JSON que se mantiene a mano.

**No es:**

- No es una app con cuentas, notificaciones ni backend.
- No es un calendario oficial ni afiliado al Bilbao Basket.
- No scrapea ni consulta ninguna API: los datos se editan manualmente en `src/data/matches.json`.

## 2. Arquitectura

```
src/data/matches.json  ──►  parseDataset() (validación estricta)
                                │  error ⇒ el build falla y no se publica nada
                                ▼
                        buildMatchesView()   ──►  páginas Astro (HTML)
                                │
                                ▼
                          buildIcs()         ──►  /calendario/bilbao-basket.ics (estático)
```

- **Build**: `astro build` genera HTML estático + el endpoint del ICS (`src/pages/calendario/bilbao-basket.ics.ts`), `robots.txt` y `sitemap.xml`.
- **Validación**: se ejecuta al importar los datos (build y pruebas). Cualquier error lanza `DatasetValidationError` y detiene el build con todos los mensajes.
- **ICS**: generado con [ical-generator](https://github.com/nicjansma/ical-generator) (CRLF, plegado ≤75 octets UTF-8, escapado RFC 5545). Las pruebas lo reanalizan con un parser independiente ([node-ical](https://github.com/nicjansma/node-ical)).
- **Identidad de los eventos**: UID derivado del namespace `bilbao-basket-calendario` + `id` del partido. La URL pública **no** interviene en los UID.
- **Determinismo**: `DTSTAMP` y `LAST-MODIFIED` se derivan de las fechas persistidas (`updatedAt`, `lastReviewedAt`), nunca de la hora del build: dos builds con los mismos datos producen bytes idénticos.
- **Estilos**: mobile-first real (base para móvil, `min-width` para pantallas grandes), sin frameworks CSS.

## 3. Requisitos previos

- Node.js 20 o superior (probado con Node 24).
- npm.

## 4. Ejecución local

```bash
npm install
npm run dev
```

Abre <http://localhost:4321>. En desarrollo la URL pública por defecto es `http://localhost:4321`; no hace falta `PUBLIC_SITE_URL`.

```bash
PUBLIC_SITE_URL=https://calendario.ejemplo.com npm run build
npm run preview
```

## 5. Comandos disponibles

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo (Astro). |
| `npm run build` | Build de producción. **Fallará** si los datos no son válidos o falta `PUBLIC_SITE_URL`. |
| `npm run preview` | Sirve el build en `http://localhost:4321`. |
| `npm run check` | `astro check` (TypeScript + Astro). |
| `npm test` | Pruebas unitarias (Vitest): datos, fechas, ICS, URLs. |
| `npm run test:watch` | Vitest en modo watch. |
| `npm run check:responsive` | Verificación responsive real con Chromium (Playwright): 320/375/390/768/1280 px + horizontal. Levanta un `preview` por su cuenta. |

Variables de entorno (ver `.env.example`):

| Variable | Requisito |
| --- | --- |
| `PUBLIC_SITE_URL` | **Obligatoria en producción** (sin barra final). Si falta, `npm run build` falla con `[config] Falta PUBLIC_SITE_URL en producción…`. |

## 6. Estructura del proyecto

```
src/
  config.ts              Configuración central (URL, UID namespace, ICS, duración, TTL)
  data/
    matches.json         Único archivo de datos (se edita a mano)
    schema.ts            Tipos + parseDataset() (validación estricta)
    dataset.ts           Carga y valida los datos
  lib/
    datetime.ts          ISO con offset, DST Europe/Madrid, formatos iCalendar
    ics.ts               buildIcs() con ical-generator
    matches.ts           buildMatchesView() (próximo, próximos, sin fecha, histórico)
    format.ts            Formateo legible (fechas en español)
    urls.ts              URLs de suscripción (webcal/https), Google, copiado
  pages/
    index.astro          Página principal
    404.astro
    calendario/bilbao-basket.ics.ts   Feed ICS (estático)
    robots.txt.ts        Bloquea el sitio en modo demo
    sitemap.xml.ts       urlset vacío en modo demo
  layouts/BaseLayout.astro
  components/            Header, banner demo, próximos partidos, suscripción, FAQ, footer
  styles/global.css      Estilos mobile-first
tests/                   Vitest (schema, datetime, ics, urls)
scripts/check-responsive.mjs   Verificación responsive con Playwright
public/_headers          Cabeceras de Cloudflare Pages
docs/                    Pruebas manuales e interoperabilidad
```

## 7. Los datos: `src/data/matches.json`

Único archivo de datos. Estructura:

```jsonc
{
  "meta": {
    "lastReviewedAt": "2026-11-05",   // fecha REAL de última revisión de los partidos
    "seasons": ["2026-27"],
    "demo": true,                     // false cuando los datos sean reales
    "sources": [{ "label": "…", "url": "https://…" }],  // opcional
    "contact": { "label": "…", "url": "mailto:…" }      // opcional
  },
  "matches": [ /* ver abajo */ ]
}
```

Por partido:

| Campo | Obligatorio | Notas |
| --- | --- | --- |
| `id` | sí | Estable, único, **independiente de fechas** (p. ej. `2026-27-liga-010`). Define el UID: nunca se reutiliza ni se reescribe. |
| `season` | sí | Debe existir en `meta.seasons`. |
| `competition` | sí | |
| `homeTeam` / `awayTeam` | sí | El Bilbao Basket debe aparecer en uno de los dos. |
| `venue` | no | |
| `start` | sí* | ISO-8601 **con offset explícito** (`2026-12-05T18:30:00+01:00`). El offset debe coincidir con Europe/Madrid en ese instante (verano `+02:00`, invierno `+01:00`). |
| `date` | sí* | `YYYY-MM-DD` cuando se conoce el día pero no la hora. `start` y `date` son mutuamente excluyentes. |
| `scheduleStatus` | sí | `confirmed` (con `start`) · `time-tbc` (con `date`) · `date-tbc` (sin fecha). |
| `matchStatus` | sí | `scheduled` · `postponed` · `cancelled` · `finished`. |
| `sourceUrl` | no | `http(s)` válido. |
| `updatedAt` | sí | Fecha real de modificación (`YYYY-MM-DD`): alimenta `LAST-MODIFIED`/`DTSTAMP`. |
| `sequence` | sí | Entero ≥ 0, se incrementa **manualmente** (ver §9). |
| `notes` | no | |
| `lastPublishedStart` | no | Solo en `postponed` (ver §8). |

\* Exactamente uno de `start` / `date` / ninguno, según `scheduleStatus` (la validación lo exige).

La validación rechaza además: claves desconocidas, ids duplicados, `homeTeam === awayTeam`, equipos sin Bilbao Basket, fechas inválidas, offsets DST incorrectos y cualquier combinación incoherente. **Los errores detienen el build.**

## 8. Cómo añadir, modificar, aplazar o cancelar un partido

### Añadir

1. Añade un objeto a `matches` con un `id` nuevo y único.
2. `updatedAt` = fecha de hoy; `sequence: 1`.
3. Activa `scheduleStatus`/`matchStatus` correspondientes.
4. Actualiza `meta.lastReviewedAt` a la fecha de hoy.
5. `npm test && npm run check && PUBLIC_SITE_URL=… npm run build`.

### Cambiar hora/fecha de un partido ya publicado

1. Actualiza `start` (o `date`) con el offset correcto de Europe/Madrid.
2. **Incrementa `sequence`** (ver §9).
3. Actualiza `updatedAt` y `meta.lastReviewedAt`.
4. Si era `time-tbc` y ya hay hora confirmada: pasa a `start` + `scheduleStatus: "confirmed"`.

### Aplazar (sin nueva fecha)

```jsonc
{
  "matchStatus": "postponed",
  "scheduleStatus": "date-tbc",
  "lastPublishedStart": "2026-12-05T18:30:00+01:00"  // último horario PUBLICADO
  // sin "start" ni "date"
}
```

- El evento **conserva su UID** y se publica con `STATUS:CANCELLED` y título `APLAZADO: …`: hace inequívoco que `lastPublishedStart` ya no es válida.
- Incrementa `sequence` y actualiza `updatedAt` + `lastReviewedAt`.
- `lastPublishedStart` solo se permite en `postponed` y nunca junto a `start`/`date` (la validación lo exige).
- Cuando se conozca la nueva fecha: vuelve a `scheduled` con `start`/`date`, elimina `lastPublishedStart`, incrementa `sequence`.

### Cancelar

- `matchStatus: "cancelled"`, **conserva** `start` o `date`, y `scheduleStatus` correspondiente.
- Se publica con `STATUS:CANCELLED` y prefijo `CANCELADO:` en el título.
- Incrementa `sequence` y actualiza `updatedAt` + `lastReviewedAt`.

### Un partido ya disputado

- `matchStatus: "finished"` y elimínalo (o déjalo: aparece en «Histórico»). La web no depende de los partidos pasados para el próximo partido.

## 9. Cuándo incrementar `sequence`

`sequence` es el número de revisión **manual** de cada evento (RFC 5545). Se incrementa **solo** cuando cambia algo ya publicado de ese partido:

- nueva fecha u hora (`start`/`date`),
- cambio de estado (`scheduled` → `postponed` / `cancelled`, aplazado → nueva fecha),
- cambios relevantes de recinto/composición que deban refrescarse en los clientes.

**No** se incrementa por correcciones que no cambien el evento en el calendario (p. ej. arreglar un typo en `notes` de un partido pasado).

Procedimiento: editar `sequence` del partido + `updatedAt` → `npm test` → build → desplegar. El cliente usará el evento con `SEQUENCE` más alta y lo reemplazará.

> ⚠️ `sequence` **nunca se autoincrementa en el build**: los builds deben ser deterministas. Es responsabilidad del mantenimiento incrementarlo.

## 10. Desactivar el modo demostración

1. En `src/data/matches.json`: sustituye todos los partidos ficticios por los reales y pon `"demo": false` en `meta`.
2. Con `meta.demo: false` desaparecen: el banner de demostración, `<meta name="robots" content="noindex, nofollow">`, el `Disallow: /` de `robots.txt` y el sitemap vacío.

## 11. Nueva temporada

1. Añade la temporada a `meta.seasons` (p. ej. `"2027-28"`).
2. Añade los partidos nuevos con `season: "2027-28"` e `id` propios.
3. Los partidos de la temporada anterior pueden quedarse (entran en «Histórico»).
4. Actualiza `meta.lastReviewedAt`.
5. `npm test && npm run check && … npm run build`.

## 12. Despliegue en Cloudflare Pages

### Desde el repositorio (recomendado)

1. Sube el repositorio a GitHub/GitLab.
2. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Configuración:
   - **Framework preset**: Astro
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Node version**: 20+ (Variable de entorno `NODE_VERSION=20`)
4. **Variable de entorno**: `PUBLIC_SITE_URL=https://<tu-dominio>` (obligatoria; sin barra final). Si falta, el build falla a propósito.
5. Deploy. Tras cada despliegue se regenera el ICS.

### Dominio propio

Cloudflare Pages → Custom domains → añade el dominio. `PUBLIC_SITE_URL` debe coincidir **exactamente** con la URL definitiva (esquema incluido), porque alimenta el `canonical`, el Open Graph, la sitemap y las URLs de suscripción.

### Cabeceras (`public/_headers`)

Ya incluido en el repo:

- Todo: `Cache-Control: public, max-age=0, must-revalidate` (el ICS nunca queda obsoleto en el CDN tras un despliegue).
- `/calendario/bilbao-basket.ics`: `Content-Type: text/calendar; charset=utf-8`.
- `/_astro/*`: caché larga e inmutable.
- `robots.txt` / `sitemap.xml` con sus content-types.

> `max-age=0` controla la caché del **CDN del sitio**; no controla con qué frecuencia Apple/Google refrescan la suscripción (eso lo decide cada cliente).

### Verificación tras el despliegue

- `curl -sI https://<dominio>/calendario/bilbao-basket.ics | grep -i content-type`
- Abrir el ICS en el navegador y comprobar que no aparece `localhost`.
- `https://<dominio>/robots.txt` debe **no** incluir `Disallow` (datos reales).
- Suscripción real en un dispositivo de prueba (ver §14).

## 13. Por qué no cambiar la URL del feed ni los UID

- **La URL del feed es un contrato con los suscriptores.** Apple y Google la guardan al suscribirse; cambiarla no actualiza las suscripciones existentes y los usuarios antiguos dejan de recibir partidos. `icsPath` es estable y sin temporada: no se cambia por actualizar datos.
- **Los UID identifican cada evento** y derivan de `config.uidNamespace` + `id` del partido, **no** de la URL pública. Por eso:
  - cambiar `PUBLIC_SITE_URL` (dominio) no duplica ni rompe eventos;
  - cambiar `config.uidNamespace` **sí** duplicaría todos los eventos en los calendarios de los suscriptores (aparecerían dos copias) → **no se toca**;
  - cambiar el `id` de un partido crea un evento nuevo y deja el antiguo huérfano → **no se reescribe un `id` ya publicado**.

## 14. Probar la suscripción en Apple y Google

**Apple (macOS):** en la web, «Suscribirse en Apple Calendar» → se abre Calendar con el `webcal://` → «Suscribir». Esperar/recargar (⌘R) para ver el refresco.

**Apple (iOS):** Ajustes → Calendario → Suscripciones de calendario → Añadir suscripción de calendario → pegar la URL `https://…/calendario/bilbao-basket.ics`. *(Si la web se abre en el navegador, el enlace `webcal://` puede abrir directamente la app Calendario.)*

**Google (escritorio):** en la web, «Añadir en Google Calendar» abre la página oficial *«Otros calendarios → Desde URL»* → pegar la URL → «Añadir calendario».

- Google **no** admite crear un evento individual desde URL con este feed, y su aplicación móvil **no** permite añadir un calendario desde URL (hacerlo desde escritorio; la suscripción se sincroniza después al móvil).
- Ver `docs/interoperabilidad.md` para el flujo guiado completo y las limitaciones de cada cliente.

## 15. Limitaciones conocidas

- Horas con offset UTC (`Z`): los clientes convierten a la zona local del usuario; para alguien fuera de Europa/Madrid la hora local de origen es correcta.
- Partidos de día completo no forman parte del flujo actual (todos tienen hora o `time-tbc`), pero el generador lo soporta (DTEND exclusivo).
- Sin alarmas ni invitaciones (`METHOD:PUBLISH`): el cliente no notifica automáticamente (cada app tiene su propia política de avisos de calendario suscrito).
- `X-PUBLISHED-TTL` / `REFRESH-INTERVAL` son solo **pistas**: Apple y Google refrescan según su criterio.
- La web es un calendario de consulta: no sustituye a la comprobación en fuentes oficiales.

## 16. Fuera del alcance (MVP)

- Backend, base de datos, notificaciones push, cuentas de usuario.
- Scraping automático de fuentes oficiales.
- i18n multiidioma, modo oscuro, PWA offline.

## 17. Documentación relacionada

- `docs/pruebas-manuales.md` — guía de pruebas manuales y estado de lo verificado.
- `docs/interoperabilidad.md` — política de aplazados/cancelados y comportamiento en Apple/Google.

## 18. Checklist antes de publicar

- [ ] Datos reales en `src/data/matches.json` y `meta.demo: false`.
- [ ] `meta.lastReviewedAt` = fecha real de revisión.
- [ ] Todos los partidos con `updatedAt` real y `sequence` correcto.
- [ ] `PUBLIC_SITE_URL` definida en el entorno de despliegue.
- [ ] `npm test` (todas las pruebas en verde).
- [ ] `npm run check` (0 errores).
- [ ] `npm run build` correcto.
- [ ] `npm run check:responsive` en verde (320/375/390/768/1280 + horizontal).
- [ ] Tras desplegar: ICS con `Content-Type: text/calendar`, sin `localhost`, `robots.txt` sin `Disallow`.
- [ ] Suscripción real probada en Apple Calendar y Google Calendar.
- [ ] Verificación visual pendiente en Safari/iOS y Chrome/Android reales (ver `docs/pruebas-manuales.md`).
