// smoke-e2e.mjs — Simula los 3 roles ejecutando el flujo completo del POS contra producción.
// Requiere que existan las cuentas admin_test, socio_test, empleada_test con flag is_test (creadas via /config.html).
//
// Uso:
//   BASE_URL=https://meraki-pos.vercel.app \
//   ADMIN_TEST_PASS=xxx SOCIO_TEST_PASS=xxx EMPLEADA_TEST_PASS=xxx \
//   node scripts/smoke-e2e.mjs
//
// Imprime checklist con ✓/✗ por paso. Exit 0 si todo pasa, 1 si falla algún paso crítico.

const BASE = process.env.BASE_URL || 'https://meraki-pos.vercel.app';

const roles = [
  { user: 'admin_test', pass: process.env.ADMIN_TEST_PASS, esperaAcceso: ['agenda','clientes','reportes','socios','config','admin-status'] },
  { user: 'socio_test', pass: process.env.SOCIO_TEST_PASS, esperaAcceso: ['agenda','clientes','reportes','socios'] },
  { user: 'empleada_test', pass: process.env.EMPLEADA_TEST_PASS, esperaAcceso: ['agenda','clientes','reportes'] },
];

let fails = 0;
const log = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };

async function login(user, pass) {
  const r = await fetch(`${BASE}/api/auth?action=login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  const setCookie = r.headers.get('set-cookie') || '';
  const m = setCookie.match(/mk_session=([^;]+)/);
  if (!r.ok || !m) throw new Error(`login failed para ${user}: HTTP ${r.status}`);
  return m[1];
}

function authedFetch(token) {
  return (path, init = {}) => fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), 'Cookie': `mk_session=${token}`, 'Content-Type': 'application/json' },
  });
}

async function corridaRol(rol) {
  console.log(`\n=== ${rol.user} ===`);
  if (!rol.pass) { log(false, `${rol.user} sin password en env (skip)`); return; }
  let token;
  try { token = await login(rol.user, rol.pass); log(true, `login ${rol.user}`); }
  catch (e) { log(false, `login ${rol.user}: ${e.message}`); return; }
  const f = authedFetch(token);

  // 1. /api/auth?action=me debe devolver el usuario
  const me = await f('/api/auth?action=me').then(r => r.json());
  log(me.ok && me.data.username === rol.user, `me devuelve ${rol.user}`);

  // 2. GET citas (todos los roles deben poder)
  const citas = await f('/api/citas?fecha=' + new Date().toISOString().slice(0,10)).then(r => r.json());
  log(citas.ok, 'GET /api/citas (lectura)');

  // 3. GET clientes
  const clientes = await f('/api/clientes').then(r => r.json());
  log(clientes.ok, 'GET /api/clientes (lectura)');

  // 4. POST clientes — todos pueden crear
  const newCli = await f('/api/clientes', { method: 'POST', body: JSON.stringify({ nombre: `Smoke ${rol.user} ${Date.now()}`, tel: '0000000000' }) }).then(r => r.json());
  log(newCli.ok, 'POST /api/clientes (crear cliente)');
  const cliId = newCli.data?.id;

  // 5. DELETE clientes — solo admin/socio
  const delCli = await f('/api/clientes', { method: 'DELETE', body: JSON.stringify({ id: cliId }) });
  const debePoder = ['admin','socio'].some(r => rol.user.startsWith(r));
  log(debePoder ? delCli.ok : delCli.status === 403, `DELETE /api/clientes ${debePoder ? 'permitido' : 'bloqueado'}`);
  // Cleanup si no se borró pero el rol no debería borrar
  if (!debePoder && delCli.status === 403) {
    // Si la empleada no pudo borrar, limpiamos con admin después
  }

  // 6. /api/status?full=1 — solo admin
  const statusFull = await f('/api/status?full=1');
  if (rol.user.startsWith('admin')) log(statusFull.ok, '/api/status?full=1 accesible para admin');
  else log(statusFull.status === 403, `/api/status?full=1 bloqueado para ${rol.user.split('_')[0]}`);

  // 7. /api/status (público) — debe responder sin auth
  const health = await fetch(`${BASE}/api/status`).then(r => r.json());
  log(health.ok && health.redis.ok, '/api/status (público) responde OK');

  // Logout
  await f('/api/auth?action=logout', { method: 'POST' });
}

(async () => {
  console.log(`Smoke E2E contra ${BASE}\n`);
  for (const rol of roles) await corridaRol(rol);

  // Cleanup: eliminar clientes Smoke como admin
  if (process.env.ADMIN_TEST_PASS) {
    try {
      const adminTok = await login('admin_test', process.env.ADMIN_TEST_PASS);
      const f = authedFetch(adminTok);
      const allCli = await f('/api/clientes').then(r => r.json());
      const smokes = (allCli.data || []).filter(c => c.nombre?.startsWith('Smoke '));
      for (const c of smokes) await f('/api/clientes', { method: 'DELETE', body: JSON.stringify({ id: c.id }) });
      console.log(`\nCleanup: ${smokes.length} clientes Smoke borrados.`);
    } catch (e) { console.error('Cleanup falló:', e.message); }
  }

  console.log(`\n${fails === 0 ? '✅ SMOKE PASS' : `❌ SMOKE FAIL — ${fails} paso(s) fallaron`}`);
  process.exit(fails === 0 ? 0 : 1);
})();
