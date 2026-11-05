# Interoperabilidad (Apple Calendar y Google Calendar)

Cómo se comporta el feed ICS en los clientes habituales y qué política sigue cada estado de partido.

## 1. Qué publica el feed

- `METHOD:PUBLISH`: es un calendario de consulta, **no** una invitación. No se envía «Aceptar/Rechazar», no hay alarmas ni notificaciones propias.
- `X-PUBLISHED-TTL: P1D` y `REFRESH-INTERVAL`: pistas de refresco (12 h). **Cada cliente decide su cadencia**: Apple/Google pueden tardar hasta 24–48 h en refrescar una suscripción existente. No es posible forzarlo desde el servidor.
- Horas en UTC con sufijo `Z` (generadas desde los offsets explícitos de Europe/Madrid). El cliente las muestra en la zona horaria local del dispositivo.
- Orden determinista: por fecha, con criterios estables; mismo JSON ⇒ mismos bytes.

## 2. Estados de partido y su equivalente iCalendar

| Estado en la web | En el ICS | Efecto en el cliente |
| --- | --- | --- |
| Confirmado (`scheduled` + `start`) | Evento con `DTSTART`/`DTEND`, `STATUS:CONFIRMED` | Evento normal. |
| Día confirmado, hora por confirmar (`time-tbc` + `date`) | Evento de **día completo** (`VALUE=DATE` + `DTEND` exclusivo, día siguiente) | Ocupa el día entero; la web indica «Hora por confirmar». |
| Sin fecha (`date-tbc`) | **No se publica** en el feed (aparece en «Sin fecha confirmada» en la web) | Nada en el calendario hasta que haya fecha. |
| Cancelado (`cancelled`) | Conserva su fecha, `STATUS:CANCELLED`, título con prefijo `CANCELADO:` | Los clientes lo tachan/ocultan; conserva el UID. |
| Aplazado sin nueva fecha (`postponed`) | Evento **anclado** a `lastPublishedStart`, `STATUS:CANCELLED`, título `APLAZADO: …` | Deja claro en el calendario que ese horario **ya no es válido**, sin crear un segundo evento. |
| Histórico (`finished`) | Se publica igualmente (ya jugado) | Aparece en el pasado. |

### Política de aplazados (la importante)

1. Mientras **no haya** nueva fecha: `matchStatus: "postponed"`, sin `start`/`date`, y `lastPublishedStart` = último horario **ya publicado**. El evento conserva su UID, se marca `STATUS:CANCELLED` y el título empieza por `APLAZADO:`. Así el suscriptor ve, en su propio calendario, que esa fecha antigua ya no cuenta — sin duplicados y sin dejar un evento «fantasma» en la fecha original.
2. **Al publicar la nueva fecha**: se vuelve a `scheduled` con `start`/`date`, se elimina `lastPublishedStart`, se incrementa `sequence`. Al mismo UID llega la nueva hora y el cliente reemplaza el evento antiguo.
3. Nunca se crea un `id`/UID nuevo por un aplazamiento: el nuevo evento reemplazaría mal y dejaría el antiguo huérfano.

### Cancelaciones

- Se conserva la fecha original + `STATUS:CANCELLED` + prefijo `CANCELADO:`. El UID no cambia, así los suscriptores reciben la cancelación del evento que ya tenían.

## 3. Apple Calendar (macOS / iOS)

**Suscripción:**

- Enlace `webcal://…` desde el botón «Suscribirse en Apple Calendar» (macOS abre Calendar directamente).
- En iOS: Ajustes → Calendario → Suscripciones de calendario → Añadir suscripción de calendario → pegar la URL `https://…/calendario/bilbao-basket.ics`.

**Comportamiento:**

- Refresco según su política interna (manuales: ⌘R en macOS).
- Los eventos de día completo (`time-tbc`) se muestran como todo el día.
- `STATUS:CANCELLED`: el evento se muestra tachado según la configuración del usuario; no genera alarmas.
- Los cambios con `SEQUENCE` superior reemplazan el evento existente (mismo UID).

**Límite importante:** la suscripción es una copia del calendario del momento + refrescos; un evento no «se actualiza» hasta que el cliente vuelve a descargar el feed.

## 4. Google Calendar

**Añadir desde URL (escritorio — flujo verificado en la ayuda de Google):**

1. En la web, pulsar «Añadir en Google Calendar»: abre `https://calendar.google.com/calendar/u/0/r/settings/addbyurl` (la página oficial *«Otros calendarios → Desde URL»*).
2. Pegar la URL `https://…/calendario/bilbao-basket.ics` (o usar el campo si el navegador lo precarga).
3. «Añadir calendario». El calendario aparece como *«Bilbao Basket — partidos»* en el panel izquierdo.

Alternativa manual: Calendar (escritorio) → Otros calendarios → «+» → **Desde URL** → pegar → Añadir calendario.

**Comportamiento:**

- Refresco automático propio (horas a ~1 día). Tras un cambio publicado, puede tardar hasta 24–48 h en reflejarse.
- No envía correos ni notificaciones de invitación (`METHOD:PUBLISH`).
- `STATUS:CANCELLED` se muestra como evento cancelado según la vista del usuario.
- El calendario suscrito es de solo lectura: no se puede editar un evento desde él (si el usuario edita, Google suele crear una copia local — no recomendado).

**Límites conocidos:**

- **Aplicación móvil**: Google Calendar en iOS/Android **no permite añadir un calendario desde URL**. Hay que suscribirse desde el escritorio y esperar a que se sincronice al móvil (o usar Apple Calendar/Outlook en el móvil con la misma URL).
- **No hay URL para crear un evento suelto** a partir de este feed: el mecanismo oficial es «Desde URL». Por eso la web enlaza esa página en lugar de inventar un deep-link de evento.
- Los calendarios suscritos de Google aparecen como solo lectura y no aparecen en el buscador de «Calendarios de otras personas».

## 5. Otros clientes

- Cualquier cliente que soporte `webcal://`/URL ICS (Outlook, Thunderbird, Samsung Calendar…) puede suscribirse con la misma URL; **no está probado** (ver `docs/pruebas-manuales.md`, apartado F).
- El feed cumple RFC 5545 en CRLF, plegado ≤75 octets UTF-8, escapado y `SEQUENCE`; las pruebas lo reanalizan con un parser independiente (`node-ical`).

## 6. Resumen de limitaciones del MVP

- Sin alarmas/notificaciones propias; depende de la política de cada app.
- Sin invitaciones ni RSVP.
- Refresco no controlable por el servidor (solo pistas TTL/REFRESH-INTERVAL).
- Google móvil no permite suscripción desde URL.
- No se garantiza refresco inmediato tras despliegue (24–48 h).
- Sin exportación en otros formatos (solo ICS) y sin iCal feed por temporada (un único feed estable).
