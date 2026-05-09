import redis, { keys } from '../lib/redis.js';
import { requireAuth } from '../lib/auth.js';
import { pingRedis, readErrors, readAudit, logError } from '../lib/observability.js';

async function citaSchemaBreakdown() {
  const ids = await redis.smembers(keys.citas());
  let nuevas = 0, legacy = 0, hibridas = 0, vacias = 0;
  for (const id of ids) {
    const c = await redis.get(keys.cita(id));
    if (!c) { vacias++; continue; }
    const tieneArray = Array.isArray(c.servicios) && c.servicios.length > 0;
    const tieneLegacy = !!c.servicioId;
    if (tieneArray && tieneLegacy) hibridas++;
    else if (tieneArray) nuevas++;
    else if (tieneLegacy) legacy++;
    else vacias++;
  }
  return { total: ids.length, nuevas, legacy, hibridas, vacias };
}

const STARTED_AT = new Date().toISOString();
const VERSION = process.env.VERCEL_GIT_COMMIT_SHA || 'dev';
const REGION = process.env.VERCEL_REGION || 'local';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Método no permitido' });

  const blocked = await requireAuth(req, res, ['admin']);
  if (blocked) return;

  try {
    const errorsLimit = Math.min(Number(req.query.errors) || 50, 200);
    const auditLimit = Math.min(Number(req.query.audit) || 100, 500);

    const wantSchema = req.query.schema === '1';
    const [ping, errors, audit, schema] = await Promise.all([
      pingRedis(),
      readErrors(errorsLimit),
      readAudit(auditLimit),
      wantSchema ? citaSchemaBreakdown() : Promise.resolve(null),
    ]);

    return res.json({
      ok: true,
      data: {
        service: {
          name: 'meraki-pos',
          version: VERSION,
          region: REGION,
          startedAt: STARTED_AT,
          now: new Date().toISOString(),
          healthy: ping.ok === true,
        },
        redis: ping,
        errors: { count: errors.length, items: errors },
        audit: { count: audit.length, items: audit },
        ...(schema ? { schema } : {}),
      },
    });
  } catch (e) {
    await logError('api/admin-status', e, { method: req.method });
    return res.status(500).json({ ok: false, error: e.message });
  }
}
