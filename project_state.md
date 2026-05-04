# Project State — Meraki Nails POS
> Última actualización: 2026-05-04 (bugfix crítico sistemático — credenciales en fetch)

---

## [CRÍTICO — 2026-05-04 10:15 CDT]
**Origen:** Bug de guardado de clientes reportado por Brenda — "no deja guardar el nombre"
**Raíz:** 5 fetch() POST/PUT/DELETE sin `credentials: 'same-origin'`. Las cookies HTTP-Only no viajaban, `requireAuth()` rechazaba.
**Ubicaciones arregladas:**
- clientes.html:356 — guardar() clienta ← BUG PRINCIPAL
- index.html:549 — guardarCita()
- index.html:612 — cambiarEstadoCita()
- config.html:362 — toggleTecnica()
- socios.html:260 — guardar() socios

**Status:** ✅ Arreglado en commit 337be11
**Acción requerida:** Brenda valida en https://meraki-pos.vercel.app (5 flujos clave: registrar clienta, agendar cita, cambiar estado, activar Nail Tech, guardar socios)

---

## Estado: SISTEMA EN PRODUCCIÓN con data demo. 85-90% operacional, validación pendiente.

**URL live:** https://meraki-pos.vercel.app
**Login admin:** `brenda / meraki2026`
**WhatsApp Brenda configurado:** `525541806736`

## Credenciales Upstash (en env vars Vercel + persistentes)
```
UPSTASH_REDIS_REST_URL=https://glowing-dove-108818.upstash.io
UPSTASH_REDIS_REST_TOKEN=gQAAAAAAAakSAAIgcDE0ZjJiNzU2ODYxZDA0YTJmOWFhNjUzZjc2MWM2M2Y3ZQ
```

## Lo que está terminado y validado

### Sprint 1 (POS base)
- Agenda con calendario por Nail Tech
- CRUD clientas con colonia, CP, canal de origen, referidoPor
- Cobros SPEI/efectivo/tarjeta + propinas + extras
- Comisiones por Nail Tech configurables
- Lealtad: ⭐ VIP en visita 5, 💎 servicio gratis en visita 10/20/30
- Dashboard Socios con recuperación inversión
- Lista de espera (waitlist)
- Reportes generales

### Sprint 2 (auth + descuentos + reportes ampliados)
- Login con cookie HttpOnly + bcrypt + 3 roles (admin/socio/empleada)
- CRUD usuarios desde Configuración tab Usuarios
- Descuentos con autorización por WhatsApp (genera link `wa.me`)
- Datos del negocio editables (CLABE, banco, titular, WhatsApp Brenda, renta, insumos)
- CLABE dinámica desde config
- Reportes con períodos día/ayer/semana/mes/mes_anterior/año/total
- Botón "Generar reporte" imprimible
- Tabla auditoría descuentos
- Auto-invalidación sesión si admin desactiva usuario
- Rate limit login (8 intentos / 15 min)
- Hash dummy timing-safe (anti-enumeration)
- Cambiar contraseña invalida otras sesiones del usuario
- Endpoint `/api/socios` GET solo admin/socio

### Sprint 3 (data demo + rediseño visual + manual IDEO)
- `seed-demo.js` + `seed-demo-vip.js` + `seed-demo-today.js`: pobla con 30 clientas, ~110 citas, 4 VIP, 1 con 10+ visitas (Ximena Ortega), 7 citas en HOY
- `reset-to-day-zero.js`: borra operativa, mantiene config
- Rediseño visual: paleta cálida warm, sidebar gradient, KPIs premium, sin emojis (regla LDS), botones gradient
- **MANUAL-BRENDA.html v2:** centrado en personas IDEO (4 personas, 8 journeys, ~4500 palabras)

### Sprint 4 (este ciclo — refinamiento UX)
- **Servicios** movido fuera de Configuración a `/servicios.html` con búsqueda + filtro categoría + CRUD admin-only
- Nav actualizado en 5 HTMLs + bottom nav móvil con link Servicios
- Configuración queda con 3 tabs: Nail Techs / Datos del negocio / Usuarios
- **Naming homologado:** Uñeras/Técnicas → "Nail Tech / Nail Techs" en todos los strings user-facing (HTMLs + manual)
- **Formato números:** `toLocaleString('es-MX')` aplicado en todas las cantidades en pesos (9 reemplazos en reportes/socios/index)
- Fix UI socios: cards con `card-body` envolvente para padding interno
- Botón "Generar reporte" + `@media print` ya estilizado para A4

## Reviews realizados

| | Veredicto | Bloqueadores | Estado |
|---|---|---|---|
| Code Review Sprint #1 (Sonnet) | NEEDS WORK | 4 | Todos arreglados |
| Code Review Sprint #2 (Sonnet) | NEEDS WORK | 2 + 7 riesgos | Bloqueadores + 3 críticos arreglados |
| Reality Check Sprint #2 | NEEDS WORK | 2 | Todos arreglados |
| /review Sprint #4 (Opus) | APROBADO con caveats | 0 | Caveats al backlog |

## Backlog priorizado para post-apertura

### Alto valor, gap vs AgendaPro
1. **Inventario detallado de insumos** (btw 28-abr): módulo CRUD donde Brenda agrega cada insumo (esmalte, gel, removedor, guantes, etc.) con costo unitario y cantidad mensual. El cálculo "Insumos mensual" en Socios deja de ser plano y refleja costo real por servicio.
2. Recordatorios automáticos WhatsApp 24h antes de cita (gap vs AgendaPro)
3. Auto-agendamiento público (página para que clienta agende sola)
4. Gift cards / paquetes prepagados (5 manicuras pagadas por adelantado)
5. Encuesta post-cita + email marketing reactivación
6. Recordatorio cumpleaños

### Calidad de código
- ~~Credenciales en fetch POST/PUT/DELETE~~ ✅ ARREGLADO 2026-05-04
- XSS via `JSON.stringify` en `onclick` (servicios.html, clientes.html, config.html) — usar `data-id` + `addEventListener`
- Race condition `setnx` en POST tipo='tecnica' y POST users
- Doble `parseBody` en `api/config.js`
- Endpoint config-negocio expone renta/insumos a empleadas — partir endpoint o filtrar por rol
- `prompt()` nativo en change-password → modal HTML
- Print CSS tabla descuentos en landscape cuando >7 columnas

### Producción real
- Brenda captura CLABE real en Configuración › Datos del negocio
- Brenda crea sus 2 socios y nail techs adicionales
- Brenda cambia su contraseña inicial
- `node reset-to-day-zero.js` cuando autoricen
- E2E real con Brenda creando cobro desde su celular

## Decisiones arquitectónicas (NO repreguntar)
- Redis sobre Postgres (deadline apertura)
- Auth con cookie HttpOnly + Redis sessions, no JWT
- Descuentos por WhatsApp en lugar de email/Resend
- Socios ven TODO el sistema (no solo panel Socios)
- CLABE vacía por defecto, Brenda la captura
- Naming Nail Tech (decidido 28-abr — no Uñera, no Técnica)
- Servicios en pantalla propia, no en Configuración
- Sonnet agotado esta semana — Opus + Haiku

## Archivos del proyecto

### Backend
- `lib/auth.js`, `lib/redis.js`, `lib/parseBody.js`
- `api/auth.js`, `api/users.js`, `api/config-negocio.js`, `api/descuentos.js`
- `api/citas.js`, `api/clientes.js`, `api/config.js`, `api/reportes.js`, `api/socios.js`, `api/waitlist.js`, `api/analytics.js`

### Frontend
- `public/login.html`, `public/index.html`, `public/clientes.html`, `public/servicios.html`, `public/reportes.html`, `public/socios.html`, `public/config.html`
- `public/assets/styles.css`, `public/assets/session.js`, `public/assets/mobile.js`

### Scripts
- `seed.js` (catálogo inicial — 47 servicios + 4 nail techs + inversión $300K)
- `seed-brenda.js` (admin user)
- `seed-demo.js` (mes de operación realista)
- `seed-demo-vip.js` (forzar 1 clienta con 10+ visitas)
- `seed-demo-today.js` (poblar HOY/AYER/MAÑANA)
- `reset-to-day-zero.js` (limpia operativa, mantiene config)

### Docs
- `ARRANQUE.md`, `MANUAL-BRENDA.html` (v2 IDEO), `project_state.md`

## Ruta del proyecto
`/Users/Netie/Lightbulbs_Design_Studio/04_clientes/Meraki_Nails/meraki-pos/`

## Para reanudar (próximo ciclo)
1. **Inventario de insumos** (alto valor, gap real): nuevo endpoint `api/inventario.js` + pantalla `/inventario.html` con CRUD de insumos. Reemplazar campo `insumosMensual` plano por suma calculada del módulo. Pasar `costo unitario × cantidad mensual estimada` al panel Socios.
2. Limpieza calidad de código del backlog
3. E2E con Brenda en producción
