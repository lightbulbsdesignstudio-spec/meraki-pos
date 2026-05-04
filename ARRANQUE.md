# Meraki Nails POS — Instrucciones de Arranque

## Antes de deployar: necesitas 2 cosas

### 1. Cuenta Upstash (base de datos gratuita)
1. Ir a https://upstash.com
2. Crear cuenta gratuita
3. Crear una nueva base de datos Redis → elegir región "N. Virginia" o "São Paulo"
4. Copiar los 2 valores: `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`

### 2. Deploy en Vercel
```bash
# Desde la carpeta meraki-pos:
npm install -g vercel   # solo la primera vez
vercel                  # primera vez — te pide login
vercel --prod           # deploy final
```

Durante el deploy Vercel te preguntará las variables de entorno.
Pegar ahí los 2 valores de Upstash.

### 3. Cargar catálogo inicial (una sola vez)
Antes de usar el sistema, cargar los servicios y técnicas:
```bash
UPSTASH_REDIS_REST_URL="..." UPSTASH_REDIS_REST_TOKEN="..." node seed.js
```

Después del seed, entrar a `/config` en el sistema para:
- Cambiar los nombres de las técnicas (Técnica 2, 3, 4 → nombres reales)
- Verificar precios de servicios

## Navegación del sistema
| Pantalla | Para qué |
|----------|----------|
| Agenda | Agendar y gestionar citas del día |
| Clientes | Base de datos de clientas + historial |
| Reportes | Ingresos, servicios populares, comisiones |
| Socios | Recuperación de inversión ($300K) y proyecciones |
| Config | Agregar/editar técnicas y servicios |

## Flujo básico de una cita
1. Abrir Agenda → Nueva cita
2. Seleccionar cliente, técnica, servicio
3. Cuando termina → clic en la cita → "Cobrar"
4. Elegir método de pago → Confirmar cobro
5. Si es visita #10, 20, 30... → aparece mensaje de servicio gratis

## Ecosistema de marketing (futuro)
El endpoint `/api/analytics` está listo para ser consumido por el sistema Claude de Meraki.
Retorna: perfiles de clientes, tendencias de ingresos, breakdown por canal de captación, datos geoespaciales.
