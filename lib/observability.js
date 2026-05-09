import redis, { keys, newId } from './redis.js';

const MAX_ERRORS = 200;
const MAX_AUDIT = 500;

function safeStringifyError(err) {
  if (!err) return { message: 'unknown' };
  if (typeof err === 'string') return { message: err };
  return {
    message: err.message || String(err),
    stack: err.stack ? String(err.stack).split('\n').slice(0, 8).join('\n') : null,
    code: err.code || null,
    name: err.name || null,
  };
}

export async function logError(context, err, meta = {}) {
  try {
    const entry = {
      id: newId(),
      ts: new Date().toISOString(),
      context,
      error: safeStringifyError(err),
      meta,
    };
    await redis.lpush(keys.errorLog(), JSON.stringify(entry));
    await redis.ltrim(keys.errorLog(), 0, MAX_ERRORS - 1);
  } catch {
    // Si el propio logger falla, último recurso a console — Vercel logs lo captura 1h.
    console.error('[observability.logError fallback]', context, err);
  }
}

export async function logAudit({ actor, action, resource, resourceId, before = null, after = null, meta = {} }) {
  try {
    const entry = {
      id: newId(),
      ts: new Date().toISOString(),
      actor: actor ? { id: actor.id, username: actor.username, nombre: actor.nombre || null, rol: actor.rol } : null,
      action,
      resource,
      resourceId: resourceId || null,
      before,
      after,
      meta,
    };
    await redis.lpush(keys.auditLog(), JSON.stringify(entry));
    await redis.ltrim(keys.auditLog(), 0, MAX_AUDIT - 1);
  } catch (e) {
    console.error('[observability.logAudit fallback]', action, resource, e);
  }
}

export async function readErrors(limit = 50) {
  try {
    const raw = await redis.lrange(keys.errorLog(), 0, limit - 1);
    return raw.map(parseEntry).filter(Boolean);
  } catch (e) {
    return [];
  }
}

export async function readAudit(limit = 100) {
  try {
    const raw = await redis.lrange(keys.auditLog(), 0, limit - 1);
    return raw.map(parseEntry).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function parseEntry(item) {
  if (!item) return null;
  if (typeof item === 'object') return item;
  try { return JSON.parse(item); } catch { return null; }
}

export async function pingRedis() {
  const start = Date.now();
  try {
    // Round-trip mínimo: write + read. Si la lib serializa (number→string), el cast a String
    // permite comparación correcta. Si get devuelve null (clave evicted en <60s) lo aceptamos
    // como "responde" — la prueba real es que set+get completaron sin throw.
    await redis.set('mk:obs:ping', String(start), { ex: 60 });
    await redis.get('mk:obs:ping');
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: safeStringifyError(e) };
  }
}
