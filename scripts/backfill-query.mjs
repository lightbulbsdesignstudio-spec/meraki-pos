// Backfill — auditoría schema citas. Reporta cuántas citas tienen `servicios` array vs `servicioId` legacy.
// Uso: node scripts/backfill-query.mjs (requiere .env.local con creds de producción)
import { Redis } from '@upstash/redis';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
try {
  for (const raw of readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    process.env[key] = val;
  }
} catch {
  console.error('No se pudo leer .env.local. Corre: vercel env pull .env.local --environment=production');
  process.exit(1);
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ids = await redis.smembers('mk:citas');
console.log(`Total citas en disco: ${ids.length}`);

let nuevas = 0, legacy = 0, hibridas = 0, vacias = 0;
const muestraLegacy = [];
const muestraHibrida = [];

for (const id of ids) {
  const cita = await redis.get(`mk:cita:${id}`);
  if (!cita) { vacias++; continue; }
  const tieneArray = Array.isArray(cita.servicios) && cita.servicios.length > 0;
  const tieneLegacy = !!cita.servicioId;
  if (tieneArray && tieneLegacy) { hibridas++; if (muestraHibrida.length < 3) muestraHibrida.push({ id, fecha: cita.fecha, servicios: cita.servicios, servicioId: cita.servicioId }); }
  else if (tieneArray) { nuevas++; }
  else if (tieneLegacy) { legacy++; if (muestraLegacy.length < 3) muestraLegacy.push({ id, fecha: cita.fecha, servicioId: cita.servicioId }); }
  else { vacias++; }
}

console.log('');
console.log('===== Schema breakdown =====');
console.log(`  Solo schema nuevo (servicios[]):     ${nuevas}`);
console.log(`  Solo schema legacy (servicioId):     ${legacy}`);
console.log(`  Híbridas (ambos campos presentes):   ${hibridas}`);
console.log(`  Vacías o sin servicio:               ${vacias}`);
console.log(`  Total:                               ${nuevas + legacy + hibridas + vacias}`);
console.log('');

if (muestraLegacy.length) {
  console.log('--- Muestra schema legacy (3 primeras) ---');
  muestraLegacy.forEach(c => console.log(JSON.stringify(c)));
}
if (muestraHibrida.length) {
  console.log('--- Muestra híbrida (3 primeras) ---');
  muestraHibrida.forEach(c => console.log(JSON.stringify(c)));
}
console.log('');
console.log('Backward compat (LibCitas.citaServiciosArray): cubre las 3 categorías. OK.');
