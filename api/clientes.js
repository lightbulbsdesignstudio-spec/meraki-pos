import redis, { keys, newId } from '../lib/redis.js';
import parseBody from '../lib/parseBody.js';
import { requireAuth } from '../lib/auth.js';
import { logError, logAudit } from '../lib/observability.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  // Lectura y alta: cualquier sesión. Edición y borrado: solo admin/socio.
  const rolesRequeridos = ['PUT','DELETE'].includes(req.method) ? ['admin','socio'] : null;
  const blocked = await requireAuth(req, res, rolesRequeridos);
  if (blocked) return;

  try {
    if (req.method === 'GET') {
      const ids = await redis.smembers(keys.clientes());
      if (!ids.length) return res.json({ ok: true, data: [] });
      const items = await Promise.all(ids.map(id => redis.get(keys.cliente(id))));
      return res.json({ ok: true, data: items.filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) });
    }

    const body = await parseBody(req);

    if (req.method === 'POST') {
      const id = newId();
      const cliente = {
        id,
        nombre: body.nombre,
        tel: body.tel || '',
        email: body.email || '',
        colonia: body.colonia || '',        // geospatial/marketing
        cp: body.cp || '',                  // geospatial/marketing
        canalOrigen: body.canalOrigen || 'salon', // salon/instagram/facebook/referido/google
        referidoPor: body.referidoPor || '',       // clienteId quien refirió
        notas: body.notas || '',
        creadoEn: new Date().toISOString(),
      };
      await redis.set(keys.cliente(id), cliente);
      await redis.sadd(keys.clientes(), id);
      await logAudit({ actor: req.user, action: 'cliente.create', resource: 'cliente', resourceId: id, after: cliente });
      return res.json({ ok: true, data: cliente });
    }

    if (req.method === 'PUT') {
      const existing = await redis.get(keys.cliente(body.id));
      if (!existing) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
      const updated = {
        ...existing,
        nombre: body.nombre,
        tel: body.tel || '',
        email: body.email || '',
        colonia: body.colonia || existing.colonia || '',
        cp: body.cp || existing.cp || '',
        canalOrigen: body.canalOrigen || existing.canalOrigen || 'salon',
        referidoPor: body.referidoPor || existing.referidoPor || '',
        notas: body.notas || '',
      };
      await redis.set(keys.cliente(body.id), updated);
      await logAudit({ actor: req.user, action: 'cliente.update', resource: 'cliente', resourceId: body.id, before: existing, after: updated });
      return res.json({ ok: true, data: updated });
    }

    if (req.method === 'DELETE') {
      const existing = await redis.get(keys.cliente(body.id));
      await redis.del(keys.cliente(body.id));
      await redis.srem(keys.clientes(), body.id);
      await logAudit({ actor: req.user, action: 'cliente.delete', resource: 'cliente', resourceId: body.id, before: existing });
      return res.json({ ok: true });
    }

    res.status(405).json({ ok: false, error: 'Método no permitido' });
  } catch (e) {
    await logError('api/clientes', e, { method: req.method });
    res.status(500).json({ ok: false, error: e.message });
  }
}
