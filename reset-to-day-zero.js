// reset-to-day-zero.js
// Borra TODA la data operativa (citas, eventos, descuentos, clientes, waitlist) y
// deja el sistema listo para el primer día real de operación de Brenda.
//
// MANTIENE:
//   - Técnicas (Brenda + 3 placeholders) y comisiones
//   - Servicios y precios (catálogo de 47)
//   - Usuarios (Brenda + los que ya creó)
//   - Config de negocio (CLABE, banco, WhatsApp)
//   - Configuración de inversión ($300K + costos fijos)
//
// Para correrlo:
//   UPSTASH_REDIS_REST_URL="..." UPSTASH_REDIS_REST_TOKEN="..." node reset-to-day-zero.js
//
// Pide confirmación. Si quieres correrlo sin pregunta (CI), pasa --force.

import readline from 'readline';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function confirmar() {
  if (process.argv.includes('--force')) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => {
    rl.question('\nEsta acción borra TODAS las citas, clientes, cobros y descuentos.\n¿Estás SEGURO de resetear a día cero? (escribe "RESET" para confirmar): ', a => {
      rl.close();
      res(a.trim() === 'RESET');
    });
  });
}

async function borrarSet(setKey, itemKeyFn) {
  const ids = await redis.smembers(setKey);
  let count = 0;
  for (const id of ids) {
    await redis.del(itemKeyFn(id));
    count++;
  }
  await redis.del(setKey);
  return count;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   MERAKI POS — Reset a día cero                  ║');
  console.log('╚══════════════════════════════════════════════════╝');

  // Mostrar estado actual
  const counts = {
    citas: (await redis.smembers('mk:citas')).length,
    clientes: (await redis.smembers('mk:clientes')).length,
    eventos: (await redis.smembers('mk:eventos')).length,
    descuentos: (await redis.smembers('mk:descuentos')).length,
  };
  console.log('\nEstado actual:');
  console.log(`  Citas:       ${counts.citas}`);
  console.log(`  Clientes:    ${counts.clientes}`);
  console.log(`  Eventos:     ${counts.eventos}`);
  console.log(`  Descuentos:  ${counts.descuentos}`);

  if (counts.citas === 0 && counts.clientes === 0) {
    console.log('\n✓ El sistema YA está en día cero. Nada que hacer.');
    return;
  }

  const ok = await confirmar();
  if (!ok) {
    console.log('\nCancelado. No se borró nada.');
    return;
  }

  console.log('\nReseteando...\n');

  // 1. Citas + sus índices por fecha
  const citaIds = await redis.smembers('mk:citas');
  const fechasSet = new Set();
  for (const id of citaIds) {
    const c = await redis.get(`mk:cita:${id}`);
    if (c?.fecha) fechasSet.add(c.fecha);
    await redis.del(`mk:cita:${id}`);
  }
  for (const f of fechasSet) await redis.del(`mk:citas:fecha:${f}`);
  await redis.del('mk:citas');
  console.log(`  ✓ ${citaIds.length} citas eliminadas (${fechasSet.size} índices de fecha)`);

  // 2. Eventos
  const evtCount = await borrarSet('mk:eventos', id => `mk:evento:${id}`);
  console.log(`  ✓ ${evtCount} eventos eliminados`);

  // 3. Descuentos + índices por fecha
  const dscIds = await redis.smembers('mk:descuentos');
  const dscFechas = new Set();
  for (const id of dscIds) {
    const d = await redis.get(`mk:descuento:${id}`);
    if (d?.fecha) dscFechas.add(d.fecha);
    await redis.del(`mk:descuento:${id}`);
  }
  for (const f of dscFechas) await redis.del(`mk:descuentos:fecha:${f}`);
  await redis.del('mk:descuentos');
  console.log(`  ✓ ${dscIds.length} descuentos eliminados`);

  // 4. Clientes
  const cliCount = await borrarSet('mk:clientes', id => `mk:cliente:${id}`);
  console.log(`  ✓ ${cliCount} clientes eliminados`);

  // 5. Waitlist (limpia toda key con prefijo mk:waitlist:*)
  // Usamos scan para encontrar todas las llaves
  let cursor = 0, wlCount = 0;
  do {
    const r = await redis.scan(cursor, { match: 'mk:waitlist:*', count: 100 });
    cursor = Number(r[0]);
    for (const k of r[1] || []) { await redis.del(k); wlCount++; }
  } while (cursor !== 0);
  console.log(`  ✓ ${wlCount} entradas de waitlist eliminadas`);

  // 6. Aportaciones (resetea acumulado de socios pero deja el config inversión)
  const aprIds = await redis.smembers('mk:aportaciones');
  for (const id of aprIds) await redis.del(`mk:aportacion:${id}`);
  await redis.del('mk:aportaciones');
  console.log(`  ✓ ${aprIds.length} aportaciones eliminadas`);

  // 7. Login attempts cleanup (por si quedaron rastros)
  cursor = 0;
  let attemptsCleared = 0;
  do {
    const r = await redis.scan(cursor, { match: 'mk:loginattempts:*', count: 100 });
    cursor = Number(r[0]);
    for (const k of r[1] || []) { await redis.del(k); attemptsCleared++; }
  } while (cursor !== 0);
  if (attemptsCleared) console.log(`  ✓ ${attemptsCleared} contadores de login limpiados`);

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   ✓ DÍA CERO listo                               ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('\nMantenido:');
  const tecCount = (await redis.smembers('mk:tecnicas')).length;
  const svcCount = (await redis.smembers('mk:servicios')).length;
  const usrCount = (await redis.smembers('mk:usuarios')).length;
  const cfg = await redis.get('mk:config:negocio');
  const inv = await redis.get('mk:inversion');
  console.log(`  Técnicas:    ${tecCount}`);
  console.log(`  Servicios:   ${svcCount}`);
  console.log(`  Usuarios:    ${usrCount} (Brenda + creados)`);
  console.log(`  CLABE:       ${cfg?.clabe ? '✓ configurada' : '— vacía (Brenda debe capturarla)'}`);
  console.log(`  Inversión:   $${(inv?.total || 0).toLocaleString('es-MX')} configurada`);
  console.log('\nBrenda puede empezar a operar normalmente desde la siguiente sesión.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
