# Lessons Learned — Meraki POS

## ÍNDICE PARA RC PRE-FEED
Pasar al agente Reality Checker como contexto cuando se valide código de Meraki. Cada bullet = patrón ya conocido — RC NO debe redescubrirlo, debe **validar ausencia y avanzar**.

- **migración-de-schema:** después de cambiar campo singular → array (ej. `servicioId` → `servicios[]`), revisar TODOS los renders frontend uno por uno, no solo backend. El backend pasa fácil porque centraliza; el frontend tiene N puntos de display y CADA uno necesita auditoría.
- **catch-vacíos:** `catch(e){}` y `.catch(()=>{})` en código de carga de datos = error invisible. Si Upstash o sesión fallan, la pantalla queda vacía sin avisar a Brenda. Mínimo: `toast('Error de conexión', 'error')` y/o `console.error`.
- **parseBody-doble-consumo:** `parseBody(req)` consume el stream del body. Llamarlo dos veces en el mismo handler = la segunda llamada devuelve `{}` y el endpoint recibe body vacío silenciosamente. Patrón anti: `const { tipo } = ...await parseBody(req); ... const body = await parseBody(req);` (config.js v1).
- **auth-roles-mutaciones:** todo endpoint con DELETE o mutaciones destructivas debe especificar `requireAuth(req, res, ['admin','socio'])`. Default sin roles = TODA sesión autenticada (incluida empleada) puede destruir datos.
- **fetch-sin-r.ok:** llamar `await r.json()` sin verificar `r.ok` primero → si servidor regresa 500 con HTML de error de Vercel, `r.json()` lanza SyntaxError → cae al catch genérico "Error de conexión" ocultando el problema real.
- **claims-de-PASS-previos:** si project_state.md dice "RC PASS Score 98/100" para una feature, NO confiar — re-verificar. La RC previa puede no haber probado el flujo completo (ej. abrir historial, ver tabla de descuentos).

---

## Lecciones detalladas

## [2026-05-08] [migración-schema] Frontend regresiones tras feature multi-servicios
**Qué falló:** El feature "múltiples servicios por cita" pasó RC en su día con score 98/100, pero 3 puntos de display en frontend siguieron leyendo `c.servicioId` singular: chip del calendario, historial de clienta, tabla de descuentos en reportes. Brenda ve datos rotos en pantallas que mira a diario.
**Por qué pasó:** La RC original validó cobro y backend (citas.js, descuentos.js, socios.js, reportes.js todos array-aware), pero NO ejecutó flujo E2E real desde el ojo de Brenda. Confió en que "los tests pasan" en lugar de abrir cada pantalla y ver qué muestra.
**Cómo prevenirlo:**
  - Código: helper `getServiciosDeCita(c)` extraído en clientes.html:173 — replicable en cualquier render que necesite mostrar servicios. Usarlo en cualquier pantalla nueva.
  - Proceso: después de migración de schema, RC debe correr checklist explícito: ¿qué pantallas muestran este campo? Listarlas y auditar una por una.
**Aplicable a:** Meraki POS, cualquier producto con migración singular→array

## [2026-05-08] [auth] Empleada podía borrar clientas y citas
**Qué falló:** `api/clientes.js` y `api/citas.js` llamaban `requireAuth(req, res)` sin roles, dejando PUT/DELETE abierto a cualquier sesión autenticada (incluida rol `empleada`).
**Por qué pasó:** Patrón heredado de cuando solo había un rol. Al introducir múltiples roles (admin/socio/empleada), no se revisó cada endpoint.
**Cómo prevenirlo:**
  - Código: cada nuevo endpoint con DELETE o mutación destructiva debe declarar explícitamente roles. Pattern: `const rolesRequeridos = ['DELETE'].includes(req.method) ? ['admin','socio'] : null;`
  - Proceso: cuando se agreguen nuevos endpoints, RC debe preguntar "¿qué roles pueden ejecutar cada método?"
**Aplicable a:** Meraki POS

## [2026-05-08] [silencioso] parseBody doble consumo en config.js
**Qué falló:** `api/config.js` llamaba `parseBody(req)` en línea 10 (para extraer `tipo`) y de nuevo en línea 29 (para el body completo). El stream ya estaba consumido — segunda llamada regresaba `{}`. Crear/editar servicios y nail techs desde Configuración a veces no guardaba.
**Por qué pasó:** Refactor incremental: línea 10 se agregó después para mover `tipo` arriba del switch GET/non-GET, sin notar que invalidaba la lectura posterior.
**Cómo prevenirlo:**
  - Código: convención: `parseBody(req)` se llama una sola vez por handler, al inicio (después de auth). Resto del código usa la variable cacheada.
**Aplicable a:** Meraki POS, cualquier handler serverless con body parsing manual

---

## QA-Sprint-Meraki-Hardening · 2026-05-08

Sprint disparado por RC retroactivo (primer uso del RC mejorado post QA-Sprint-6 LDS) que dio NEEDS WORK. Implementó observabilidad mínima + dashboard pasivo + helper consolidado + parseBody endurecido.

### Decisiones arquitectónicas

- **Observabilidad pasiva, no notificaciones activas.** Decisión Netie 2026-05-08: dashboard `/admin-status.html` que admin abre cuando quiera. Sin Sentry/Logtail/Telegram/email. Razón: cero costo, cero infra externa, cero servicios terceros. Trade-off explícito: si Brenda golpea bug a las 11am sábado, Netie no se entera hasta abrir dashboard. Aceptado mientras Meraki sea único POS LDS. Si crece a 2+ clientes con POS, reabrir y reconsiderar canal activo.
- **Audit log + error log en Upstash del propio POS, no en Neon LDS.** Decisión Netie 2026-05-08: no se prevén más POS, registro vive en el propio servicio. Si cambia, capturar como item del inbox SM y agregar flush a Neon central.
- **lib/parseBody.js: validación Content-Type explícita.** Antes el fallback silencioso a URLSearchParams escondía bodies malformados. Ahora rechaza con `code: UNSUPPORTED_CONTENT_TYPE` cuando ct desconocido y body no parece JSON. Detección por shape (`{` o `[`) sigue funcionando para fetch sin Content-Type.

### 3 falsos positivos previsibles del nuevo dashboard

1. **"Sin errores"  cuando el endpoint `/api/admin-status` mismo está caído.** Síntoma: dashboard muestra "Errores: 0" porque la lectura `readErrors()` cayó al catch interno de `lib/observability.js` y devolvió `[]`. Frecuencia: rara, solo si Upstash colapsa. Mitigación: el dashboard también lee `health.redis.ok` — si está rojo, NO confiar en counts de errores/audit. Banner "estado degradado" agregable en QA-Meraki-Hardening v2.
2. **Errores de frontend no aparecen en el dashboard.** Síntoma: el dashboard solo muestra errores capturados por catches del backend. Si el frontend rompe (catch + toast), NO se loguea al servidor. Frecuencia: media. Mitigación actual: `console.error` en cada catch frontend (Vercel Logs lo retiene 1h). Mitigación final: endpoint POST `/api/client-error` con auth, capturado para QA-10.
3. **Audit log muestra bots / scripts automatizados.** Síntoma: si en el futuro hay scripts que loguean como admin (cron, automation), el audit se llena de eventos no-humanos. Frecuencia: nula hoy, alta cuando llegue un cron. Mitigación: agregar campo `meta.source` (manual/api/cron) cuando se introduzca el primer script automatizado.

### Smoke E2E — script listo, ejecución requiere coordinación

`scripts/smoke-e2e.mjs` simula los 3 roles (admin_test/socio_test/empleada_test) ejecutando login + lectura + escritura + verificación de role gating. Requiere:

1. Crear las 3 cuentas test desde `/config.html` con un admin real.
2. Correr `BASE_URL=https://meraki-pos.vercel.app ADMIN_TEST_PASS=... SOCIO_TEST_PASS=... EMPLEADA_TEST_PASS=... node scripts/smoke-e2e.mjs`.
3. El script hace cleanup (borra clientes `Smoke ...` al final con admin).

Razón por la que no se ejecutó automáticamente en el sprint: las credenciales de Upstash producción están encriptadas en Vercel (no se descargan con `vercel env pull`). Item capturado al inbox del Sprint Manager LDS con disparo "post-deploy QA-Meraki-Hardening".

### Backfill query schema citas

`/api/admin-status?schema=1` ejecuta auditoría sobre todas las citas en server-side con auth admin. Botón "Auditar schema citas" en `/admin-status.html` lo dispara on-demand. Reporta: total, schema nuevo, legacy (`servicioId` singular), híbridas, vacías. Backward compat de `LibCitas.citaServiciosArray()` cubre las 3 categorías — no requiere migración masiva.

### Helper duplicado backend

5 ocurrencias del patrón `c.servicios || (c.servicioId ? [{id: c.servicioId}] : [])` siguen vivas en `api/citas.js:9,69`, `api/socios.js:31`, `api/reportes.js:62,81`. Frontend ya extrajo a `LibCitas`. Backend espera helper ESM compartible — capturado al inbox SM como deuda menor (no afecta producción, solo drift en próxima migración).
